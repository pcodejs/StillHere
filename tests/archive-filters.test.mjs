import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterRecords} from '../src/core/model.js';
test('exact sender, local recall dates, kinds and notes combine without accent sensitivity',()=>{
 const record={sender:'ĐẶNG PHÚ',text:'hello',conversationName:'Team',note:'Hẹn mai',kind:'image',pinned:true,recalledAt:new Date(2026,10,13,23,59,59).getTime()};
 const records=[record,{...record,sender:'Someone',kind:'video'},{...record,recalledAt:new Date(2026,10,14).getTime()}];
 assert.deepEqual(filterRecords(records,{sender:'ĐẶNG PHÚ',from:'2026-11-13',to:'2026-11-13',kind:'image',pinnedOnly:true,query:'dang phu'}),[record]);
 assert.equal(filterRecords(records,{kind:'video'}).length,1);
 assert.equal(filterRecords(records,{from:'2026-11-14',to:'2026-11-13'}).length,0);
 assert.equal(filterRecords(records,{query:'hen mai'}).length,3);
 assert.equal(filterRecords(records,{from:'bad'}).length,3);
});
