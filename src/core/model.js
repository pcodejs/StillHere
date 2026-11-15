import {conversationAllowed} from './conversation-rules.js';
import {normalizeAttachments, resourceSource} from './resources.js';
import {recordPlatform, PLATFORMS} from './platforms.js';
import {messengerMessageId} from './messenger-id.js';
export const DEFAULT_SETTINGS = Object.freeze({ consent: false, enabled: false, retentionDays: 30, cacheMedia:false, platforms:['zalo','facebook'] });
export const LIMIT = 1500;
export const MAX_BYTES = 4_000_000;
export const DAY = 86_400_000;
export const ADAPTER_VERSION = 'zalo-render-2026-11-11';
export function str(v, max = 160) {
  if (typeof v === 'number' && !Number.isSafeInteger(v)) return '';
  return typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '';
}
// Zalo can expose the same rendered group message with and without this prefix.
export function zaloMessageId(value) {
  const id = str(value);
  return /^grp\d+$/.test(id) ? id.slice(3) : id;
}
export function avatarSource(value, platform = 'zalo') {
  if(typeof value!=='string')return '';
  if(value.length<=18000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))return value;
  if(platform === 'facebook')return resourceSource(value,false,'facebook');
  if(value.length>2048)return '';
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !url.username && !url.password && !url.port && /^(?:[a-z0-9-]+\.)*(?:zadn|zdn)\.vn$/.test(url.hostname) ? url.href : '';
  } catch {return '';}
}
export function normalizeEvent(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  const platform = input.platform === undefined ? 'zalo' : input.platform;
  if (!Object.hasOwn(PLATFORMS, platform)) return null;
  const conversationId = str(input.conversationId);
  const rawMessageId = str(input.messageId);
  const messageId = platform==='facebook'?messengerMessageId(rawMessageId):zaloMessageId(rawMessageId);
  const clientId = str(input.clientId);
  if (!conversationId || (!messageId && !clientId)) return null;
  if (!['snapshot', 'recall'].includes(input.event)) return null;
  const text = str(input.text, 12000);
  const kind = ['text', 'image', 'gif', 'sticker', 'video', 'audio', 'file', 'other'].includes(input.kind) ? input.kind : 'other';
  if (input.event === 'snapshot' && !text && kind === 'text') return null;
  return {
    event: input.event, platform, conversationId, messageId, clientId,
    accountName: str(input.accountName,100),
    accountScope: typeof input.accountScope==='string'&&/^[a-f0-9]{64}$/.test(input.accountScope)?input.accountScope:'',
    replacesMessageId: platform === 'facebook' && input.event === 'recall' ? messengerMessageId(str(input.replacesMessageId)) : '',
    conversationName: str(input.conversationName, 100) || `Hội thoại ${conversationId}`,
    conversationType: ['group', 'personal'].includes(input.conversationType) ? input.conversationType : 'unknown',
    sender: str(input.sender, 100) || 'Chưa rõ người gửi',
    senderAvatar:avatarSource(input.senderAvatar,platform),conversationAvatar:avatarSource(input.conversationAvatar,platform),
    conversationAvatars:platform==='facebook'&&Array.isArray(input.conversationAvatars)?[...new Set(input.conversationAvatars.slice(0,2).map(value=>avatarSource(value,platform)).filter(Boolean))]:[],
    isSelf: input.isSelf === true, text, kind, attachments:normalizeAttachments(input.attachments,platform),
    // Resource references are restricted to Zalo CDN and decoded page blobs.
    // Exclude cookies, contacts, encryption keys, raw models and quoted messages.
    sentAt: Number.isFinite(input.sentAt) && input.sentAt > 0 && input.sentAt <= now + DAY ? input.sentAt : now,
    source: ['dom','render-preview'].includes(input.source) ? input.source : 'render-model',
  };
}
export function cleanRecords(records, settings, now = Date.now()) {
  const cutoff = now - (settings.retentionDays === 7 ? 7 : 30) * DAY;
  const byMessage=new Map();
  const kept=[];
  for(const record of records.filter(r=>r.firstSeen>cutoff).sort((a,b)=>b.firstSeen-a.firstSeen)) {
    if(!record.messageId){kept.push(record);continue;}
    const platform=recordPlatform(record);
    const messageId=platform==='facebook'?messengerMessageId(record.messageId):zaloMessageId(record.messageId);
    const key=JSON.stringify([platform,record.accountScope||'',record.conversationId,messageId,platform==='zalo'?record.isSelf===true:null]);
    const entry=byMessage.get(key);
    const existing=entry?.record;
    if(!existing){
      const normalized={...record,messageId};
      byMessage.set(key,{record:normalized,prefixed:record.messageId!==messageId});kept.push(normalized);continue;
    }
    if(platform==='zalo' && !entry.prefixed && record.messageId===messageId) {
      kept.push(record);
      continue;
    }
    if(platform==='zalo' && ((existing.note && record.note && existing.note!==record.note) ||
      (existing.hasOriginal && record.hasOriginal && (existing.text!==record.text || existing.kind!==record.kind)))) {
      kept.push({...record,messageId});
      continue;
    }
    if(!existing.hasOriginal && record.hasOriginal){
      existing.text=record.text;existing.kind=record.kind;
      existing.attachments=record.attachments;existing.hasOriginal=true;
    } else if(!existing.attachments?.length && record.attachments?.length)existing.attachments=record.attachments;
    existing.senderAvatar ||= record.senderAvatar;
    existing.conversationAvatar ||= record.conversationAvatar;
    if(!existing.conversationAvatars?.length && record.conversationAvatars?.length)existing.conversationAvatars=record.conversationAvatars;
    if(platform==='zalo') {
      entry.prefixed ||= record.messageId!==messageId;
      existing.pinned ||= record.pinned===true;
      existing.note ||= record.note || '';
      existing.clientId ||= record.clientId;
    }
    existing.firstSeen=Math.min(existing.firstSeen,record.firstSeen);
    if(record.recalledAt)existing.recalledAt=existing.recalledAt?Math.min(existing.recalledAt,record.recalledAt):record.recalledAt;
  }
  let bytes = 0;
  return kept.filter(r=>r.firstSeen>cutoff).slice(0,LIMIT).filter(r => { bytes += JSON.stringify(r).length * 3; return bytes <= MAX_BYTES; });
}
export function applyEvents(records, inputs, settings, now = Date.now()) {
  let next = cleanRecords(records, settings, now);
  if (!settings.consent || !settings.enabled) return next;
  for (const input of inputs.slice(0, 300)) {
    const e = normalizeEvent(input, now);
    if (!e || !conversationAllowed(settings,e)) continue;
    const candidates = next.filter(r => recordPlatform(r) === e.platform && (r.accountScope||'') === e.accountScope && r.conversationId === e.conversationId);
    const matchesId = (item, id) => item.messageId === id || (e.platform === 'facebook' && item.messageAliases?.includes(id));
    let record = e.messageId && candidates.find(r => matchesId(r, e.messageId));
    if (e.replacesMessageId && (!record || !record.hasOriginal)) {
      const originals = candidates.filter(item => matchesId(item, e.replacesMessageId) && item.hasOriginal && item.isSelf === e.isSelf);
      if (originals.length === 1) {
        const original = originals[0];
        if (record && record !== original) next = next.filter(item => item !== record);
        record = original;
        record.messageAliases = [...new Set([...(record.messageAliases || []), e.messageId])].filter(id => id !== record.messageId).slice(-8);
      }
    }
    if (!record && e.clientId) {
      const matches = candidates.filter(r => r.clientId === e.clientId);
      // Client ID is a fallback only when unambiguous and server IDs do not conflict.
      if (matches.length === 1 && (!matches[0].messageId || !e.messageId)) record = matches[0];
    }
    if (record) {
      // Upgrade a self-sender placeholder on rescans, including recalled Zalo messages.
      if (record.isSelf && e.isSelf && ['Bạn','You'].includes(record.sender) && input.sender && !['Bạn','You','Chưa rõ người gửi'].includes(e.sender)) record.sender=e.sender;
      if (e.event === 'recall') {
        record.recalledAt ||= now;
        if(e.platform==='facebook' && input.sender && (record.sender==='Chưa rõ người gửi' || (record.isSelf && e.isSelf && ['Bạn','You'].includes(record.sender) && !['Bạn','You'].includes(e.sender)) || e.sender.startsWith(record.sender+' ')))record.sender=e.sender;
        if(e.senderAvatar)record.senderAvatar=e.senderAvatar;
        if(e.conversationAvatar){record.conversationAvatar=e.conversationAvatar;record.conversationAvatars=[];}
        if(e.conversationAvatars.length){record.conversationAvatars=e.conversationAvatars;record.conversationAvatar='';}
        if(input.conversationName)record.conversationName=e.conversationName;
        if(record.conversationType==='unknown'&&e.conversationType!=='unknown')record.conversationType=e.conversationType;
      }
      else if (record.recalledAt || (e.source==='render-preview'&&record.hasOriginal)) {
        // A later scan can discover an avatar without changing the archived text.
        if (e.senderAvatar) record.senderAvatar=e.senderAvatar;
        if(e.conversationAvatar){record.conversationAvatar=e.conversationAvatar;record.conversationAvatars=[];}
        if(e.conversationAvatars.length){record.conversationAvatars=e.conversationAvatars;record.conversationAvatar='';}
        if (input.conversationName) record.conversationName=e.conversationName;
      }
      else if (!record.recalledAt) {
        const previousAttachments=record.attachments||[];
        const keepDecoded=previousAttachments.some(item=>item.source.startsWith('blob:'))&&!e.attachments.some(item=>item.source.startsWith('blob:'));
        const keepOriginal=previousAttachments.some(item=>!item.previewOnly) && e.attachments.length>0 && e.attachments.every(item=>item.previewOnly);
        const preserve=keepDecoded||keepOriginal||!e.attachments.length;
        const attachments=preserve?previousAttachments:e.attachments;
        if(preserve && attachments.length)e.kind=record.kind;
        const sender=(record.isSelf && e.isSelf && ['Bạn','You'].includes(e.sender) && !['Bạn','You'].includes(record.sender)) || e.platform==='facebook' && (record.sender.startsWith(e.sender+' ') || (record.isSelf && e.isSelf && ['Bạn','You'].includes(e.sender) && !['Bạn','You'].includes(record.sender)) || (!input.sender && record.sender))?record.sender:e.sender;
        Object.assign(record, e, {messageId:e.messageId || record.messageId, clientId:e.clientId || record.clientId, sender, senderAvatar:e.senderAvatar||record.senderAvatar,conversationAvatar:e.conversationAvatar||record.conversationAvatar,conversationAvatars:e.conversationAvatars.length?e.conversationAvatars:(e.conversationAvatar?[]:record.conversationAvatars||[]),conversationType:e.conversationType==='unknown'?record.conversationType:e.conversationType,conversationName:input.conversationName?e.conversationName:record.conversationName,attachments,hasOriginal:true});
      }
    } else {
      next.push({ ...e, id: crypto.randomUUID(), firstSeen: now, hasOriginal: e.event === 'snapshot', recalledAt: e.event === 'recall' ? now : null });
    }
  }
  return cleanRecords(next, settings, now);
}
export function filterRecords(records, {query='', type='all', who='all', kind='all', pinnedOnly=false, sender='', account='all', from='', to=''} = {}) {
  const fold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
  const q = fold(query.trim());
  const dateBoundary=(value,end=false)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d);
    if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return null;
    if(end)date.setDate(date.getDate()+1);
    return date.getTime();
  };
  const start=dateBoundary(from),end=dateBoundary(to,true);

  return records.filter(r => r.recalledAt && (account==='all'||(r.accountScope||'legacy')===account) && (!sender || r.sender===sender) && (start===null||r.recalledAt>=start) && (end===null||r.recalledAt<end) && (!pinnedOnly || r.pinned) && (type === 'all' || r.conversationType === type) &&
    (who === 'all' || (who === 'self' ? r.isSelf : !r.isSelf)) &&
    (kind === 'all' || (kind === 'media' ? ['image','gif','sticker','video','audio','file'].includes(r.kind) : r.kind === kind)) &&
    (!q || fold([r.text,r.sender,r.conversationName,r.note].join(' ')).includes(q))).sort((a,b) => b.recalledAt-a.recalledAt);
}
