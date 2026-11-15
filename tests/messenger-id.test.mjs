import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyEvents,cleanRecords,DEFAULT_SETTINGS} from '../src/core/model.js';
const settings={...DEFAULT_SETTINGS,consent:true,enabled:true};
const now=Date.now();
const event={platform:'facebook',conversationId:'thread1',event:'snapshot',messageId:'7526000000000000001',sender:'You',text:'E2EE fixture original',kind:'text'};
test('temporary and confirmed E2EE IDs are one message through recall',()=>{
  let records=applyEvents([], [event],settings,now);
  records=applyEvents(records,[{...event,messageId:'12345@msgr.'+event.messageId}],settings,now+1);
  records=applyEvents(records,[{...event,event:'recall',messageId:'12345@msgr.'+event.messageId,text:''}],settings,now+2);
  assert.equal(records.length,1);
  assert.equal(records[0].text,event.text);
  assert.equal(records[0].recalledAt,now+2);
  records=applyEvents(records,[{...event,conversationId:'thread2'}],settings,now+3);
  assert.equal(records.length,2);
});
test('existing duplicate E2EE records merge their original and recall marker',()=>{
  const original={...event,id:'old',firstSeen:now,hasOriginal:true,attachments:[],senderAvatar:'avatar'};
  const marker={...original,id:'new',messageId:'12345@msgr.'+event.messageId,text:'',senderAvatar:'',hasOriginal:false,recalledAt:now+2,firstSeen:now+2};
  const records=cleanRecords([original,marker],settings,now+3);
  assert.equal(records.length,1);
  assert.equal(records[0].text,event.text);
  assert.equal(records[0].senderAvatar,'avatar');
  assert.equal(records[0].firstSeen,now);
  assert.equal(records[0].recalledAt,now+2);
  const zalo=cleanRecords([{...original,platform:'zalo'},{...marker,platform:'zalo'}],settings,now+3);
  assert.equal(zalo.length,2);
});
