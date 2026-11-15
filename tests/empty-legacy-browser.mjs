import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const dir=await mkdtemp(resolve(tmpdir(),'fsub-empty-legacy-'));
const extension=resolve(dir,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
let context;
try {
 context=await chromium.launchPersistentContext(resolve(dir,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 await page.evaluate(async()=>{
  const open=name=>new Promise((res,rej)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  const empty=await open('go-lai-resource-cache');empty.close();
  await chrome.storage.local.set({records:[{id:'legacy',text:'Existing message preserved'}]});
 });
 const result=await page.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'test6!'}));expect(result).toMatchObject({configured:true,unlocked:true});
 // Inspect encrypted migrated state without retention filtering of the minimal fixture.
 const rows=await page.evaluate(async()=>{
  const db=await new Promise(res=>{const r=indexedDB.open('fsub-password-vault');r.onsuccess=()=>res(r.result)});
  const state=await new Promise(res=>{const r=db.transaction('meta').objectStore('meta').get('state');r.onsuccess=()=>res(r.result)});db.close();
  const {vaultUnlock}=await chrome.storage.session.get('vaultUnlock');
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('raw',bytes(vaultUnlock.key),'AES-GCM',false,['decrypt']);
  const text=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(state.vault.iv),additionalData:new TextEncoder().encode('go-lai-archive-v1')},key,bytes(state.vault.data));
  return JSON.parse(new TextDecoder().decode(text));
 });
 expect(rows).toEqual([{id:'legacy',text:'Existing message preserved'}]);
 console.log('PASS: existing empty legacy resource database does not block password setup; existing message preserved.');
} finally {await context?.close();await rm(dir,{recursive:true,force:true});}
