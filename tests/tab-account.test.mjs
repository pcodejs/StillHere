import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tabAccountKey,observedTabAccount,resolveAccountAliases,recoverNameAccountAlias} from '../src/core/tab-account.js';
test('tab identity keys isolate tabs and replaced documents',()=>{
 const sender={tab:{id:1},documentId:'one'};
 assert.notEqual(tabAccountKey(sender),tabAccountKey({...sender,tab:{id:2}}));
 assert.notEqual(tabAccountKey(sender),tabAccountKey({...sender,documentId:'two'}));
 assert.throws(()=>tabAccountKey({tab:{id:1}}));
});
test('partial scans preserve own identity while logout clears it and changes replace it',()=>{
 const a={id:'a',name:'First'};
 assert.deepEqual(observedTabAccount(a,{}),a);
 assert.equal(observedTabAccount(a,{loggedOut:true}),null);
 assert.deepEqual(observedTabAccount(a,{accountId:'b',accountName:'Second'}),{id:'b',name:'Second'});
 assert.equal(observedTabAccount(null,{}),null);
});
test('enrichment links unknown or matching-name identities, never different known accounts',async()=>{
 const {isIdentityEnrichment,resolveAccountAliases}=await import('../src/core/tab-account.js');
 assert.equal(isIdentityEnrichment(null,{id:'a',name:'A'}),true);
 assert.equal(isIdentityEnrichment({name:'A'},{id:'a',name:'A'}),true);
 assert.equal(isIdentityEnrichment({name:'A'},{id:'b',name:'B'}),false);
 assert.equal(isIdentityEnrichment({id:'a'},{id:'b'}),false);
 const a='a'.repeat(64),b='b'.repeat(64);
 const records=[{accountScope:a,text:'keep'},{accountScope:'',text:'legacy'}];
 const out=resolveAccountAliases(records,{[a]:{scope:b,name:'Name'}});
 assert.equal(out[0].accountScope,b);assert.equal(out[0].text,'keep');assert.equal(out[0].accountName,'Name');
 assert.equal(out[1],records[1]);assert.equal(records[0].accountScope,a);
});

test('name-scope recovery requires exact own-message IDs, platform and account',()=>{
 const from='a'.repeat(64),scope='b'.repeat(64);
 const candidate={platform:'zalo',from,scope,name:'Account'};
 const record={platform:'zalo',accountScope:from,accountName:'Account',isSelf:true,conversationId:'g1',messageId:'m1',clientId:'c1'};
 const event={...record,accountScope:scope,event:'recall'};
 assert.deepEqual(recoverNameAccountAlias([record],[event],candidate),{from,scope,name:'Account'});
 for(const change of [{isSelf:false},{messageId:'m2'},{clientId:''},{clientId:'c2'},{conversationId:'g2'},{platform:'facebook'},{accountName:'Other'},{accountScope:from}])
  assert.equal(recoverNameAccountAlias([record],[{...event,...change}],candidate),null);
 assert.equal(recoverNameAccountAlias([{...record,accountScope:'c'.repeat(64)}],[event],candidate),null);
 assert.equal(recoverNameAccountAlias([record],[event],{...candidate,platform:'facebook'}),null);
});

test('scope linkage coalesces recall placeholder with original, avatar and annotations',()=>{
 const from='a'.repeat(64),scope='b'.repeat(64);
 const original={id:'original',platform:'zalo',accountScope:from,conversationId:'g1',messageId:'m1',isSelf:true,firstSeen:10,recalledAt:20,hasOriginal:true,text:'Original content',senderAvatar:'',note:'Private note',pinned:true};
 const placeholder={...original,id:'placeholder',accountScope:scope,firstSeen:30,recalledAt:40,hasOriginal:false,text:'',senderAvatar:'https://s160-26-ava-talk.zadn.vn/avatar.jpg',note:'',pinned:false};
 const alias={[from]:{scope,name:'Account'}};
 const resolved=resolveAccountAliases([placeholder,original],alias);
 assert.equal(resolved.length,1);
 assert.equal(resolved[0].id,'original');assert.equal(resolved[0].text,'Original content');
 assert.equal(resolved[0].firstSeen,10);assert.equal(resolved[0].recalledAt,20);
 assert.equal(resolved[0].senderAvatar,placeholder.senderAvatar);
 assert.equal(resolved[0].note,'Private note');assert.equal(resolved[0].pinned,true);
 assert.equal(original.accountScope,from);
 assert.deepEqual(resolveAccountAliases(resolved,alias),resolved);
 assert.equal(resolveAccountAliases([placeholder,{...original,note:'Different'}, {...original,note:'Other'}],alias).length,2);
 assert.equal(resolveAccountAliases([placeholder,{...original,platform:'facebook'}],alias).length,2);
});
