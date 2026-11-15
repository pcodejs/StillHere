import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const profile=await mkdtemp(resolve(tmpdir(),'stillhere-mv3-restart-'));
const extension=resolve('outputs/go-lai-extension');
let context;
async function open(){
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 await context.route('https://chat.zalo.me/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><div id="messageView"></div>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 return {popup,worker};
}
async function queueLength(worker){return worker.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('fsub-password-vault');r.onsuccess=()=>{const db=r.result,q=db.transaction('meta').objectStore('meta').get('captureQueue');q.onsuccess=()=>{resolve(q.result?.length||0);db.close();};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));}
try{
 let {popup,worker}=await open();
 expect(await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'restart-fixture'}))).toMatchObject({unlocked:true});
 await popup.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,platforms:['zalo']}));
 const zalo=await context.newPage();await zalo.goto('https://chat.zalo.me/');
 await zalo.evaluate(()=>{const h=document.createElement('div');h.id='account-header';h.__reactFiber$fixture={memoizedProps:{currUser:{userId:'restart-user',displayName:'Restart user'}}};document.body.prepend(h);});
 await expect.poll(()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).health?.some(h=>h.accountName==='Restart user')),{timeout:20000}).toBe(true);
 await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_LOCK'}));
 const beforeCapture=await queueLength(worker);
 await zalo.evaluate(()=>{
 const n=document.createElement('div');n.id='text-mCntr_501';n.textContent='Pending original survives real MV3 restart';
 n.__reactFiber$fixture={memoizedProps:{data:{msgId:'restart-msg',cliMsgId:'501',toUid:'restart-chat',msgType:1,fromUid:'sender',dName:'Sender',message:n.textContent,sendDttm:Date.now()}},return:{memoizedProps:{conversation:{userId:'restart-chat',type:3,name:'Restart chat'}}}};
 document.getElementById('messageView').append(n);
 });
 await expect.poll(()=>queueLength(worker),{timeout:20000}).toBeGreaterThan(beforeCapture);
 const snapshots=await queueLength(worker);
 await zalo.evaluate(()=>{const n=document.getElementById('text-mCntr_501');n.__reactFiber$fixture.memoizedProps.data.msgType=20;n.__reactFiber$fixture.memoizedProps.data.message='';n.className='undo-message';n.textContent='Tin nhắn đã được thu hồi';});
 await expect.poll(()=>queueLength(worker),{timeout:20000}).toBeGreaterThan(snapshots);
 await context.close();context=null;
 ({popup,worker}=await open());
 expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_STATUS'}))).unlocked).toBe(false);
 expect(await queueLength(worker)).toBeGreaterThan(0);
 expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).error).toBeTruthy();
 expect(await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'restart-fixture'}))).toMatchObject({unlocked:true});
 const state=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));
 expect(state.records).toHaveLength(1);
 expect(state.records[0]).toMatchObject({text:'Pending original survives real MV3 restart',hasOriginal:true});
 expect(state.records[0].recalledAt).toBeTruthy();expect(state.records[0].accountScope).toMatch(/^[a-f0-9]{64}$/);
 expect(await queueLength(worker)).toBe(0);
 console.log('PASS real MV3 process restart: captured while locked, recalled, restarted browser, denied reads, unlocked and recovered original with account scope. No Chrome API mocks; synthetic Zalo DOM.');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});}
