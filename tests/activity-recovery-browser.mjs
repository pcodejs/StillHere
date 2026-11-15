import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'stillhere-activity-'));let c;
try{
 const extension=resolve('outputs/go-lai-extension');c=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker'),p=await c.newPage(),url=`chrome-extension://${new URL(w.url()).host}/popup.html`;const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(url);await p.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-pass'}));
 await p.addInitScript(()=>{const send=chrome.runtime.sendMessage.bind(chrome.runtime);window.activityResult={ok:false};chrome.runtime.sendMessage=(m,...a)=>m?.type==='DIAGNOSTICS'?Promise.resolve(window.activityResult):send(m,...a);});
 await p.reload();await p.locator('#diagnostics-button').click();await expect(p.locator('#diagnostics [role=alert]')).toContainText('Chưa đọc được');await expect(p.locator('.primary-nav')).toBeVisible();
 await p.evaluate(()=>{window.activityResult={tabs:[null,{platform:'unsupported'}, {tabId:7,platform:'facebook',accountName:'QA account',status:'connected',lastSeen:Date.now()}],saving:true};});
 await expect(p.locator('#diagnostics')).toContainText('QA account');await expect(p.locator('#diagnostics [role=alert]')).toHaveCount(0);
 await p.getByText('EN',{exact:true}).click();await expect(p.locator('#diagnostics')).toContainText('Open platform');
 for(const width of [360,800]){await p.setViewportSize({width,height:600});await expect(p.locator('footer #support-button')).toBeVisible();await p.locator('#support-button').click();await expect(p.locator('#support')).toBeVisible();expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(errors).toEqual([]);console.log('PASS invalid activity response recovers; unsupported entries ignored; real rows render; support outside menu VI/EN narrow/wide.');
}finally{await c?.close();await rm(dir,{recursive:true,force:true});}
