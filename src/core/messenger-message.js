import {messengerSelfIdentity} from "./messenger-account.js";
import {messengerMedia} from './messenger-media.js';
import {resourceSource} from './resources.js';
import {messengerMessageId} from './messenger-id.js';
import {messengerDetails} from './messenger-conversation.js';
// The 28px avatar button is inside the message node in the observed Facebook layout.
// Do not use an arbitrary image alt or the conversation title as the sender name.
function senderIdentity(node, shortName) {
  if (shortName === 'Bạn' || shortName === 'You') return messengerSelfIdentity(node.ownerDocument) || {name:shortName,avatar:''};
  const candidates = Array.from(node.querySelectorAll?.('img') || []).filter(image => {
    const name = (image.alt || '').trim();
    return image.parentElement?.getAttribute('role') === 'button' &&
      Number(image.width) === 28 && Number(image.height) === 28 &&
      name.length <= 100 && (name === shortName || name.startsWith(shortName + ' '));
  });
  const names = [...new Set(candidates.map(image => image.alt.trim()))];
  return names.length === 1 ? {name:names[0],avatar:resourceSource(candidates[0].currentSrc || candidates[0].src,false,'facebook')} : {name:shortName,avatar:''};
}

export function messengerMessages(nodes, conversation) {
  const messages = new Map();
  const detailsCache = new WeakMap();
  for (const node of nodes) {
    const id = messengerMessageId(node.getAttribute('data-message-id') || '');
    if (!id) continue;
    // The focused message can be rendered in a portal outside the log. Its
    // empty timeline placeholder still determines the original list position.
    if (!messages.has(id)) messages.set(id, null);
    const message = messengerMessage(node, conversation, detailsCache);
    if (message) messages.set(id, message);
  }
  return [...messages.values()].filter(Boolean);
}

// Parse only explicitly labelled, rendered message nodes. No page models or keys.
export function messengerMessage(node, conversation, detailsCache) {
  if (!conversation || conversation.platform !== 'facebook') return null;
  const messageId = node.getAttribute('data-message-id');
  if (!messageId || messageId.length > 160) return null;
  const label = node.getAttribute('aria-label') || '';
  // Facebook E2EE can replace a message node and assign a different ID when
  // the message is recalled. The visible time and sender remain stable.
  const fingerprintMatch = /^(?:Lúc|At) ([^,]+(?:, \d{4})?), ([^:]+?)(?::|$)/.exec(label);
  const messageFingerprint = fingerprintMatch
    ? `${fingerprintMatch[1]}\u0000${fingerprintMatch[2].trim()}`.slice(0, 220)
    : '';
  const attachments = messengerMedia(node);
  const details = messengerDetails(node, detailsCache);

  // Observed VI / EN layout: Lúc / At <date>, <sender>: <content>.
  // Keep this adapter conservative until each additional locale is verified.
  const match = /^(?:Lúc|At) ([^,]+(?:, \d{4})?), ([^:]+): ([\s\S]*)$/.exec(label);
  if (!match) {
    // Recalled nodes lose the content suffix. Require a matching system body;
    // quoting a deletion sentence in an ordinary message remains a snapshot.
    const recalled = /^(Lúc|At) ([^,]+(?:, \d{4})?), ([^:]+)$/.exec(label);
    const sender = recalled?.[3]?.trim();
    const english = recalled?.[1] === 'At';
    const marker = english ? `${sender} deleted a message` : `${sender} đã xóa một tin nhắn`;
    const heading = english ? `${sender} sent` : `${sender} đã gửi`;
    const lines = (node.innerText || '').split('\n').map(line=>line.trim()).filter(Boolean);
    if (sender && lines.includes(marker) && lines.every(line=>line === heading || line === marker || line === sender)) {
      return {platform:'facebook',event:'recall',conversationId:conversation.conversationId,
        messageId,messageFingerprint,...details,sender:senderIdentity(node,sender).name,senderAvatar:senderIdentity(node,sender).avatar,isSelf:sender === 'Bạn' || sender === 'You',text:'',kind:'other',source:'dom',attachments:[]};
    }
    if(sender && attachments.length) return {
      platform:'facebook',event:'snapshot',conversationId:conversation.conversationId,messageId,
      messageFingerprint,...details,sender:senderIdentity(node,sender).name,
      senderAvatar:senderIdentity(node,sender).avatar,isSelf:sender==='Bạn'||sender==='You',
      text:'',kind:attachments.some(a=>a.kind==='video')?'video':attachments[0].kind,source:'dom',attachments,
    };
    return null;
  }
  const sender = match[2].trim();
  const text = match[3];
  if (!text || text.length > 12000) return null;
  return {
    platform:'facebook', event:'snapshot',
    conversationId:conversation.conversationId, ...details, messageId, messageFingerprint,
    sender:senderIdentity(node,sender).name,senderAvatar:senderIdentity(node,sender).avatar, isSelf:sender === 'Bạn' || sender === 'You',
    text, kind:attachments.length ? (attachments.some(a=>a.kind==='video')?'video':attachments[0].kind) : 'text', source:'dom', attachments,
  };
}
