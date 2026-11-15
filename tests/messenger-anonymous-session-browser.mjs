import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
const root=await mkdtemp(join(tmpdir(),'stillhere-reopen-'));let context;
try{
 const extension=join(root,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 const mf=join(extension,'manifest.json'),manifest=JSON.parse(await readFile(mf,'utf8'));manifest.host_permissions=[...manifest.optional_host_permissions];await writeFile(mf,JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const ui=await context.newPage();await ui.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 const request=(type,values={})=>ui.evaluate(m=>chrome.runtime.sendMessage(m),{type,...values});
 await request('VAULT_SETUP',{password:'Fixture6!'});await request('SETTINGS',{consent:true,enabled:true,platforms:['facebook']});
 let name='';
 await context.route('https://www.messenger.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><div data-message-id="old-recall" aria-label="At 11:18, You">You sent<br>You deleted a message</div><div data-message-id="other-recall" aria-label="At 11:18, You">You sent<br>You deleted a message</div>`}));
 let chat=await context.newPage();await chat.goto('https://www.messenger.com/t/123/');
 await expect.poll(async()=>(await request('STATE')).records.length).toBe(2);
 const initial=(await request('STATE')).records.map(r=>r.id).sort();
 const initialScopes=(await request('STATE')).records.map(r=>r.accountScope);
 for(let i=0;i<2;i++){
  await worker.evaluate(()=>chrome.storage.session.clear());
  await request('VAULT_UNLOCK',{password:'Fixture6!'});
  await request('SETTINGS',{consent:true,enabled:true,platforms:['facebook']});
  await expect.poll(()=>worker.evaluate(async()=>Object.keys(await chrome.storage.session.get(null)).filter(k=>k.startsWith('unknown:')).length)).toBeGreaterThan(0);
  // Wait for a fresh reader heartbeat and capture cycle without navigating the document.
  await expect.poll(async()=>{
   const state=await request('STATE');
   return state.records.map(r=>r.accountScope);
  }).toEqual(initialScopes);
  await chat.evaluate(()=>document.querySelector('[data-message-id]').setAttribute('data-fixture-cycle',String(Date.now())));
  await new Promise(resolve=>setTimeout(resolve,2500));
  expect((await request('STATE')).records.map(r=>r.id).sort()).toEqual(initial);
 }
 console.log('PASS anonymous document: clearing extension session twice and reconnecting preserves two distinct recall records and their partition. No page reload or identity inference.');
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
