import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal} from '../src/core/vault.js';
test('AES-256-GCM preserves content, avatars and metadata without plaintext',async()=>{
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const records=[{text:'Tin nhắn riêng tư',sender:'Người thử nghiệm',conversationAvatar:'https://s120-ava-talk.zadn.vn/example.jpg'}];
  const a=await seal(records,key),b=await seal(records,key);
  assert.notEqual(a.data,b.data);assert.notEqual(a.iv,b.iv);
  assert(!JSON.stringify(a).includes(records[0].text));
  assert.deepEqual(await unseal(a,key),records);
  await assert.rejects(()=>crypto.subtle.exportKey('raw',key));
  const wrong=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  await assert.rejects(()=>unseal(a,wrong));
  const tampered={...a,data:(a.data[0]==='A'?'B':'A')+a.data.slice(1)};
  await assert.rejects(()=>unseal(tampered,key));
});
