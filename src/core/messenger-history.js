import {messengerMessageId} from './messenger-id.js';

// Correlate a visible replacement within the same conversation and timeline
// position. A time/sender label alone is shared by many legitimate messages.
export function createMessengerHistory() {
  let conversationId = '';
  let previous = [];
  const missing = new Map();
  const replacements = new Map();

  function reset() {
    conversationId = '';
    previous = [];
    missing.clear();
    replacements.clear();
  }

  function reconcile(events, nextConversationId, now = Date.now(), visibleMessageIds = []) {
    if (conversationId !== nextConversationId) {
      reset();
      conversationId = nextConversationId;
    }
    const parsed = new Map(events.map(event => [messengerMessageId(event.messageId), event]));
    const previousById = new Map(previous.map(event => [messengerMessageId(event.messageId), event]));
    const orderedIds = [...new Set([...visibleMessageIds.map(messengerMessageId), ...parsed.keys()])];
    // Opening message actions can leave an empty timeline slot while its media
    // is temporarily rendered outside the message node. Keep the last parsed
    // event only for IDs whose actual DOM slots are still present.
    const current = orderedIds.map(id => parsed.get(id) || previousById.get(id)).filter(Boolean);
    const currentIds = new Set(current.map(event => messengerMessageId(event.messageId)));
    const previousIds = new Set(previous.map(event => messengerMessageId(event.messageId)));
    const shared = new Set([...previousIds].filter(id => currentIds.has(id)));
    const position = (rows, index, anchors) => {
      const before = rows.slice(0, index).reverse().find(event => anchors.has(messengerMessageId(event.messageId)));
      const after = rows.slice(index + 1).find(event => anchors.has(messengerMessageId(event.messageId)));
      return [before ? messengerMessageId(before.messageId) : '', after ? messengerMessageId(after.messageId) : ''];
    };

    for (const [index, event] of previous.entries()) {
      const id = messengerMessageId(event.messageId);
      if (event.event === 'snapshot' && !currentIds.has(id)) {
        const [before, after] = position(previous, index, shared);
        missing.set(id, {event, before, after, at: now, alone: previous.length === 1});
      }
    }
    for (const [id, item] of missing) {
      if (now - item.at > 10000 || currentIds.has(id)) missing.delete(id);
    }

    const result = current.map((event, index) => {
      const id = messengerMessageId(event.messageId);
      if (event.event !== 'recall') return event;
      if (replacements.has(id)) return {...event, replacesMessageId: replacements.get(id)};
      if (previousIds.has(id) || !event.messageFingerprint) return event;
      const [before, after] = position(current, index, shared);
      const candidates = [...missing.entries()].filter(([, item]) =>
        item.event.messageFingerprint === event.messageFingerprint &&
        item.event.isSelf === event.isSelf &&
        item.before === before && item.after === after &&
        (before || after || (item.alone && current.length === 1)));
      const competing = current.filter(item => item.event === 'recall' &&
        !previousIds.has(messengerMessageId(item.messageId)) &&
        item.messageFingerprint === event.messageFingerprint);
      if (candidates.length !== 1 || competing.length !== 1) return event;
      const originalId = candidates[0][0];
      missing.delete(originalId);
      replacements.set(id, originalId);
      return {...event, replacesMessageId: originalId};
    });
    previous = current;
    while (missing.size > 300) missing.delete(missing.keys().next().value);
    while (replacements.size > 1500) replacements.delete(replacements.keys().next().value);
    return result;
  }

  return {reconcile, reset};
}
