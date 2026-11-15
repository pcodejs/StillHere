import {recordPlatform} from './platforms.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function conversationExport(records,platform,conversationId,format='json',language='vi',accountScope=''){
 const selected=records.filter(r=>recordPlatform(r)===platform&&(r.accountScope||'')===accountScope&&r.conversationId===conversationId);
 if(!selected.length)throw Error('Conversation unavailable');
 const messages=selected.map(r=>({messageId:r.messageId,isSelf:r.isSelf===true,sender:r.sender,text:r.hasOriginal?r.text:null,hasOriginal:r.hasOriginal,kind:r.kind,sentAt:r.sentAt,recalledAt:r.recalledAt,firstSeen:r.firstSeen})).sort((a,b)=>a.firstSeen-b.firstSeen);
 const data={format:'stillhere-conversation',version:1,accountScope,platform,conversationId,conversationName:selected[0].conversationName,conversationType:selected[0].conversationType,exportedAt:new Date().toISOString(),messages};
 if(format==='json')return {mime:'application/json',extension:'json',content:JSON.stringify(data,null,2)};
 if(format!=='html')throw Error('Unsupported export');
 const en=language==='en';
 const rows=messages.map(m=>`<article><h2>${escape(m.sender)}</h2><p class="meta">${escape(new Date(m.sentAt||m.firstSeen).toISOString())} · ${escape(m.kind)}${m.recalledAt?' · '+(en?'Recalled':'Đã thu hồi'):''}</p><p class="message">${escape(m.hasOriginal?m.text:(en?'Original content was not saved.':'Chưa lưu được nội dung gốc.'))}</p></article>`).join('');
 return {mime:'text/html',extension:'html',content:`<!doctype html><html lang="${en?'en':'vi'}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width"><title>${escape(data.conversationName)} — StillHere</title><style>body{font:16px/1.6 system-ui;max-width:860px;margin:40px auto;padding:0 24px;color:#182b49}article{border-top:1px solid #dde4ed;padding:18px 0}h2{font-size:17px;margin:0}.meta{font-size:13px;color:#52627a}.message{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(data.conversationName)}</h1><p>${en?'StillHere local export. Unencrypted text and metadata only; media files are not included.':'Bản xuất cục bộ StillHere. Văn bản và thông tin tin nhắn không mã hoá; chưa bao gồm tệp media.'}</p>${rows}</html>`};
}
