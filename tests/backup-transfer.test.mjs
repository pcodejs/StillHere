import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBackupTransfers,BACKUP_CHUNK_SIZE} from '../src/core/backup-transfer.js';
test('backup transfers enforce owner, order, completeness, capacity and expiry',()=>{
 let clock=0;
 const t=createBackupTransfers({maxBytes:100,ttl:10,now:()=>clock,id:()=>String(clock)});
 assert.throws(()=>t.begin('page',101));
 const token=t.begin('page',6);
 assert.throws(()=>t.begin('other',6));
 assert.throws(()=>t.append(token,'other',0,'abc'));
 assert.throws(()=>t.append(token,'page',1,'abc'));
 assert.equal(t.append(token,'page',0,'abc'),3);
 assert.throws(()=>t.append(token,'page',0,'abc'));
 assert.throws(()=>t.finish(token,'page'));
 assert.throws(()=>t.append(token,'page',1,'abcd'));
 t.append(token,'page',1,'def');assert.equal(t.finish(token,'page'),'abcdef');
 assert.throws(()=>t.finish(token,'page'));
 const expired=t.begin('page',1);clock=10;
 assert.throws(()=>t.append(expired,'page',0,'a'));
 const fresh=t.begin('page',1);t.clear();assert.throws(()=>t.finish(fresh,'page'));
});
test('backup transfer reconstructs payload spanning multiple message chunks',()=>{
 const t=createBackupTransfers();const part='a'.repeat(BACKUP_CHUNK_SIZE);
 const token=t.begin('page',part.length+3);
 assert.throws(()=>t.append(token,'page',0,part+'a'));
 t.append(token,'page',0,part);t.append(token,'page',1,'end');
 assert.equal(t.finish(token,'page'),part+'end');
});
test('export chunks stay document-bound and reproduce encrypted payload',()=>{
 const t=createBackupTransfers();const text='x'.repeat(BACKUP_CHUNK_SIZE)+'end';
 const {token,size}=t.offer('page',text);
 assert.equal(size,text.length);
 assert.throws(()=>t.append(token,'page',0,'a'));
 assert.throws(()=>t.finish(token,'page'));
 assert.throws(()=>t.read(token,'other',0));
 assert.throws(()=>t.read(token,'page',-1));
 assert.equal(t.read(token,'page',0)+t.read(token,'page',BACKUP_CHUNK_SIZE),text);
 t.cancel(token,'page');assert.throws(()=>t.read(token,'page',0));
});
