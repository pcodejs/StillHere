import {chromium,expect} from '@playwright/test';import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {exportPortable} from '../src/core/vault.js';
const root=await mkdtemp(join(tmpdir(),'stillhere-audit-denied-')),extension=join(root,'extension'),profile=join(root,'profile');let c;
await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
const background=join(extension,'background.js');await writeFile(background,`const originalInstallListener=chrome.runtime.onInstalled.addListener.bind(chrome.runtime.onInstalled);chrome.runtime.onInstalled.addListener=fn=>{globalThis.fixtureInstalled=fn;originalInstallListener(fn);};\n`+await readFile(background,'utf8'));
async function launch(){c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');return {w,url:`chrome-extension://${new URL(w.url()).host}/`};}
try{
 const {w,url}=await launch();await expect.poll(()=>w.evaluate(()=>typeof globalThis.fixtureInstalled)).toBe('function');
 await w.evaluate(()=>globalThis.fixtureInstalled({reason:'update',previousVersion:'0.7.1'}));
 await expect.poll(()=>w.evaluate(async()=>(await chrome.storage.local.get('releaseNotice')).releaseNotice?.version)).toBe(await w.evaluate(()=>chrome.runtime.getManifest().version));
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.goto(url+'popup.html');await expect(p.locator('.update-notice')).toContainText(await w.evaluate(()=>chrome.runtime.getManifest().version));await p.getByRole('button',{name:'Đóng thông báo cập nhật'}).click();await p.reload();await expect(p.locator('.update-notice')).toHaveCount(0);
 await p.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-pass'}));await p.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:false,platforms:['zalo']}));
 // Missing host access must render its recovery action without crashing.
 await p.reload();
 await expect(p.locator('#status')).toContainText('Chưa cấp quyền');
 await p.locator('.archive-status').getByRole('button',{name:'Cấp quyền',exact:true}).click();
 await expect(p.locator('#settings')).toBeVisible();
 expect(errors).toEqual([]);
 for(const outcome of ['denied','unconfirmed','disconnected']){
 await p.reload();await p.locator('#settings-button').click();
 await p.evaluate(outcome=>{window.originalSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(m,...a)=>m?.type==='SETTINGS'?(outcome==='disconnected'?Promise.reject(Error('Disconnected')):Promise.resolve({ok:outcome==='unconfirmed'})):window.originalSend(m,...a);},outcome);
 await p.locator('#settings-capture-toggle').focus();await p.keyboard.press('Space');
 await expect(p.locator('#main-content [role=alert]')).toBeVisible();await expect(p.locator('#settings-capture-toggle')).not.toBeChecked();await expect(p.locator('.action-notice')).toHaveCount(0);
 const state=await p.evaluate(()=>window.originalSend({type:'STATE'}));expect(state.settings.enabled).toBe(false);
 }
 // Deletion is confined to this disposable profile. The current Settings view must refresh immediately.
 await p.reload();
 const now=Date.now();
 const backup=await exportPortable([{platform:'zalo',conversationId:'clear-fixture',messageId:'clear-fixture',sender:'Tester',text:'Disposable clear fixture',kind:'text',hasOriginal:true,firstSeen:now-2000,recalledAt:now-1000}],'fixture-backup');
 await p.evaluate(backup=>chrome.runtime.sendMessage({type:'BACKUP_IMPORT',backup,password:'fixture-backup'}),backup);
 await p.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,platforms:['zalo']}));
 await p.reload();await p.locator('#settings-button').click();
 await expect(p.locator('footer')).toContainText('1 tin bị thu hồi');
 await p.evaluate(()=>{window.clearSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(m,...args)=>m?.type==='CLEAR'?Promise.resolve({ok:false}):window.clearSend(m,...args);});
 await p.locator('#clear').click();await p.locator('#confirm-clear').click();
 await expect(p.locator('#main-content [role=alert]')).toContainText('Chưa xác nhận được kết quả xoá');
 await expect(p.locator('.action-notice')).toHaveCount(0);
 expect((await p.evaluate(()=>window.clearSend({type:'STATE'}))).records).toHaveLength(1);
 await p.getByText('EN',{exact:true}).first().click();
 await expect(p.locator('#main-content [role=alert]')).toContainText('Could not confirm deletion');
 // An accepted response alone cannot confirm a deletion that did not reach storage.
 await p.evaluate(()=>{chrome.runtime.sendMessage=(m,...args)=>m?.type==='CLEAR'?Promise.resolve({ok:true}):window.clearSend(m,...args);});
 await p.locator('#confirm-clear').click();
 await expect(p.locator('#main-content [role=alert]')).toContainText('Could not confirm deletion');
 await expect(p.locator('.action-notice')).toHaveCount(0);
 expect((await p.evaluate(()=>window.clearSend({type:'STATE'}))).records).toHaveLength(1);
 await p.getByText('VI',{exact:true}).first().click();
 await p.evaluate(()=>{chrome.runtime.sendMessage=window.clearSend;});
 await p.locator('#confirm-clear').click();
 await expect(p.locator('.action-notice')).toContainText('Đã xoá tin đã lưu');
 await expect(p.locator('footer')).toContainText('0 tin bị thu hồi');
 await expect(p.locator('#settings-capture-toggle')).not.toBeChecked();
 await expect(p.locator('#clear-confirm')).toHaveCount(0);
 await expect(p.locator('#clear')).toBeFocused();
 await p.screenshot({path:'outputs/screenshots/audit-076-denied-setting.png'});
 console.log('PASS: rejected, unconfirmed and disconnected settings keep capture off; rejected clear preserves records without success; confirmed clear immediately refreshes Settings, count and focus.');
}finally{await c?.close();await rm(root,{recursive:true,force:true});}
