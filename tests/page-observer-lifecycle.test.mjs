import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/page-observer.js'],bundle:true,write:false,format:'iife'});
const code=result.outputFiles[0].text;
function fixture(legacy=false){
 const listeners=[];
 const original=function(){};
 const win={addEventListener:(type,fn,options)=>listeners.push({type,fn,options})};
 if(legacy)win[Symbol.for('fsub-unsend-observer-v2')]=true;
 const anchor={prototype:{click:original}};
 const context=vm.createContext({window:win,location:{origin:'https://chat.zalo.me'},document:{addEventListener:(type,fn,options)=>listeners.push({type,fn,options})},HTMLAnchorElement:anchor,AbortController,clearTimeout,clearInterval});
 return {context,listeners,anchor,original,win};
}
test('Zalo reinjection disposes previous listeners and restores anchor wrapper',()=>{
 const f=fixture();vm.runInContext(code,f.context);
 const first=f.anchor.prototype.click;assert.notEqual(first,f.original);
 vm.runInContext(code,f.context);
 assert(f.listeners.slice(0,2).every(l=>l.options.signal.aborted));
 assert(f.listeners.slice(2).every(l=>!l.options.signal.aborted));
 assert.notEqual(f.anchor.prototype.click,first);
 f.win[Symbol.for('fsub-unsend-observer-v3')].dispose();
 assert.equal(f.anchor.prototype.click,f.original);
 assert(f.listeners.every(l=>l.options.signal.aborted));
});
test('legacy singleton never gets a duplicate reader',()=>{
 const f=fixture(true);vm.runInContext(code,f.context);
 assert.equal(f.listeners.length,0);assert.equal(f.anchor.prototype.click,f.original);
});

test('bundled observer emits only empty health during initial login and neutral loading',()=>{
 const f=fixture(),messages=[];
 f.win.postMessage=message=>messages.push(message);
 const doc=f.context.document;
 doc.documentElement={};doc.title='Zalo - Login';doc.querySelectorAll=()=>[];doc.querySelector=()=>null;
 f.context.navigator={onLine:true};
 f.context.MutationObserver=class {observe(){} disconnect(){}};
 f.context.setInterval=()=>1;
 vm.runInContext(code,f.context);
 const control=f.listeners.find(l=>l.type==='message').fn;
 const pulse=()=>control({source:f.win,origin:'https://chat.zalo.me',data:{channel:'fsub-unsend-control-v2',token:'a'.repeat(36),enabled:true,cacheMedia:true}});
 pulse();doc.title='Zalo';pulse();
 assert.equal(messages.length,2);
 for(const message of messages){
  assert.equal(message.type,'health');
  assert.equal(message.payload.matched,0);
  assert.equal(message.payload.accountName,'');
  assert.equal(message.payload.loggedOut,false);
 }
 f.win[Symbol.for('fsub-unsend-observer-v3')].dispose();
});
