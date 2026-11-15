import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messengerDetails} from '../src/core/messenger-conversation.js';
import {applyEvents,DEFAULT_SETTINGS} from '../src/core/model.js';

function fixture() {
  const log={getAttribute:()=> 'Tin nhắn trong cuộc trò chuyện với Minh An',closest:()=>region};
  const link={href:'https://www.facebook.com/100000000000001/',innerText:'Minh An',closest:()=>null,querySelectorAll:()=>[{src:'https://scontent.test.fbcdn.net/avatar.png'}]};
  const region={querySelectorAll:selector=>selector==='[role="log"]'?[log]:selector==='a[href]'?[link]:[]};
  return {node:{closest:()=>log},log,link,region};
}
test('personal type and avatar require a matching profile header in a single-log region',()=>{
  const {node}=fixture();
  assert.deepEqual(messengerDetails(node),{conversationName:'Minh An',conversationType:'personal',conversationAvatar:'https://scontent.test.fbcdn.net/avatar.png'});
});
test('a portalled snapshot without a header does not erase known conversation metadata',()=>{
  const settings={...DEFAULT_SETTINGS,consent:true,enabled:true};
  const first={platform:'facebook',event:'snapshot',conversationId:'123',messageId:'456',text:'original',conversationName:'Minh An',conversationType:'personal'};
  let records=applyEvents([], [first],settings);
  records=applyEvents(records,[{...first,conversationName:'',conversationType:'unknown',text:'same message'}],settings);
  assert.equal(records[0].conversationType,'personal');
  assert.equal(records[0].conversationName,'Minh An');
});
test('an avatar-less Facebook rerender cannot shorten a previously verified sender name',()=>{
  const settings={...DEFAULT_SETTINGS,consent:true,enabled:true};
  const first={platform:'facebook',event:'snapshot',conversationId:'123',messageId:'456',text:'original',sender:'Minh An',senderAvatar:'https://scontent.test.fbcdn.net/avatar.png'};
  let records=applyEvents([], [first],settings);
  records=applyEvents(records,[{...first,sender:'Minh',senderAvatar:''}],settings);
  assert.equal(records[0].sender,'Minh An');
  assert.equal(records[0].senderAvatar,first.senderAvatar);
  records=applyEvents(records,[{...first,sender:'',senderAvatar:''}],settings);
  assert.equal(records[0].sender,'Minh An');
  // Names do not leak to other message IDs or conversations.
  records=applyEvents(records,[{...first,messageId:'457',sender:'Minh',senderAvatar:''}],settings);
  assert.equal(records.find(r=>r.messageId==='457').sender,'Minh');
});
test('sender links, other profiles, invalid hosts and mixed chat regions do not classify a conversation',()=>{
  for(const change of [
    f=>{f.link.closest=()=>f.log;},
    f=>{f.link.innerText='Someone else';},
    f=>{f.link.href='https://www.facebook.com.evil.test/100000000000001/';},
    f=>{f.link.href='https://www.facebook.com/groups/123/';},
    f=>{f.region.querySelectorAll=selector=>selector==='[role="log"]'?[f.log,{}]:selector==='a[href]'?[f.link]:[];},
  ]) {
    const f=fixture();change(f);
    assert.deepEqual(messengerDetails(f.node),{conversationName:'Minh An',conversationType:'unknown',conversationAvatar:''});
  }
});
test('observed group conversation button supplies the group name and both composite avatar parts',()=>{
  const f=fixture();
  f.log.getAttribute=()=> 'Tin nhắn trong cuộc trò chuyện với Minh và Lan';
  const sources=['https://scontent.test.fbcdn.net/one.png','https://scontent.test.fbcdn.net/two.png'];
  const button={closest:()=>null,getAttribute:()=> 'Cuộc trò chuyện với Minh và Lan',innerText:'Minh, Lan',querySelectorAll:()=>sources.map(src=>({src}))};
  f.region.querySelectorAll=selector=>selector==='[role="log"]'?[f.log]:selector==='a[href]'?[]:[button];
  assert.deepEqual(messengerDetails(f.node),{conversationName:'Minh, Lan',conversationType:'group',conversationAvatar:'',conversationAvatars:sources});
  button.getAttribute=()=> 'Cuộc trò chuyện với Someone Else';
  assert.equal(messengerDetails(f.node).conversationType,'unknown');
  button.getAttribute=()=> 'Cuộc trò chuyện với Minh và Lan';
  button.querySelectorAll=()=>[{src:'https://attacker.test/avatar.png'}];
  assert.equal(messengerDetails(f.node).conversationType,'group');
  assert.equal(messengerDetails(f.node).conversationAvatar,'');
  assert.deepEqual(messengerDetails(f.node).conversationAvatars,[]);
  button.querySelectorAll=()=>[{src:sources[0]}];
  assert.equal(messengerDetails(f.node).conversationAvatar,sources[0]);
  assert.deepEqual(messengerDetails(f.node).conversationAvatars,[]);
});
test('composite avatar inputs remain bounded and survive a temporary missing header',()=>{
  const settings={...DEFAULT_SETTINGS,consent:true,enabled:true};
  const sources=['https://scontent.test.fbcdn.net/one.png','https://scontent.test.fbcdn.net/two.png'];
  const first={platform:'facebook',event:'snapshot',conversationId:'123',messageId:'456',text:'original',conversationName:'Minh, Lan',conversationType:'group',conversationAvatars:[...sources,'https://attacker.test/a']};
  let records=applyEvents([], [first],settings);
  assert.deepEqual(records[0].conversationAvatars,sources);
  records=applyEvents(records,[{...first,conversationAvatars:[],conversationType:'unknown',conversationName:''}],settings);
  assert.deepEqual(records[0].conversationAvatars,sources);
  records=applyEvents(records,[{...first,conversationAvatars:[],conversationAvatar:sources[0]}],settings);
  assert.deepEqual(records[0].conversationAvatars,[]);
  records=applyEvents(records,[{...first,event:'recall',text:''}],settings);
  assert.deepEqual(records[0].conversationAvatars,sources);
  assert.equal(records[0].conversationAvatar,'');
  records=applyEvents(records,[{...first,event:'recall',text:'',conversationAvatars:[],conversationAvatar:sources[0]}],settings);
  assert.deepEqual(records[0].conversationAvatars,[]);
});
