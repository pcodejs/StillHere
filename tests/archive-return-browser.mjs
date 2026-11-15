import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
const root=await mkdtemp(join(tmpdir(),'stillhere-return-'));let context;
try{
 const extension=resolve('outputs/go-lai-extension');
 context=await chromium.launchPersistentContext(root,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const p=await context.newPage();
 const url=`chrome-extension://${new URL(worker.url()).host}/popup.html`;await p.goto(url);
 await p.evaluate(async()=>{await chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture6!'});await chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,platforms:['facebook']});});
 await p.addInitScript(()=>{
  const send=chrome.runtime.sendMessage.bind(chrome.runtime);window.fixtureConnected=false;window.stateReads=0;
  chrome.runtime.sendMessage=async(m,...args)=>{const result=await send(m,...args);if(m.type==='STATE'&&!result.error){window.stateReads++;return {...result,sitePermissions:{facebook:true},tabsByPlatform:{facebook:1},health:window.fixtureConnected?[{platform:'facebook',online:true,matched:1,fresh:true,background:true}]:[]};}return result;};
 });
 await p.goto(url);await expect(p.locator('#archive-button')).toBeVisible();
 await p.locator('#diagnostics-button').click();
 await p.evaluate(()=>{window.fixtureConnected=true;window.stateReads=0;});
 await p.locator('#archive-button').click();
 await expect(p.locator('.archive-status')).toHaveClass(/status-background/,{timeout:1500});
 expect(await p.evaluate(()=>window.stateReads)).toBeGreaterThan(0);
 console.log('PASS returning from diagnostics refreshes archive status immediately, without waiting for five-second polling.');
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
