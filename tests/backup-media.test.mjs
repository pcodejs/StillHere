import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareBackupMedia} from '../src/core/backup-media.js';
const source='https://s120-ava-talk.zadn.vn/fixture.png';
const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJRkAAAAASUVORK5CYII=';
test('backup media validates record references, format and duplicates before encryption',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const records=[{attachments:[{source}]}];const entries=await prepareBackupMedia(records,[{source,data}],key);
 assert.equal(entries.length,1);assert.equal(entries[0].mime,'image/png');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:entries[0].iv,additionalData:new TextEncoder().encode('go-lai-resource-v1:'+entries[0].id)},key,entries[0].data);
 assert.equal(Buffer.from(plain).toString('base64'),data);
 await assert.rejects(()=>prepareBackupMedia([],[{source,data}],key));
 await assert.rejects(()=>prepareBackupMedia(records,[{source,data},{source,data}],key));
 await assert.rejects(()=>prepareBackupMedia(records,[{source,data:'aGVsbG8='}],key));
});
