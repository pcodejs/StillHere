import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`export * from './src/core/restore-pending.js'; export * from './src/core/vault.js'; export * from './src/core/locked-capture.js'; export * from './src/core/model.js'; export * from './src/core/inline-viewer.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'fixture'});
const browser=await chromium.launch({headless:true,channel:'chromium'});
try{
 const page=await browser.newPage();
 await page.route('http://localhost/**',r=>r.fulfill({body:'<!doctype html><title>Vault fixture</title>'}));
 async function boot(){
  await page.goto('http://localhost/');
  await page.evaluate(()=>{
   const area=()=>{const values={};return {async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]]));},async set(v){Object.assign(values,v);},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete values[k];},async setAccessLevel(){}};};
   window.chrome={storage:{session:area(),local:area()}};
  });
  await page.addScriptTag({content:bundled.outputFiles[0].text});
 }
 await boot();
 await page.evaluate(async()=>{await fixture.setupVault('fixture-pass',{consent:true,enabled:true,platforms:['zalo']});await fixture.prepareLockedCapture();await fixture.lockVault();});
 expect(await page.evaluate(async()=>(await fixture.vaultStatus()).unlocked)).toBe(false);
 expect(await page.evaluate(()=>fixture.lockedCaptureStatus())).toMatchObject({enabled:true,ready:true,capacityReached:false,accountBlocked:false});
 await page.evaluate(async()=>{
  const event={platform:'zalo',accountScope:'a'.repeat(64),conversationId:'group-test',messageId:'locked-test',event:'snapshot',text:'PRIVATE LOCKED MESSAGE',kind:'text',attachments:[{source:'blob:https://chat.zalo.me/locked-asset',kind:'image'}]};
  await fixture.enqueueLocked({events:[event]});
  await fixture.enqueueLocked({events:[event]});
  await fixture.enqueueLocked({events:[{...event,event:'recall',text:''}]});
 });
 expect(await page.evaluate(async()=>(await fixture.metaGet('captureQueue')).length)).toBe(2);
 const raw=await page.evaluate(async()=>JSON.stringify([await fixture.metaGet('captureQueue'),await fixture.metaGet('captureKeys')]));
 expect(raw).not.toContain('PRIVATE LOCKED MESSAGE');
 expect(await page.evaluate(()=>fixture.queuedReference('blob:https://chat.zalo.me/locked-asset'))).toBe(true);
 expect(await page.evaluate(()=>fixture.queuedReference('blob:https://chat.zalo.me/unrelated'))).toBe(false);
 expect(await page.evaluate(()=>fixture.queuedReference('blob:https://chat.zalo.me/locked-asset',['a'.repeat(64)]))).toBe(true);
 expect(await page.evaluate(()=>fixture.queuedReference('blob:https://chat.zalo.me/locked-asset',['b'.repeat(64)]))).toBe(false);
 expect(raw).not.toContain('"d":'); // no plaintext RSA private exponent
 await page.evaluate(()=>fixture.metaWrite('captureCapacityReached',true));
 expect((await page.evaluate(()=>fixture.lockedCaptureStatus())).capacityReached).toBe(true);
 await boot(); // Browser session key gone; IndexedDB survives.
 expect(await page.evaluate(async()=>(await fixture.vaultStatus()).unlocked)).toBe(false);
 expect(await page.evaluate(async()=>{try{await fixture.unlockVault('wrong-pass');return false;}catch{return true;}})).toBe(true);
 expect(await page.evaluate(async()=>{try{await fixture.drainLocked(()=>{});return false;}catch{return true;}})).toBe(true);
 await page.evaluate(async()=>{
  await fixture.unlockVault('fixture-pass');
  try{await fixture.drainLocked(()=>{throw Error('simulated storage failure');});}catch{}
  if((await fixture.metaGet('captureQueue')).length!==2)throw Error('Pending data lost on failure');
  await fixture.drainLocked(async(payload,at)=>{const state=await fixture.loadState({});state.records=fixture.applyEvents(state.records,payload.events,state.settings,at);await fixture.saveState(state);});
 });
 const result=await page.evaluate(async()=>({state:await fixture.loadState({}),queue:await fixture.metaGet('captureQueue')}));
 expect(result.state.records).toHaveLength(1);
 expect(result.state.records[0].text).toBe('PRIVATE LOCKED MESSAGE');
 expect(result.state.records[0].recalledAt).toBeTruthy();
 expect(result.queue).toEqual([]);
 expect((await page.evaluate(()=>fixture.lockedCaptureStatus())).capacityReached).toBe(false);
 await page.evaluate(async()=>{
  await fixture.lockVault();
  await fixture.enqueueLocked({accountAlias:{from:'a'.repeat(64),scope:'b'.repeat(64),name:'PRIVATE ACCOUNT NAME'}});
 });
 expect(await page.evaluate(async()=>JSON.stringify(await fixture.metaGet('captureQueue')))).not.toContain('PRIVATE ACCOUNT NAME');
 await boot();
 await page.evaluate(()=>fixture.unlockVault('fixture-pass'));
 const alias=await page.evaluate(async()=>{let result;await fixture.drainLocked(payload=>{result=payload.accountAlias;});return result;});
 expect(alias).toEqual({from:'a'.repeat(64),scope:'b'.repeat(64),name:'PRIVATE ACCOUNT NAME'});
 await page.evaluate(async()=>{
  await fixture.lockVault();
  const event={platform:'zalo',accountScope:'c'.repeat(64),conversationId:'restart-account',messageId:'restart-message',event:'snapshot',kind:'text',text:'ORIGINAL BEFORE IDENTITY'};
  await fixture.enqueueLocked({events:[event]});
  await fixture.enqueueLocked({accountAlias:{from:'c'.repeat(64),scope:'d'.repeat(64),name:'Account after restart'}});
  await fixture.enqueueLocked({events:[{...event,accountScope:'d'.repeat(64),event:'recall',text:''}]});
 });
 await boot();
 await page.evaluate(async()=>{await fixture.unlockVault('fixture-pass');await fixture.drainLocked(fixture.restorePending);});
 const restored=await page.evaluate(async()=>(await fixture.loadState({})).records.filter(r=>r.conversationId==='restart-account'));
 expect(restored).toHaveLength(1);
 expect(restored[0]).toMatchObject({text:'ORIGINAL BEFORE IDENTITY',accountScope:'d'.repeat(64),hasOriginal:true});
 expect(restored[0].recalledAt).toBeTruthy();
 await page.evaluate(()=>{
  chrome.runtime={id:'fixture',onMessage:{addListener(){}},async sendMessage(){return {record:{text:'inline private text'},language:'en'};}};
  const node=document.createElement('div');document.body.append(node);fixture.startInlineViewer(()=>[{node,conversationId:'x',messageId:'y'}]);
 });
 await expect(page.locator('[data-stillhere-inline]')).toHaveCount(1);
 await page.evaluate(()=>{chrome.runtime.id=undefined;});
 await expect(page.locator('[data-stillhere-inline]')).toHaveCount(0,{timeout:6000});
 console.log('PASS locked capture: encrypted write, deduplication, restart, wrong password denied, snapshot + recall recovery');
}finally{await browser.close();}
