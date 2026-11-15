import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_CONTROL,readAccountIdentity} from '../src/core/adapter.js';
const element = props => ({__reactFiber$test:{memoizedProps:props}});
test('account identity reads explicit self props, never sender or conversation',()=>{
 assert.deepEqual(readAccountIdentity([element({sender:{id:'other',name:'Other'},conversation:{id:'group',name:'Group'}})]),{name:'',id:''});
 assert.deepEqual(readAccountIdentity([element({currUser:{userId:'self',displayName:'Name'}})]),{name:'Name',id:'self'});
 assert.deepEqual(readAccountIdentity([element({isSelf:true,user:{uid:'own',name:'Owner'}})]),{name:'Owner',id:'own'});
});
test('display name fallback does not become a stable account identifier',()=>{
 assert.deepEqual(readAccountIdentity([],'Zalo - Same Name'),{name:'Same Name',id:''});
 assert.deepEqual(readAccountIdentity([],'Zalo - Đăng nhập Zalo'),{name:'',id:''});
});

test('self avatar comes only from explicit account props and allowed sources',()=>{
 const avatar='https://s120-ava-talk.zadn.vn/self.jpg';
 assert.equal(readAccountIdentity([element({currUser:{name:'Owner',avatar}})]).avatar,avatar);
 assert.equal(readAccountIdentity([element({currUser:{name:'Owner',avatar:'https://untrusted.example/self.jpg'}})]).avatar,undefined);
 assert.equal(readAccountIdentity([element({currUser:{name:'Owner'},conversation:{avatar},sender:{avatar}})]).avatar,undefined);
 assert.equal(readAccountIdentity([element({isSelf:true,user:{name:'Owner',fullAvt:avatar}})]).avatar,avatar);
});

test('later explicit self identity enriches avatar only for the same stable ID',()=>{
 const avatar='https://s120-ava-talk.zadn.vn/self.jpg';
 const first=element({currUser:{uid:'self',name:'Owner'}});
 assert.equal(readAccountIdentity([first,element({me:{uid:'self',name:'Owner',avatar}})]).avatar,avatar);
 assert.equal(readAccountIdentity([first,element({me:{uid:'other',name:'Owner',avatar}})]).avatar,undefined);
 assert.equal(readAccountIdentity([element({currUser:{name:'Owner'}}),element({me:{name:'Owner',avatar}})]).avatar,undefined);
});
test('matching account label alone cannot identify a rendered self avatar',()=>{
 const avatar='https://s120-ava-talk.zadn.vn/self-rendered.jpg';
 const image={currentSrc:avatar,src:avatar,complete:false};
 const labeled={textContent:'Tài khoản mẫu',querySelector:()=>image,matches:()=>false};
 assert.equal(readAccountIdentity([element({currUser:{uid:'self',name:'Tài khoản mẫu'}}),labeled]).avatar,undefined);
 const unrelated={textContent:'Other',querySelector:()=>image,matches:()=>false};
 assert.equal(readAccountIdentity([element({currUser:{uid:'self',name:'Tài khoản mẫu'}}),unrelated]).avatar,undefined);
});

function accountControl({id='600000000000001111',name='Tài khoản mẫu',source='https://s160-26-ava-talk.zadn.vn/self.jpg',location=true,count=1}={}) {
 const image={src:source,currentSrc:source,getAttribute:key=>key==='data-ava-uid'?id:null};
 return {matches:selector=>location&&selector===ACCOUNT_CONTROL,getAttribute:key=>key==='title'?name:null,querySelectorAll:()=>Array(count).fill(image)};
}
test('Zalo sidebar identifies the signed-in account and its UID-bound image',()=>{
 const identity=readAccountIdentity([], 'Zalo - Tài khoản mẫu', accountControl());
 assert.deepEqual(identity,{name:'Tài khoản mẫu',id:'600000000000001111',avatar:'https://s160-26-ava-talk.zadn.vn/self.jpg'});
 // Other people's profile dialogs must not replace the sidebar identity.
 assert.equal(readAccountIdentity([element({sender:{uid:'other',name:'Other'}})],'',accountControl()).id,identity.id);
});
test('sidebar avatar requires a single image, valid UID and the account-control location',()=>{
 for(const options of [{id:'0'},{id:''},{id:'undefined'},{name:''},{count:0},{count:2},{location:false}])
  assert.deepEqual(readAccountIdentity([], '', accountControl(options)),{name:'',id:''});
 const identity=readAccountIdentity([], '', accountControl({source:'https://attacker.example/avatar.jpg'}));
 assert.deepEqual(identity,{name:'Tài khoản mẫu',id:'600000000000001111'});
});
