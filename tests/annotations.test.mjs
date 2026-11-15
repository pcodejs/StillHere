import {test} from 'node:test';
import assert from 'node:assert/strict';
import {annotateRecord} from '../src/core/annotations.js';
import {filterRecords,applyEvents} from '../src/core/model.js';
import {mergeArchive} from '../src/core/archive-import.js';
test('private notes and pins persist through capture updates, filter and backup merge',()=>{
 const original={id:'a',platform:'zalo',conversationId:'c',messageId:'m',kind:'text',text:'hello',hasOriginal:true,firstSeen:1000,recalledAt:2000};
 const records=annotateRecord([original],'a',{note:'ghi chú riêng',pinned:true});
 assert.equal(original.note,undefined);
 assert.equal(filterRecords(records,{pinnedOnly:true,query:'ghi chu'}).length,1);
 const updated=applyEvents(records,[{...original,event:'snapshot',text:'changed'}],{enabled:true,consent:true,retentionDays:30},3000);
 assert.equal(updated[0].note,'ghi chú riêng');assert.equal(updated[0].pinned,true);
 const imported=mergeArchive([],records,3000);assert.equal(imported[0].note,'ghi chú riêng');assert.equal(imported[0].pinned,true);
 assert.throws(()=>annotateRecord(records,'a',{note:'x'.repeat(2001)}));
 assert.throws(()=>annotateRecord(records,'missing',{pinned:true}));
 assert.equal(filterRecords(annotateRecord(records,'a',{pinned:false}),{pinnedOnly:true}).length,0);
});
