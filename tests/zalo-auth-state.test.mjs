import test from 'node:test';
import assert from 'node:assert/strict';
import {createZaloAuthState} from '../src/core/zalo-auth-state.js';
test('initial login title pauses capture without locking restored session',()=>{
 const state=createZaloAuthState();
 assert.deepEqual(state({title:'Zalo - Đăng nhập',now:0}),{capture:false,loggedOut:false});
 assert.deepEqual(state({title:'Zalo - Đăng nhập',now:10000}),{capture:false,loggedOut:false});
 assert.deepEqual(state({title:'Zalo - Owner',account:{name:'Owner'},now:11000}),{capture:true,loggedOut:false});
});
test('persistent initial sign-out and sign-out after authentication remain protected',()=>{
 const state=createZaloAuthState();
 state({title:'Zalo - Login',now:0});
 assert.deepEqual(state({title:'Zalo - Login',now:15000}),{capture:false,loggedOut:true});
 state({title:'Zalo - Owner',account:{id:'own'},now:16000});
 assert.deepEqual(state({title:'Zalo - Sign in',now:16001}),{capture:false,loggedOut:true});
});
test('stale account props never enable capture on login screen',()=>{
 const state=createZaloAuthState();
 assert.deepEqual(state({title:'Zalo - Login',account:{id:'old'},now:0}),{capture:false,loggedOut:false});
});

test('neutral loading title cannot resume capture after login until identity returns',()=>{
 const state=createZaloAuthState();
 state({title:'Zalo - Login',now:0});
 assert.deepEqual(state({title:'Zalo',now:2000}),{capture:false,loggedOut:false});
 assert.deepEqual(state({title:'Zalo',now:20000}),{capture:false,loggedOut:false});
 assert.deepEqual(state({title:'Zalo - Owner',account:{id:'self',name:'Owner'},now:21000}),{capture:true,loggedOut:false});
});
