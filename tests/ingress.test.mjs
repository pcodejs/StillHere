import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngress } from '../src/core/ingress.js';
const event = id => ({event:'snapshot',conversationId:'group',messageId:String(id),kind:'text',text:'Hello',accountId:'self-test'});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('ingress preserves 351 originals and strips arbitrary page properties', async () => {
  const messages=[];
  const ingress=createIngress(async m=>messages.push(m));
  const records=Array.from({length:351},(_,i)=>({...event(i),secret:'must not cross bridge'}));
  ingress.accept({type:'events',payload:records.slice(0,300)},false);
  ingress.accept({type:'events',payload:records.slice(300)},false);
  await tick();
  assert.equal(messages.flatMap(m=>m.events).length,351);
  assert.equal(JSON.stringify(messages).includes('must not cross bridge'),false);
  assert.equal(messages[0].events[0].accountId,'self-test');
});

test('ingress bounds floods, malformed assets, and health updates', async () => {
  let time=0;
  const messages=[];
  const ingress=createIngress(async m=>messages.push(m),()=>time);
  for(let i=0;i<30;i++) ingress.accept({type:'events',payload:Array.from({length:300},(_,j)=>event(i*300+j))},false);
  await tick();
  assert.equal(messages.flatMap(m=>m.events).length,6000);
  assert.equal(ingress.accept({type:'asset',payload:{source:'https://evil.test/a',data:'AAAA'}},true),false);
  assert.equal(ingress.accept({type:'asset',payload:{source:'blob:https://chat.zalo.me/a',data:'AAAA'}},false),false);
  assert.equal(ingress.accept({type:'health',payload:{matched:Infinity}},false),true);
  assert.equal(ingress.accept({type:'health',payload:{}},false),false);
  time=60001;
  assert.equal(ingress.accept({type:'events',payload:[event('new')]},false),true);
});

test('pause discards queued messages and allows new generation after resume', async () => {
  let release;
  const calls=[];
  const ingress=createIngress(async m=>{calls.push(m);if(calls.length===1)await new Promise(r=>release=r);});
  ingress.accept({type:'events',payload:[event(1)]},false);
  ingress.accept({type:'events',payload:[event(2)]},false);
  ingress.reset();
  ingress.accept({type:'events',payload:[event(3)]},false);
  release();
  await tick();
  assert.deepEqual(calls.flatMap(m=>m.events.map(e=>e.messageId)),['1','3']);
});

test('accepts one full 20 MB video payload', async () => {
  const messages=[];
  const ingress=createIngress(async m=>messages.push(m));
  const data=Buffer.alloc(20*1024*1024).toString('base64');
  assert.equal(ingress.accept({type:'asset',payload:{source:'blob:https://chat.zalo.me/a',data}},true),true);
  await tick();
  assert.equal(messages[0].data.length,data.length);
});

test('identity change and logout bypass health interval before captures', async () => {
  const calls=[];
  const ingress=createIngress(async m=>calls.push(m),()=>0);
  ingress.accept({type:'health',payload:{accountId:'a',accountName:'A'}},false);
  ingress.accept({type:'health',payload:{accountId:'b',accountName:'B'}},false);
  ingress.accept({type:'events',payload:[event(1)]},false);
  ingress.accept({type:'health',payload:{loggedOut:true}},false);
  await tick();
  assert.deepEqual(calls.map(m=>m.type),['HEALTH','HEALTH','CAPTURE','HEALTH']);
  assert.equal(calls[1].health.accountId,'b');
  assert.equal(calls[3].health.loggedOut,true);
});
