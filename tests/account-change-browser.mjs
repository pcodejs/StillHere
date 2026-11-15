import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,rm,cp,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const testDir=await mkdtemp(resolve(tmpdir(),'go-lai-browser-'));
const extension=resolve(testDir,'extension'), profile=resolve(testDir,'profile');
await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
// Simulate the user's optional CDN grant only inside this disposable test copy.
// The distributable manifest continues to declare these origins as optional.
const testManifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));
testManifest.host_permissions=[...(testManifest.host_permissions||[]),...testManifest.optional_host_permissions];
await writeFile(resolve(extension,'manifest.json'),JSON.stringify(testManifest));
await rm(profile,{recursive:true,force:true});await mkdir('outputs/screenshots',{recursive:true});
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-gpu',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:800,height:600}});
let service=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const id=new URL(service.url()).host;
const errors=[];
context.on('weberror',e=>errors.push(String(e.error())));
// Synthetic site only. Never load a real login/session in this test profile.
await context.route('https://*.zadn.vn/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJRkAAAAASUVORK5CYII=','base64')}));
await context.route('https://chat.zalo.me/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Synthetic Zalo render fixture</title></head><body><div id="messageView"></div></body></html>'}));
const zalo=await context.newPage();await zalo.goto('https://chat.zalo.me/');
await zalo.evaluate(()=>{const header=document.createElement('div');header.id='account-header';header.__reactFiber$fixture={memoizedProps:{currUser:{userId:'self-qa',displayName:'Tài khoản QA FSUB'}}};document.body.prepend(header);});
const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
expect(await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture password 054 secure'}))).toMatchObject({unlocked:true});
await popup.reload();
await expect(popup.locator('#onboarding')).toBeVisible();
await expect(popup.locator('#enable')).toBeDisabled();
await expect(popup.locator('#demo')).toHaveCount(0);
await zalo.evaluate(()=>window.postMessage({channel:'go-lai-control-v1',token:crypto.randomUUID(),enabled:true,cacheMedia:false},location.origin));
await popup.screenshot({animations:'disabled',path:'outputs/screenshots/01-consent.png'});
await popup.locator('.more-menu').click();await popup.locator('#feedback-button').click();
await expect(popup.locator('#feedback')).toBeVisible();
await expect(popup.locator('#telegram-settings')).toHaveCount(0);
await popup.locator('#feedback-message').fill('Đề xuất cải thiện bộ lọc tin nhắn.');
await popup.locator('#feedback-consent').check();
await expect(popup.locator('#feedback-submit')).toBeEnabled();

await expect.poll(async()=>service.evaluate(async()=>JSON.stringify(await chrome.storage.local.get('feedbackDraft')))).not.toContain('Đề xuất cải thiện');await popup.goto(`chrome-extension://${id}/popup.html?feedback=1`);await expect(popup.locator('#feedback-message')).toHaveValue('Đề xuất cải thiện bộ lọc tin nhắn.');await expect(popup.locator('#feedback-consent')).not.toBeChecked();await popup.screenshot({animations:'disabled',path:'outputs/screenshots/08-feedback.png'});
await popup.setViewportSize({width:360,height:600});
await expect.poll(()=>popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
await popup.locator('#feedback-submit').scrollIntoViewIfNeeded();const narrowFallback=await popup.locator('#feedback-submit').boundingBox();expect(narrowFallback.y+narrowFallback.height).toBeLessThan(550);
await popup.screenshot({animations:'disabled',path:'outputs/screenshots/09-feedback-narrow.png'});
await popup.setViewportSize({width:800,height:600});
await popup.locator('#archive-button').click();
async function renderMessage(m, recall=false){
  await zalo.evaluate(({m,recall})=>{
    const id='fixture-'+m.msgId;document.getElementById(id)?.remove();
    const outer=document.createElement('div');outer.id=id;
    const inner=document.createElement('div');inner.id='text-mCntr_'+m.cliMsgId;inner.className=recall?'undo-message':'';inner.textContent=recall?'Tin nhắn đã được thu hồi':m.message;
    inner.__reactFiber$fixture={memoizedProps:{data:m},return:{memoizedProps:{conversation:{userId:m.toUid,type:m.toUid.startsWith('g')?2:3,name:m.toUid.startsWith('g')?'Nhóm kiểm thử':'Tài khoản kiểm thử',avatar:m.toUid.startsWith('g')?'https://s120-ava-talk.zadn.vn/test-group.jpg':''}}}};
    outer.append(inner);document.getElementById('messageView').append(outer);
  },{m,recall});
}
const base={msgId:'101',cliMsgId:'501',toUid:'u100',msgType:1,fromUid:'42',dName:'Người thử nghiệm',message:'[TEST] Nội dung trước khi thu hồi',sendDttm:Date.now()};
await renderMessage(base);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.length)).toBe(0);
await popup.locator('#consent').check();await popup.locator('#enable').click();
await zalo.evaluate(()=>{const token=crypto.randomUUID();window.postMessage({channel:'fsub-unsend-control-v2',token,enabled:true,cacheMedia:false},location.origin);window.postMessage({channel:'fsub-unsend-control-v2',token,enabled:false,cacheMedia:false},location.origin);});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.length)).toBe(1);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).health.some(h=>h.accountName==='Tài khoản QA FSUB'))).toBe(true);await popup.reload();await expect(popup.locator('#status')).toContainText('Tài khoản QA FSUB');

await zalo.evaluate(()=>{document.getElementById('account-header').__reactFiber$fixture.memoizedProps.currUser={userId:'second-account',displayName:'Second account'};});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'VAULT_STATUS'})).unlocked),{timeout:20000}).toBe(false);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'VAULT_STATUS'})).capture.accountBlocked),{timeout:20000}).toBe(true);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).error).toBeTruthy();
await zalo.evaluate(()=>document.getElementById('messageView').replaceChildren());
await expect.poll(async()=>service.evaluate(async()=>(await chrome.storage.session.get('pending-account:zalo'))['pending-account:zalo']?.id),{timeout:20000}).toBe('second-account');
expect(await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Fixture password 054 secure'}))).toMatchObject({unlocked:true});
await renderMessage({...base,msgId:'new-account-msg',cliMsgId:'new-account-cli',message:'New account after explicit unlock'});
await expect.poll(async()=>popup.evaluate(async()=>{const state=await chrome.runtime.sendMessage({type:'STATE'});return state.records?.some(r=>r.messageId==='new-account-msg');}),{timeout:15000}).toBe(true);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_STATUS'}))).unlocked).toBe(true);
expect(await service.evaluate(async()=>(await chrome.storage.session.get('active-account:zalo'))['active-account:zalo']?.id)).toBe('second-account');
// A second document with another account must not look like a switch in the first.
const other=await context.newPage();await other.goto('https://chat.zalo.me/');
await other.evaluate(()=>{const header=document.createElement('div');header.id='account-header';header.__reactFiber$fixture={memoizedProps:{currUser:{userId:'third-account',displayName:'Third account'}}};document.body.prepend(header);});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).health?.some(h=>h.accountName==='Third account')),{timeout:20000}).toBe(true);
for(let i=0;i<3;i++){
 await zalo.evaluate(()=>document.body.setAttribute('data-fixture-heartbeat',String(Date.now())));
 await other.evaluate(()=>document.body.setAttribute('data-fixture-heartbeat',String(Date.now())));
 await popup.waitForTimeout(2000);
 expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_STATUS'}))).unlocked).toBe(true);
}
await other.close();
// A new document in the same tab must detect a changed identity, without
// borrowing the old account's scope for messages rendered before identification.
await zalo.reload();
await zalo.evaluate(()=>{const header=document.createElement('div');header.id='account-header';header.__reactFiber$fixture={memoizedProps:{currUser:{userId:'after-navigation',displayName:'After navigation'}}};document.body.prepend(header);});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'VAULT_STATUS'})).unlocked),{timeout:20000}).toBe(false);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).error).toBeTruthy();
expect(await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Fixture password 054 secure'}))).toMatchObject({unlocked:true});
await renderMessage({...base,msgId:'navigation-msg',cliMsgId:'navigation-cli',message:'New document account'});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records?.some(r=>r.messageId==='navigation-msg')),{timeout:15000}).toBe(true);
const scoped=await popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records);
expect(scoped.find(r=>r.messageId==='navigation-msg').accountScope).not.toBe(scoped.find(r=>r.messageId==='new-account-msg').accountScope);

await context.close();await rm(testDir,{recursive:true,force:true});
console.log('PASS account change: lock + blocked status, reads denied, explicit unlock adopts observed identity, capture resumes without lock loop');
