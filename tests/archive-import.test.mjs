import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeArchive} from '../src/core/archive-import.js';
import {exportPortable,importPortable} from '../src/core/vault.js';
const r={platform:'zalo',conversationId:'c',messageId:'m',text:'Nội dung trước thu hồi',kind:'text',hasOriginal:true,firstSeen:1000,recalledAt:2000};
test('import preserves original, recall dates and existing records; duplicate import is idempotent',()=>{
 const existing={...r,id:'existing',messageId:'other'};
 const merged=mergeArchive([existing],[r],3000);
 assert.equal(merged.length,2);assert.equal(merged[1].text,r.text);assert.equal(merged[1].recalledAt,2000);
 assert.deepEqual(mergeArchive(merged,[r],3000),merged);
 assert.equal(mergeArchive([{...r,hasOriginal:false,text:''}],[r],3000)[0].text,r.text);
 assert.throws(()=>mergeArchive([existing],[{...r,firstSeen:Infinity}],3000));
 assert.deepEqual(existing,{...r,id:'existing',messageId:'other'});
});
test('portable archive is authenticated and needs the independent backup password',async()=>{
 const file=await exportPortable([r],'backup-fixture');
 assert(!JSON.stringify(file).includes(r.text));
 assert.deepEqual(await importPortable(file,'backup-fixture'),[r]);
 await assert.rejects(()=>importPortable(file,'wrong-password'));
 await assert.rejects(()=>importPortable({...file,iterations:1},'backup-fixture'));
 await assert.rejects(()=>importPortable({...file,envelope:{...file.envelope,data:'AAAA'}},'backup-fixture'));
});
test('Zalo import matches an existing prefixed message without duplicating its note',()=>{
 const existing={...r,id:'saved',messageId:'grp123',note:'Keep this note',pinned:true};
 const merged=mergeArchive([existing],[{...r,messageId:'123'}],3000);
 assert.equal(merged.length,1);assert.equal(merged[0].id,'saved');
 assert.equal(merged[0].note,existing.note);assert.equal(merged[0].pinned,true);
 assert.equal(existing.messageId,'grp123');
});
