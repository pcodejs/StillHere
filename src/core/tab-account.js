import {accountSession} from './account-session.js';
export function tabAccountKey(sender){
 if(!Number.isInteger(sender?.tab?.id)||typeof sender.documentId!=='string'||!sender.documentId)throw Error('Missing tab document');
 return 'tab-account:'+sender.tab.id+':'+sender.documentId;
}
export function observedTabAccount(previous,health){
 const next=accountSession(previous,health);
 if(next.locked)return next.pendingAccount;
 return next.account||previous||null;
}
export function isIdentityEnrichment(previous,next){
 if(!next?.id&&!next?.name)return false;
 if(!previous?.id&&!previous?.name)return true;
 return !previous.id&&!!next.id&&!!previous.name&&previous.name===next.name;
}
export function resolveAccountAliases(records,aliases){
  const affected = new Set();
  const resolved = records.map(record => {
    let scope = record.accountScope;
    let name = record.accountName;
    const seen = new Set();
    while (scope && aliases?.[scope] && !seen.has(scope)) {
      seen.add(scope);
      const next = aliases[scope];
      if (!/^[a-f0-9]{64}$/.test(next.scope)) break;
      scope = next.scope;
      name = next.name || name;
    }
    if (scope === record.accountScope && name === record.accountName) return record;
    affected.add(scope);
    return {...record, accountScope: scope, accountName: name};
  });
  if (!affected.size) return resolved;
  const merged = [];
  const byMessage = new Map();
  for (const record of resolved) {
    // Settings entries and pending events also pass through this helper.
    // Only persisted messages can be coalesced after a scope transition.
    if (!affected.has(record.accountScope) || typeof record.hasOriginal !== 'boolean' || !record.messageId) {
      merged.push(record);
      continue;
    }
    const key = JSON.stringify([record.platform || 'zalo', record.accountScope,
      record.conversationId, record.messageId, record.isSelf === true]);
    const index = byMessage.get(key);
    const previous = index === undefined ? null : merged[index];
    if (!previous) {
      byMessage.set(key, merged.length);
      merged.push(record);
      continue;
    }
    // Preserve separate records when merging would discard distinct private content.
    if ((previous.note && record.note && previous.note !== record.note) ||
      (previous.hasOriginal && record.hasOriginal && previous.text !== record.text)) {
      merged.push(record);
      continue;
    }
    const original = previous.hasOriginal ? previous : record.hasOriginal ? record : previous;
    const recalled = [previous.recalledAt, record.recalledAt].filter(Number.isFinite);
    merged[index] = {
      ...previous, ...record, ...original,
      firstSeen: Math.min(previous.firstSeen, record.firstSeen),
      recalledAt: recalled.length ? Math.min(...recalled) : null,
      senderAvatar: record.senderAvatar || previous.senderAvatar,
      conversationAvatar: record.conversationAvatar || previous.conversationAvatar,
      conversationAvatars: record.conversationAvatars?.length ? record.conversationAvatars : previous.conversationAvatars,
      messageAliases: [...new Set([...(previous.messageAliases || []), ...(record.messageAliases || [])])].slice(-8),
      pinned: previous.pinned === true || record.pinned === true,
      note: previous.note || record.note || '',
    };
  }
  return merged;
}

// A reader upgrade can first learn the stable account ID after Chrome has
// discarded the previous tab identity. Equal names are insufficient. Require
// a previously archived own message with both exact server and client IDs.
export function recoverNameAccountAlias(records,events,candidate){
  if (candidate?.platform !== 'zalo' || !candidate.name ||
    !/^[a-f0-9]{64}$/.test(candidate.from) || !/^[a-f0-9]{64}$/.test(candidate.scope) ||
    candidate.from === candidate.scope) return null;
  const old = records.filter(record =>
    (record.platform || 'zalo') === 'zalo' && record.accountScope === candidate.from &&
    record.accountName === candidate.name && record.isSelf && record.messageId && record.clientId);
  const proven = events.some(event =>
    event.platform === 'zalo' && event.accountScope === candidate.scope &&
    event.accountName === candidate.name && event.isSelf &&
    old.some(record => record.conversationId === event.conversationId &&
      record.messageId === event.messageId && record.clientId === event.clientId));
  return proven ? {from: candidate.from, scope: candidate.scope, name: candidate.name} : null;
}
