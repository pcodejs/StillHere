import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountSession,accountChangeReason} from '../src/core/account-session.js';
test('a new ID must not conceal a changed name when previous scan had no ID',()=>{
 const previous={id:'',name:'First account'};
 const next=accountSession(previous,{accountId:'second-id',accountName:'Second account'});
 assert.equal(next.locked,true);
 assert.deepEqual(next.pendingAccount,{id:'second-id',name:'Second account'});
 assert.equal(accountSession(previous,{accountId:'first-id',accountName:'First account'}).locked,false);
});
test('a partial identity scan cannot hide a subsequent account change',()=>{
 const first={id:'account-a',name:'Same name'};
 const partial=accountSession(first,{accountName:'Same name'});
 assert.equal(partial.account.id,'account-a');
 assert.equal(accountSession(partial.account,{accountId:'account-b',accountName:'Same name'}).locked,true);
});
test('stable account IDs allow display name changes while logout always locks',()=>{
 const first={id:'account-a',name:'Old name'};
 assert.deepEqual(accountSession(first,{accountId:'account-a',accountName:'New name'}),{locked:false,account:{id:'account-a',name:'New name'}});
 assert.equal(accountSession(first,{loggedOut:true}).locked,true);
 assert.equal(accountSession(first,{accountChanging:true}).locked,true);
 assert.equal(accountSession(null,{accountChanging:true}).locked,true);
 assert.deepEqual(accountSession(first,{}),{locked:false,account:null});
});
test('account change supplies the new observed identity for explicit unlock without lock loop',()=>{
 const previous={id:'old-id',name:'Old'};
 const change=accountSession(previous,{accountId:'new-id',accountName:'New'});
 assert.equal(change.locked,true);
 assert.deepEqual(change.pendingAccount,{id:'new-id',name:'New'});
 assert.equal(accountSession(change.pendingAccount,{accountId:'new-id',accountName:'New'}).locked,false);
 assert.equal(accountSession(previous,{loggedOut:true}).pendingAccount,null);
});

test('protection diagnostics report categories without leaking identities',()=>{
 const a={id:'a',name:'Private A'};
 assert.equal(accountChangeReason(a,{accountId:'b',accountName:'Private B'}),'id-changed');
 assert.equal(accountChangeReason(a,{accountName:'Private B'}),'name-changed');
 assert.equal(accountChangeReason(a,{loggedOut:true}),'signed-out');
 assert.equal(accountChangeReason(a,{accountChanging:true}),'switching');
 assert.equal(accountChangeReason(a,{accountId:'a',accountName:'New name'}),null);
});
