import {chromium,expect} from '@playwright/test';import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {exportPortable} from '../src/core/vault.js';
const root=await mkdtemp(join(tmpdir(),'stillhere-073-')),extension=join(root,'extension'),profile=join(root,'profile');let c;
await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
// Fixture-only grant: product asks for this permission during onboarding.
const mf=join(extension,'manifest.json'),manifest=JSON.parse(await readFile(mf,'utf8'));manifest.host_permissions=['https://chat.zalo.me/*'];await writeFile(mf,JSON.stringify(manifest));
const background=join(extension,'background.js');await writeFile(background,`const originalInstallListener=chrome.runtime.onInstalled.addListener.bind(chrome.runtime.onInstalled);chrome.runtime.onInstalled.addListener=fn=>{globalThis.fixtureInstalled=fn;originalInstallListener(fn);};\n`+await readFile(background,'utf8'));
async function launch(){c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');return {w,url:`chrome-extension://${new URL(w.url()).host}/`};}
try{
 const {w,url}=await launch();await expect.poll(()=>w.evaluate(()=>typeof globalThis.fixtureInstalled)).toBe('function');
 await w.evaluate(()=>globalThis.fixtureInstalled({reason:'update',previousVersion:'0.7.1'}));
 await expect.poll(()=>w.evaluate(async()=>(await chrome.storage.local.get('releaseNotice')).releaseNotice?.version)).toBe(await w.evaluate(()=>chrome.runtime.getManifest().version));
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.goto(url+'popup.html');await expect(p.locator('.update-notice')).toContainText(await w.evaluate(()=>chrome.runtime.getManifest().version));await p.getByRole('button',{name:'Đóng thông báo cập nhật'}).click();await p.reload();await expect(p.locator('.update-notice')).toHaveCount(0);
 await p.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-pass'}));await p.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:false,platforms:['zalo']}));
 const now=Date.now(),record={platform:'zalo',conversationId:'fixture',messageId:'pin',sender:'Tester',text:'Original fixture',kind:'text',hasOriginal:true,firstSeen:now-2000,recalledAt:now-1000};
 const backup=await exportPortable([record],'fixture-pass');await p.evaluate(backup=>chrome.runtime.sendMessage({type:'BACKUP_IMPORT',backup,password:'fixture-pass'}),backup);await p.reload();
 // Escape dismisses the inner menu without triggering Chrome's native popup dismissal.
 await p.locator('.more-menu').focus();await p.keyboard.press('Enter');await expect(p.getByRole('menu')).toBeVisible();
 await p.keyboard.press('ArrowDown');
 expect(await p.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});document.activeElement.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
 await expect(p.getByRole('menu')).toBeHidden();await expect(p.locator('.more-menu')).toBeFocused();
 expect(await p.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});document.activeElement.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);
 await p.evaluate(()=>{window.annotationSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(m,...a)=>m?.type==='ANNOTATE'?Promise.resolve({ok:false}):window.annotationSend(m,...a);});
 await p.getByRole('button',{name:'Đánh dấu quan trọng',exact:true}).click();await expect(p.locator('#main-content [role=alert]')).toContainText('Chưa xác nhận');await expect(p.getByRole('button',{name:'Đánh dấu quan trọng',exact:true})).toHaveAttribute('aria-pressed','false');
 await p.evaluate(()=>{chrome.runtime.sendMessage=window.annotationSend;});
 await p.getByRole('button',{name:'Đánh dấu quan trọng',exact:true}).click();await expect(p.getByRole('button',{name:'Bỏ đánh dấu',exact:true})).toHaveAttribute('aria-pressed','true');await expect(p.locator('.message strong svg')).toBeVisible();
 await p.getByRole('button',{name:'Thêm ghi chú',exact:true}).click();await p.getByLabel('Ghi chú riêng',{exact:true}).fill('Private note fixture');await p.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await p.reload();await expect(p.locator('.note-preview')).toHaveText('Private note fixture');await expect(p.getByRole('button',{name:'Bỏ đánh dấu',exact:true})).toBeVisible();
 await p.locator('.filter-toggle').click();await p.getByRole('checkbox',{name:'Chỉ tin quan trọng',exact:true}).check();await expect(p.locator('.message')).toHaveCount(1);await p.getByRole('button',{name:'Bỏ đánh dấu',exact:true}).click();await expect(p.locator('.message')).toHaveCount(0);await p.locator('.clear-filters').click();await expect(p.locator('.message')).toHaveCount(1);
 await p.locator('#settings-button').click();await p.getByRole('combobox',{name:'Cách lưu',exact:true}).click();await p.getByRole('option',{name:'Không lưu đã chọn',exact:true}).click();await expect(p.locator('.action-notice')).toContainText('Đã lưu thay đổi');await p.reload();await expect(p.getByRole('combobox',{name:'Cách lưu',exact:true})).toHaveValue('Không lưu đã chọn');
 for(const lang of ['vi','en']){
  await p.goto(url+(lang==='en'?'privacy-en.html':'privacy.html'));await p.locator('#section-10').evaluate(el=>el.scrollIntoView());await expect(p.locator('.policy-toc [aria-current=location]')).toHaveAttribute('href','#section-10');await expect(p.locator('#section-10')).toContainText('UNG HO StillHere');await p.locator('#section-16').evaluate(el=>el.scrollIntoView());await expect(p.locator('.policy-toc [aria-current=location]')).toHaveAttribute('href','#section-16');
  for(const width of [360,800,1280]){await p.setViewportSize({width,height:800});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await p.goto(url+(lang==='en'?'changelog-en.html':'changelog.html'));await expect(p.locator('h1')).toContainText(lang==='en'?'Version history':'Lịch sử phiên bản');await expect(p.locator('.policy-section')).toHaveCount(8);
 }
 expect(errors).toEqual([]);console.log('PASS update handler event fixture notice/dismiss persistence; pin/filter/unpin; encrypted note reload; privacy scrollspy VI/EN responsive; changelog.');
}finally{await c?.close();await rm(root,{recursive:true,force:true});}
