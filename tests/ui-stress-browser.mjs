import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'stillhere-stress-'));let c;
try{
 const extension=resolve('outputs/go-lai-extension');c=await chromium.launchPersistentContext(root,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));const url=`chrome-extension://${new URL(w.url()).host}/popup.html`;
 for(const lang of ['VI','EN'])for(const zoom of [1,1.25,2]){
  await p.setViewportSize({width:1000,height:600});await p.goto(url+'?demo=1');await p.getByText(lang,{exact:true}).first().click();
  // Real Chrome tab zoom, not CSS transform or screenshot scaling.
  await p.evaluate(async factor=>{const tab=await chrome.tabs.getCurrent();await chrome.tabs.setZoom(tab.id,factor);},zoom);
  for(const view of ['archive','settings','diagnostics','feedback','about','support']){
   if(['feedback','about'].includes(view))await p.locator('.more-menu').click();await p.locator('#'+view+'-button').click();
   await expect.poll(()=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   expect(await p.locator('.primary-nav').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('header').getBoundingClientRect().bottom+1)).toBe(true);
   expect(await p.locator('#main-content').evaluate(e=>e.clientHeight)).toBeGreaterThan(60);
   await p.locator('#main-content').evaluate(e=>e.scrollTop=e.scrollHeight);
   await expect.poll(async()=>p.locator('#main-content').evaluate(e=>{e.scrollTop=e.scrollHeight;return e.scrollTop+e.clientHeight>=e.scrollHeight-2;}),{message:`scroll end ${lang} ${zoom} ${view}`}).toBe(true);
  }
  await p.locator('#settings-button').click();await expect.poll(()=>p.locator('#main-content').evaluate(e=>e.scrollTop)).toBe(0);
  await p.screenshot({path:`outputs/screenshots/stress-${lang}-${zoom}.png`});
 }
 expect(errors).toEqual([]);console.log('PASS actual Chrome tab zoom 100/125/200%, VI/EN six screens, no document overflow, scroll reaches end, navigation resets scroll, no page errors.');
}finally{await c?.close();await rm(root,{recursive:true,force:true});}
