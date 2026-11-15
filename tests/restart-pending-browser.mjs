import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'stillhere-restart-'));
const bundle=await build({stdin:{contents:`export * from './src/core/vault.js';export * from './src/core/locked-capture.js';export * from './src/core/restore-pending.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'fixture'});
let context;
async function open(){
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true});
 const page=await context.newPage();
 await page.route('http://localhost/**',r=>r.fulfill({body:'<!doctype html><title>Restart fixture</title>'}));
 await page.goto('http://localhost/');
 await page.evaluate(()=>{
  const area=()=>{const values={};return {async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]]));},async set(v){Object.assign(values,v);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];},async setAccessLevel(){}};};
  window.chrome={storage:{session:area(),local:area()}};
 });
 await page.addScriptTag({content:bundle.outputFiles[0].text});return page;
}
try{
 let page=await open();
 await page.evaluate(async()=>{
  await fixture.setupVault('fixture-pass',{consent:true,enabled:true,retentionDays:30});await fixture.prepareLockedCapture();await fixture.lockVault();
  const event={platform:'zalo',conversationId:'restart',messageId:'one',event:'snapshot',kind:'text',text:'Survives browser process restart',accountScope:'a'.repeat(64)};
  await fixture.enqueueLocked({events:[event]});
  await fixture.enqueueLocked({accountAlias:{from:'a'.repeat(64),scope:'b'.repeat(64),name:'Account B'}});
  await fixture.enqueueLocked({events:[{...event,accountScope:'b'.repeat(64),event:'recall',text:''}]});
 });
 await context.close();context=null;
 page=await open();
 expect(await page.evaluate(async()=>(await fixture.vaultStatus()).unlocked)).toBe(false);
 expect(await page.evaluate(async()=>(await fixture.metaGet('captureQueue')).length)).toBe(3);
 await page.evaluate(async()=>{await fixture.unlockVault('fixture-pass');await fixture.drainLocked(fixture.restorePending);});
 const state=await page.evaluate(()=>fixture.loadState({}));
 expect(state.records).toHaveLength(1);
 expect(state.records[0]).toMatchObject({text:'Survives browser process restart',accountScope:'b'.repeat(64),hasOriginal:true});
 expect(state.records[0].recalledAt).toBeTruthy();
 expect(await page.evaluate(()=>fixture.metaGet('captureQueue'))).toEqual([]);
 console.log('PASS Chromium process restart: encrypted pending snapshot + identity link + recall restore one original after password unlock. Chrome storage API mocked; production IndexedDB/crypto/consumer.');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});}
