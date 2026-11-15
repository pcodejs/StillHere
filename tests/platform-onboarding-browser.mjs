import {chromium,expect} from '@playwright/test';import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {selectedOrigins} from '../src/core/platform-access.js';
const root=await mkdtemp(join(tmpdir(),'stillhere-platform-'));let c;
try{
 const extension=join(root,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});const file=join(extension,'manifest.json'),manifest=JSON.parse(await readFile(file));
 // Test-only permission grant avoids native confirmation UI. Product manifest has no required origins.
 manifest.host_permissions=[...manifest.optional_host_permissions];await writeFile(file,JSON.stringify(manifest));
 for(const choice of ['zalo','facebook','both']){
 c=await chromium.launchPersistentContext(join(root,choice),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');
 for(const host of ['chat.zalo.me','www.facebook.com','www.messenger.com']){await c.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture</title><main>No chat loaded</main>'}));const tab=await c.newPage();await tab.goto(`https://${host}/`);}
 const ping=()=>w.evaluate(async()=>{const rows=[];for(const t of await chrome.tabs.query({url:['https://chat.zalo.me/*','https://www.facebook.com/*','https://www.messenger.com/*']})){let ready=false;try{ready=!!(await chrome.tabs.sendMessage(t.id,{type:'STILLHERE_PING'}))?.ready;}catch{}rows.push({host:new URL(t.url).host,ready});}return rows;});
 expect((await ping()).every(r=>!r.ready)).toBe(true);
 const p=await c.newPage();await p.goto(`chrome-extension://${new URL(w.url()).host}/popup.html`);await p.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-pass'}));await p.reload();await expect(p.locator('#onboarding')).toBeVisible();
 await p.evaluate(()=>{window.permissionCalls=[];window.allowPermission=false;chrome.permissions.request=async args=>{window.permissionCalls.push(args.origins);return window.allowPermission;};});
 await p.getByRole('combobox',{name:'Bạn muốn dùng nền tảng nào?',exact:true}).click();await p.getByRole('option',{name:choice==='both'?'Zalo và Facebook':choice==='zalo'?'Zalo':'Facebook / Messenger',exact:true}).click();await p.locator('#consent').check();await p.locator('#enable').click();await expect(p.locator('[role=alert]')).toContainText('StillHere chưa bật lưu tin');expect((await p.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).settings.consent).toBe(false);
 await p.getByText('EN',{exact:true}).click();
 await expect(p.locator('[role=alert]')).toContainText('message capture is still off');
 await p.getByText('VI',{exact:true}).click();
 await p.evaluate(()=>window.allowPermission=true);await p.locator('#enable').click();await expect(p.locator('#onboarding')).toHaveCount(0);
 expect(await p.evaluate(()=>window.permissionCalls.at(-1))).toEqual(selectedOrigins(choice==='both'?['zalo','facebook']:[choice]));
 await expect.poll(ping,{timeout:15000}).toEqual([{host:'chat.zalo.me',ready:choice!=='facebook'},{host:'www.facebook.com',ready:choice!=='zalo'},{host:'www.messenger.com',ready:choice!=='zalo'}]);
 // No page reloads: selection attaches the already open background documents.
 await p.locator('#diagnostics-button').click();await expect(p.locator('#diagnostics')).toContainText('Kết nối và lưu tin');await expect(p.locator('#diagnostics .error')).toHaveCount(0);
 await c.close();c=null;
 }
 console.log('PASS Zalo/Facebook/both exact requests; denial does not enable capture; chosen existing tabs attach without reload, others untouched.');
}finally{await c?.close();await rm(root,{recursive:true,force:true});}
