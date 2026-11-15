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
 let name='Fixture Owner';
 await context.route('https://www.messenger.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><button aria-label="${name} @fixture - Settings, help and more"></button><div data-message-id="old-recall" aria-label="At 11:18, You">You sent<br>You deleted a message</div><div data-message-id="other-recall" aria-label="At 11:18, You">You sent<br>You deleted a message</div>`}));
 let chat=await context.newPage();await chat.goto('https://www.messenger.com/t/123/');
 await expect.poll(async()=>(await request('STATE')).records.length).toBe(2);
 await expect.poll(async()=>(await request('STATE')).records.every(r=>r.accountName===name)).toBe(true);
 const initial=(await request('STATE')).records.map(r=>r.id).sort();
 for(let i=0;i<2;i++){
  await chat.reload();
  await expect.poll(()=>worker.evaluate(async()=>Object.entries(await chrome.storage.session.get(null)).filter(([k,v])=>k.startsWith('tab-account:')&&v?.name==='Fixture Owner').length)).toBeGreaterThan(i+1);
  expect((await request('STATE')).records.map(r=>r.id).sort()).toEqual(initial);
 }
 await chat.close();chat=await context.newPage();await chat.goto('https://www.messenger.com/t/123/');
 await expect.poll(()=>worker.evaluate(async()=>Object.entries(await chrome.storage.session.get(null)).filter(([k,v])=>k.startsWith('tab-account:')&&v?.name==='Fixture Owner').length)).toBeGreaterThan(3);
 expect((await request('STATE')).records.map(r=>r.id).sort()).toEqual(initial);
 console.log('PASS explicit own-account control: two distinct recalls at same minute preserved; reload twice and reopen tab retain exactly two records and stable IDs.');
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
