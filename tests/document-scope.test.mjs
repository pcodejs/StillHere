import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentScopeToken,resetDocumentScope,clearDocumentScopes} from '../src/core/document-scope.js';
import {accountScope} from '../src/core/account-scope.js';
import {applyEvents} from '../src/core/model.js';
function area(){let data={};return {async get(k){return k===null?structuredClone(data):{[k]:structuredClone(data[k])};},async set(v){Object.assign(data,structuredClone(v));},async remove(k){for(const key of Array.isArray(k)?k:[k])delete data[key];}};}
test('anonymous same-document recalls survive lost session without merging distinct messages',async()=>{
 const storage={local:area(),session:area()},key='tab-account:1:document-a';
 const token=await documentScopeToken(storage,key);
 const scope=await accountScope('facebook',null,token);
 const events=['one','two'].map(messageId=>({event:'recall',platform:'facebook',conversationId:'chat',messageId,accountScope:scope}));
 const settings={consent:true,enabled:true,retentionDays:30};
 const before=applyEvents([],events,settings);
 storage.session=area();
 const afterToken=await documentScopeToken(storage,key);
 assert.equal(afterToken,token);
 const after=applyEvents(before,events.map(e=>({...e,accountScope:scope})),settings);
 assert.deepEqual(after.map(e=>e.id).sort(),before.map(e=>e.id).sort());
 assert.equal(after.length,2);
 assert.notEqual(await documentScopeToken(storage,'tab-account:1:document-b'),token);
 assert.notEqual(await documentScopeToken(storage,'tab-account:2:document-a'),token);
 await resetDocumentScope(storage,key);
 assert.notEqual(await documentScopeToken(storage,key),token);
});
test('existing session token migrates without changing archive partition',async()=>{
 const storage={local:area(),session:area()},key='tab-account:3:legacy';
 await storage.session.set({['unknown:'+key]:'legacy-random-token'});
 assert.equal(await documentScopeToken(storage,key),'legacy-random-token');
 storage.session=area();
 assert.equal(await documentScopeToken(storage,key),'legacy-random-token');
});

test('clearing archive removes anonymous partitions without touching unlock settings',async()=>{
 const storage={local:area(),session:area()},key='tab-account:1:doc';
 const token=await documentScopeToken(storage,key);
 await storage.session.set({unrelated:'preserve'});
 await clearDocumentScopes(storage);
 assert.deepEqual(await storage.local.get(null),{});
 assert.deepEqual(await storage.session.get(null),{unrelated:'preserve'});
 assert.notEqual(await documentScopeToken(storage,key),token);
});
