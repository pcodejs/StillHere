import {normalizeEvent,zaloMessageId,LIMIT,MAX_BYTES} from './model.js';
import {recordPlatform} from './platforms.js';
// Restore records, not capture events: paused collection must not discard imports.
export function mergeArchive(existing,incoming,now=Date.now()){
 if(!Array.isArray(incoming)||incoming.length>LIMIT)throw Error('Invalid archive size');
 const merged=existing.map(record=>({...record}));
 for(const raw of incoming){
  if(!raw||typeof raw!=='object')throw Error('Invalid archive record');
  const event=normalizeEvent({...raw,event:raw.hasOriginal?'snapshot':'recall'},now);
  if(!event||typeof raw.hasOriginal!=='boolean'||!Number.isFinite(raw.firstSeen)||raw.firstSeen<=0||raw.firstSeen>now||
    (raw.recalledAt!==null&&(!Number.isFinite(raw.recalledAt)||raw.recalledAt<=0||raw.recalledAt>now)))throw Error('Invalid archive record');
  const match=merged.find(r=>recordPlatform(r)===event.platform&&(r.accountScope||'')===event.accountScope&&r.conversationId===event.conversationId&&(event.platform==='zalo'?zaloMessageId(r.messageId):r.messageId)===event.messageId);
  const restored={...event,note:typeof raw.note==='string'?raw.note.slice(0,2000):'',pinned:raw.pinned===true,id:crypto.randomUUID(),firstSeen:raw.firstSeen,recalledAt:raw.recalledAt,hasOriginal:raw.hasOriginal};
  if(match){
   if(!match.hasOriginal&&restored.hasOriginal)Object.assign(match,restored,{id:match.id,note:match.note||restored.note,pinned:match.pinned||restored.pinned,recalledAt:match.recalledAt||restored.recalledAt});
   else match.recalledAt ||= restored.recalledAt;
  }else merged.push(restored);
 }
 if(merged.length>LIMIT||JSON.stringify(merged).length*3>MAX_BYTES)throw Error('Archive capacity exceeded');
 return merged;
}

export function readConversationJSON(file){
 if(file?.format!=='stillhere-conversation'||file.version!==1||!['zalo','facebook'].includes(file.platform)||typeof file.conversationId!=='string'||!file.conversationId||file.conversationId.length>160||!Array.isArray(file.messages)||file.messages.length>LIMIT)throw Error('Invalid conversation export');
 return file.messages.map(message=>({
  messageId:message.messageId,sender:message.sender,text:message.text||'',hasOriginal:message.hasOriginal,kind:message.kind,
  sentAt:message.sentAt,firstSeen:message.firstSeen,recalledAt:message.recalledAt,
  accountScope:file.accountScope,platform:file.platform,conversationId:file.conversationId,conversationName:file.conversationName,conversationType:file.conversationType||'unknown',isSelf:message.isSelf===true,
 }));
}
