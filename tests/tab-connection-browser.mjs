import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=await mkdtemp(resolve(tmpdir(),'stillhere-connect-'));let context;
try {
 const extension=resolve(root,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 const file=resolve(extension,'manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
 // Remove declarative injection to prove background recovery can attach the reader alone.
 manifest.host_permissions=[...manifest.optional_host_permissions];await writeFile(file,JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(resolve(root,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const ui=await context.newPage();await ui.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);await ui.evaluate(async()=>{await chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-pass'});await chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,platforms:['zalo','facebook']});});
 for(const host of ['web.facebook.com','www.facebook.com','www.messenger.com','chat.zalo.me']) {
 await context.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Connection fixture</body></html>'}));
 const page=await context.newPage();await page.goto(`https://${host}/`);
 await expect.poll(()=>worker.evaluate(async host=>{
 const [tab]=await chrome.tabs.query({url:`https://${host}/*`});
 try{return (await chrome.tabs.sendMessage(tab.id,{type:'STILLHERE_PING'}))?.ready;}catch{return false;}
 },host),{timeout:10000}).toBe(true);
 }
 // UI requests focus the existing supported tab, never create a replacement.
 const targetId=await worker.evaluate(async()=>(await chrome.tabs.query({url:'https://web.facebook.com/*'}))[0].id);
 await ui.bringToFront();
 expect(await ui.evaluate(tabId=>chrome.runtime.sendMessage({type:'FOCUS_CHAT_TAB',tabId,platform:'facebook'}),targetId)).toEqual({ok:true});
 expect(await worker.evaluate(async id=>(await chrome.tabs.get(id)).active,targetId)).toBe(true);
 expect(await ui.evaluate(tabId=>chrome.runtime.sendMessage({type:'FOCUS_CHAT_TAB',tabId,platform:'zalo'}),targetId)).toEqual({ok:false});
 await worker.evaluate(id=>chrome.tabs.remove(id),targetId);
 expect(await ui.evaluate(tabId=>chrome.runtime.sendMessage({type:'FOCUS_CHAT_TAB',tabId,platform:'facebook'}),targetId)).toEqual({ok:false});
 console.log('PASS: UI focus request activates exact tab; rejects wrong platform and closed tab.');
 // Navigation preserves a tab ID; seed a known prior heartbeat to exercise
 // STATE and DIAGNOSTICS against the real worker rather than just the helper.
 const navigation=await context.newPage();
 await navigation.goto('https://chat.zalo.me/?navigation-fixture');
 const tabId=await worker.evaluate(async()=>{
   const tabs=await chrome.tabs.query({url:'https://chat.zalo.me/*'});
   return tabs.find(t=>t.url.includes('navigation-fixture')).id;
 });
 await navigation.goto('about:blank');
 await worker.evaluate(async id=>chrome.storage.session.set({
   ['health:'+id]:{tabId:id,platform:'zalo',at:Date.now(),online:true,matched:5,accountName:'Previous Zalo fixture'}
 }),tabId);
 let state=await ui.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));
 expect(state.health.some(h=>h.tabId===tabId)).toBe(false);
 let diagnostics=await ui.evaluate(()=>chrome.runtime.sendMessage({type:'DIAGNOSTICS'}));
 expect(diagnostics.tabs.some(t=>t.tabId===tabId)).toBe(false);
 await navigation.goto('https://www.facebook.com/?navigation-fixture');
 await worker.evaluate(async id=>chrome.storage.session.set({
   ['health:'+id]:{tabId:id,platform:'zalo',at:Date.now(),online:true,matched:5,accountName:'Previous Zalo fixture'}
 }),tabId);
 state=await ui.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));
 expect(state.health.some(h=>h.tabId===tabId&&h.platform==='zalo')).toBe(false);
 diagnostics=await ui.evaluate(()=>chrome.runtime.sendMessage({type:'DIAGNOSTICS'}));
 const navigated=diagnostics.tabs.find(t=>t.tabId===tabId);
 expect(navigated.platform).toBe('facebook');
 expect(navigated.accountName).not.toBe('Previous Zalo fixture');
 console.log('PASS: same-tab navigation excludes obsolete platform heartbeat and account from STATE and DIAGNOSTICS.');
 console.log('PASS: background automatically attaches Facebook homepage, Messenger and Zalo readers after setup without page reload.');
} finally {await context?.close();await rm(root,{recursive:true,force:true});}
