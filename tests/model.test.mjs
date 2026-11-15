import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyEvents,cleanRecords,normalizeEvent,filterRecords,DAY,avatarSource} from '../src/core/model.js';
import {eventFromModel,readModel,readProfile} from '../src/core/adapter.js';
const settings={consent:true,enabled:true,retentionDays:30};
const now=1794372823000;
const event=(overrides={})=>({event:'snapshot',messageId:'123',clientId:'456',conversationId:'u100',conversationType:'personal',sender:'Minh Anh',text:'Nội dung gốc',kind:'text',...overrides});
test('capture before recall preserves exact original and sender',()=>{
 let records=applyEvents([], [event()],settings,now);
 records=applyEvents(records,[event({event:'recall',text:''})],settings,now+100);
 records=applyEvents(records,[event({text:'Tin nhắn đã được thu hồi'})],settings,now+200);
 assert.equal(records.length,1);assert.equal(records[0].text,'Nội dung gốc');assert.equal(records[0].sender,'Minh Anh');assert.equal(records[0].recalledAt,now+100);
});
test('no storage before consent or while paused',()=>{
 assert.equal(applyEvents([], [event()],{...settings,consent:false},now).length,0);
 assert.equal(applyEvents([], [event()],{...settings,enabled:false},now).length,0);
});
test('decoded media reference survives later model-only scans and recall',()=>{
 const attachments=[{source:'blob:https://chat.zalo.me/abc-123',kind:'image'}];
 let records=applyEvents([],[event({kind:'image',attachments,text:''})],settings,now);
 records=applyEvents(records,[event({kind:'image',attachments:[{source:'https://photo.zadn.vn/changed-url',kind:'image'}],text:''})],settings,now+1);
 records=applyEvents(records,[event({event:'recall',attachments:[],senderAvatar:'https://avatar.talk.zdn.vn/lan.jpg'})],settings,now+2);
 assert.equal(records[0].attachments[0].source,attachments[0].source);
 assert.equal(records[0].kind,'image');assert(records[0].senderAvatar);
});
test('identical IDs in different groups never cross-match',()=>{
 let records=applyEvents([], [event(),event({conversationId:'g2',text:'Bản nhóm',conversationType:'group'})],settings,now);
 records=applyEvents(records,[event({event:'recall',conversationId:'g2'})],settings,now+1);
 assert.equal(records.find(r=>r.conversationId==='u100').recalledAt,null);
 assert.equal(filterRecords(records,{type:'group'})[0].text,'Bản nhóm');
});
test('unknown recall stays honest; old orphans are not reconstructed',()=>{
 let records=applyEvents([],[event({event:'recall',text:''})],settings,now);
 records=applyEvents(records,[event()],settings,now+1);
 assert.equal(records[0].hasOriginal,false);assert.equal(records[0].text,'');
});
test('client fallback cannot merge conflicting server IDs',()=>{
 let records=applyEvents([],[event(),event({messageId:'789',text:'Different'})],settings,now);
 records=applyEvents(records,[event({messageId:'',event:'recall'})],settings,now+1);
 assert.equal(records.filter(r=>r.hasOriginal&&r.recalledAt).length,0);
});
test('dedup, TTL, bounded storage and diacritic search',()=>{
 let records=applyEvents([],[event(),event()],settings,now);assert.equal(records.length,1);
 records=applyEvents(records,[event({event:'recall'})],settings,now+1);
 assert.equal(filterRecords(records,{query:'noi dung goc'}).length,1);
 assert.equal(cleanRecords(records,settings,now+31*DAY).length,0);
 assert.equal(cleanRecords(records,{retentionDays:7},now+8*DAY).length,0);
 let many=Array.from({length:2000},(_,i)=>({...records[0],id:String(i),firstSeen:now+i}));
 assert.equal(cleanRecords(many,settings,now+3000).length,1500);
 many=many.map(r=>({...r,text:'a'.repeat(12000)}));
 assert(cleanRecords(many,settings,now+3000).length<1500);
});
test('allowlist strips secrets and unsafe IDs; hostile text stays text',()=>{
 const e=normalizeEvent(event({cookie:'secret',url:'https://secret',text:'<img src=x onerror=alert(1)>'}),now);
 assert.equal(e.cookie,undefined);assert.equal(e.url,undefined);assert.equal(e.text,'<img src=x onerror=alert(1)>');
 assert.equal(normalizeEvent(event({messageId:Number.MAX_SAFE_INTEGER+1,clientId:''}),now),null);
});
test('Zalo rendered text and undo model share exact identity',()=>{
 const m={msgId:'999',cliMsgId:'888',msgType:1,toUid:'g5',fromUid:'42',dName:'Lan',message:'Gốc',UIContent:'Gốc',sendDttm:now};
 const a=eventFromModel(m,{conversation:{type:2,name:'Nhóm dự án'}});
 const b=eventFromModel({...m,msgType:20,message:''});
 assert.equal(a.conversationType,'group');assert.equal(a.conversationName,'Nhóm dự án');assert.equal(a.text,'Gốc');assert.equal(b.event,'recall');assert.equal(a.messageId,b.messageId);
});
test('Zalo prefixed sticker model and bare recall identify one saved original',()=>{
 const message={msgId:'grp8000000000202',cliMsgId:'sticker-client',msgType:4,toUid:'g5',fromUid:'0',message:{stickerUrl:'https://stc-zaloprofile.zdn.vn/sticker.gif'},sendDttm:now};
 const snapshot=eventFromModel(message,{isGroup:true});
 const recall=eventFromModel({...message,msgId:'8000000000202',msgType:20,message:''},{isGroup:true});
 assert.equal(snapshot.messageId,recall.messageId);
 let records=applyEvents([],[snapshot,{...snapshot,messageId:'grp8000000000202'}],settings,now);
 records=applyEvents(records,[recall],settings,now+1);
 assert.equal(records.length,1);assert.equal(records[0].kind,'sticker');
 assert.equal(records[0].hasOriginal,true);assert.equal(records[0].attachments.length,1);
 assert.equal(records[0].recalledAt,now+1);
});
test('legacy Zalo grp aliases retain original, earliest recall, notes and importance while paused',()=>{
 const original={...normalizeEvent(event({messageId:'grp123',conversationId:'g5',kind:'sticker',text:'',attachments:[{source:'https://photo.zadn.vn/sticker.gif',kind:'sticker'}]}),now),messageId:'grp123',id:'original',firstSeen:now-2,hasOriginal:true,recalledAt:now+1,pinned:true,note:'Ghi chú riêng'};
 const orphan={...original,id:'recall',messageId:'123',firstSeen:now-1,hasOriginal:false,kind:'other',attachments:[],recalledAt:now+2,pinned:false,note:''};
 const records=cleanRecords([orphan,original],{...settings,enabled:false},now+3);
 assert.equal(records.length,1);assert.equal(records[0].messageId,'123');
 assert.equal(records[0].hasOriginal,true);assert.equal(records[0].kind,'sticker');
 assert.equal(records[0].attachments.length,1);assert.equal(records[0].recalledAt,now+1);
 assert.equal(records[0].firstSeen,now-2);assert.equal(records[0].note,'Ghi chú riêng');assert.equal(records[0].pinned,true);
 assert.equal(original.messageId,'grp123');assert.equal(orphan.kind,'other');
});
test('Zalo grp recovery preserves account, conversation and private-content boundaries',()=>{
 const record={...normalizeEvent(event({messageId:'grp123',conversationId:'g5'}),now),messageId:'grp123',id:'one',firstSeen:now,hasOriginal:true,recalledAt:now+1,note:'First note'};
 const differentNote={...record,id:'two',messageId:'123',note:'Second note'};
 const differentOriginal={...record,id:'three',messageId:'123',text:'Different original'};
 const otherAccount={...record,id:'four',messageId:'123',accountScope:'a'.repeat(64)};
 const otherConversation={...record,id:'five',messageId:'123',conversationId:'g6'};
 assert.equal(cleanRecords([record,differentNote,differentOriginal,otherAccount,otherConversation],settings,now+2).length,5);
 for(const id of ['grpABC','grp123-extra','GRP123'])assert.equal(normalizeEvent(event({messageId:id}),now).messageId,id);
 assert.equal(normalizeEvent(event({platform:'facebook',messageId:'grp123'}),now).messageId,'grp123');
});
test('skip E2EE pending/failed, system messages and disappearing messages',()=>{
 const base={msgId:'1',toUid:'2',message:'Ciphertext',msgType:1};
 assert.equal(eventFromModel({...base,msgType:-29}),null);assert.equal(eventFromModel({...base,ttl:60000}),null);assert.equal(eventFromModel({...base,msgType:-1909}),null);
});
test('bounded React fiber traversal finds model and conversation context',()=>{
 const m={msgId:'1',cliMsgId:'2',toUid:'g3',message:'hello',msgType:1};
 const el={__reactFiber$fixture:{memoizedProps:{children:null},return:{memoizedProps:{data:m},return:{memoizedProps:{conversation:{userId:'g3',name:'Team',type:2}}}}},parentElement:null};
 const found=readModel(el);assert.equal(found.message,m);assert.equal(found.props.conversation.name,'Team');
});
test('avatar sources reject arbitrary network and executable payloads',()=>{
 assert.equal(avatarSource('https://s120-ava-talk.zadn.vn/abc.jpg'),'https://s120-ava-talk.zadn.vn/abc.jpg');
 for(const value of ['https://zadn.vn.attacker.test/','https://attacker.test/a.jpg','javascript:alert(1)','data:image/svg+xml,<svg/>','https://user:secret@s120-ava-talk.zadn.vn/a'])assert.equal(avatarSource(value),'');
 const e=normalizeEvent(event({senderAvatar:'https://attacker.test/',conversationAvatar:'https://s120-ava-talk.zadn.vn/g.jpg'}),now);
 assert.equal(e.senderAvatar,'');assert(e.conversationAvatar);
});
test('rendered profile metadata only matches exact conversation or sender ID',()=>{
 const el={__reactInternalInstance$fixture:{memoizedProps:{conversation:{userId:'g123',displayName:'Nhóm dự án',avatar:'https://s120-ava-talk.zadn.vn/g.jpg',type:2}}},parentElement:null};
 assert.equal(readProfile(el,'g123').name,'Nhóm dự án');assert.equal(readProfile(el,'g124'),null);
 let records=applyEvents([],[event({conversationName:'Nhóm dự án',senderAvatar:'https://s120-ava-talk.zadn.vn/a.jpg'})],settings,now);
 records=applyEvents(records,[event({event:'recall',conversationAvatar:'https://s120-ava-talk.zadn.vn/g.jpg'})],settings,now+1);
 assert(records[0].senderAvatar);assert(records[0].conversationAvatar);assert.equal(records[0].text,'Nội dung gốc');
});

test('account name comes from explicit signed-in props and never from the conversation sender', async () => {
  const {readAccountName} = await import('../src/core/adapter.js');
  const node = props => ({__reactFiber$fixture: {memoizedProps: props}});
  assert.equal(readAccountName([node({currUser: {displayName: 'Tài khoản kiểm thử'}})]), 'Tài khoản kiểm thử');
  assert.equal(readAccountName([node({user: {name: 'Người trong hội thoại'},senderInfo: {name: 'Người gửi'}})]), '');
  assert.equal(readAccountName([node({isSelf: true,user: {name: 'Tên của bạn'}})]), 'Tên của bạn');
  assert.equal(readAccountName([], 'Zalo - Tài khoản mẫu'), 'Tài khoản mẫu');
  assert.equal(readAccountName([], 'Zalo - Đăng nhập Zalo'), '');
});

test('rendered conversation preview records latest text and recall without replacing a complete bubble', async () => {
 const {readConversationPreview} = await import('../src/core/adapter.js');
 const props = {conversation:{userId:'g9',lastSmsLocalId:'1234',isGroup:true},displayName:'Tester',isGroup:true,previewMsg:{message:'Original preview',dName:'Lan',messageTime:String(now),icon:'',isSystemMsg:false}};
 const element={__reactInternalInstance$fixture:{memoizedProps:props}};
 const preview=readConversationPreview(element);
 assert.equal(preview.messageId,'1234');assert.equal(preview.conversationName,'Tester');
 let records=applyEvents([], [preview], settings, now);
 records=applyEvents(records,[{...preview,text:'Complete message from bubble',source:'render-model'}],settings,now+1);
 records=applyEvents(records,[{...preview,text:'Short preview'}],settings,now+2);
 assert.equal(records[0].text,'Complete message from bubble');
 props.previewMsg.message='Tin nhắn đã được thu hồi';
 records=applyEvents(records,[readConversationPreview(element)],settings,now+3);
 assert.equal(records[0].text,'Complete message from bubble');assert(records[0].recalledAt);
 props.previewMsg={...props.previewMsg,message:'A draft',draft:true};assert.equal(readConversationPreview(element),null);
 props.previewMsg={message:'Image preview',icon:'image'};assert.equal(readConversationPreview(element),null);
});

test('Zalo own sender uses signed-in name only for explicit self messages',()=>{
 const message={msgId:'self-test',toUid:'g1',fromUid:'0',msgType:1,message:'Test'};
 assert.equal(eventFromModel(message,{}, {accountName:'Tài khoản mẫu'}).sender,'Tài khoản mẫu');
 assert.equal(eventFromModel(message).sender,'Bạn');
 assert.equal(eventFromModel({...message,fromUid:'other',dName:'Phú'}, {}, {accountName:'Tài khoản mẫu'}).sender,'Phú');
});

test('Zalo self name enriches recalled records without rewriting original or downgrading later',()=>{
 let records=applyEvents([],[event({platform:'zalo',sender:'Bạn',isSelf:true})],settings,now);
 records=applyEvents(records,[event({platform:'zalo',event:'recall',sender:'Bạn',isSelf:true,text:''})],settings,now+1);
 const original=records[0].text;
 records=applyEvents(records,[event({platform:'zalo',event:'recall',sender:'Tài khoản mẫu',isSelf:true,text:''})],settings,now+2);
 assert.equal(records.length,1);assert.equal(records[0].sender,'Tài khoản mẫu');
 assert.equal(records[0].text,original);assert.equal(records[0].recalledAt,now+1);
 records=applyEvents(records,[event({platform:'zalo',event:'recall',sender:'Bạn',isSelf:true,text:''})],settings,now+3);
 assert.equal(records[0].sender,'Tài khoản mẫu');
});
test('Zalo self name does not downgrade on snapshots or leak to another account',()=>{
 let records=applyEvents([],[event({platform:'zalo',sender:'Tài khoản mẫu',isSelf:true,accountScope:'a'.repeat(64)})],settings,now);
 records=applyEvents(records,[event({platform:'zalo',sender:'Bạn',isSelf:true,accountScope:'a'.repeat(64)}),event({platform:'zalo',sender:'Bạn',isSelf:true,accountScope:'b'.repeat(64)})],settings,now+1);
 assert.equal(records.length,2);assert.equal(records.find(r=>r.accountScope==='a'.repeat(64)).sender,'Tài khoản mẫu');
 assert.equal(records.find(r=>r.accountScope==='b'.repeat(64)).sender,'Bạn');
});
