import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,rm,cp,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {exportPortable} from '../src/core/vault.js';
import {accountScope} from '../src/core/account-scope.js';
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
await zalo.evaluate(()=>{const header=document.createElement('div');header.id='account-header';header.__reactFiber$fixture={memoizedProps:{currUser:{userId:'91234567890',displayName:'Tài khoản QA FSUB'}}};document.body.prepend(header);});
const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
expect(await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture password 054 secure'}))).toMatchObject({unlocked:true});
// Exercise the real serialized background handler, not only tab API mocks.
const zaloTabsBefore=await service.evaluate(async()=>
 (await chrome.tabs.query({url:'https://chat.zalo.me/*'})).map(t=>t.id));
const openResults=await popup.evaluate(()=>Promise.all([
 chrome.runtime.sendMessage({type:'OPEN_PLATFORM_TAB',platform:'zalo'}),
 chrome.runtime.sendMessage({type:'OPEN_PLATFORM_TAB',platform:'zalo'}),
]));
expect(openResults).toEqual([{ok:true},{ok:true}]);
expect(await service.evaluate(async()=>
 (await chrome.tabs.query({url:'https://chat.zalo.me/*'})).map(t=>t.id))).toEqual(zaloTabsBefore);
await popup.bringToFront();
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
// Replace MAIN observer twice while the document and isolated reader stay alive.
const observerCode=await readFile(resolve(extension,'page-observer.js'),'utf8');
await zalo.addScriptTag({content:observerCode});
await zalo.addScriptTag({content:observerCode});
// The existing isolated reader's next control heartbeat must reconnect it.
await expect.poll(async()=>zalo.evaluate(()=>!!window[Symbol.for('fsub-unsend-observer-v3')]?.dispose)).toBe(true);
await renderMessage({...base,msgType:20,message:''},true);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(r=>r.recalledAt).length)).toBe(1);
await expect(zalo.locator('[data-stillhere-inline]')).toHaveCount(1,{timeout:10000});
await popup.reload();await expect(popup.locator('.message-body')).toHaveText(base.message);
const group={...base,avatar:'https://s120-ava-talk.zadn.vn/test-avatar.jpg',msgId:'102',cliMsgId:'502',toUid:'g200',message:'[TEST] Tin nhóm <img src=x onerror=alert(1)>'};
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'CONVERSATION_RULES',rules:{mode:'exclude',entries:[{platform:'zalo',conversationId:'excluded-qa'}]}}));
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_LOCK'}));
const pendingLocked=()=>service.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('fsub-password-vault');o.onsuccess=()=>{const db=o.result,r=db.transaction('meta').objectStore('meta').get('captureQueue');r.onsuccess=()=>{db.close();resolve((r.result||[]).length);};r.onerror=()=>reject(r.error);};}));
await renderMessage({...group,toUid:'excluded-qa',msgId:'excluded-msg',cliMsgId:'excluded-cli',message:'NEVER SAVE EXCLUDED'});
await renderMessage(group);
await expect.poll(pendingLocked,{timeout:15000}).toBeGreaterThan(0);
const lockedBeforeRecall=await pendingLocked();
await renderMessage({...group,msgType:20,message:''},true);
await expect.poll(async()=>service.evaluate(async()=>{const o=await new Promise(resolve=>{const r=indexedDB.open('fsub-password-vault');r.onsuccess=()=>resolve(r.result);});const q=await new Promise(resolve=>{const r=o.transaction('meta').objectStore('meta').get('captureQueue');r.onsuccess=()=>resolve(r.result||[]);});o.close();return q.filter(e=>!e.sourceHash).length;}),{timeout:15000}).toBeGreaterThan(1);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).error).toBeTruthy();
const savedPending=await service.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('fsub-password-vault');o.onsuccess=()=>{const db=o.result,tx=db.transaction('meta','readwrite'),store=tx.objectStore('meta'),r=store.get('captureQueue');let original;r.onsuccess=()=>{original=structuredClone(r.result);r.result[0].wrapped='AAAA';store.put(r.result,'captureQueue');};tx.oncomplete=()=>{db.close();resolve(original);};tx.onerror=()=>reject(tx.error);};}));
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Fixture password 054 secure'}))).error).toBeTruthy();
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_STATUS'}))).unlocked).toBe(false);
await service.evaluate(queue=>new Promise((resolve,reject)=>{const o=indexedDB.open('fsub-password-vault');o.onsuccess=()=>{const db=o.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(queue,'captureQueue');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),savedPending);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Fixture password 054 secure'}))).unlocked).toBe(true);

await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(r=>r.recalledAt).length)).toBe(2);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).records.some(r=>r.conversationId==='excluded-qa')).toBe(false);
await zalo.evaluate(()=>document.getElementById('fixture-excluded-msg')?.remove());
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'CONVERSATION_RULES',rules:{mode:'all',entries:[]}}));
await popup.reload();await popup.locator('.filter-toggle').click();await popup.getByText('Nhóm',{exact:true}).click();await expect(popup.locator('.message')).toHaveCount(1);
await expect(popup.locator('.detail-context span').last()).toHaveText('Nhóm — Nhóm kiểm thử');await expect(popup.locator('.detail-context .group-avatar img')).toHaveAttribute('src',/^blob:chrome-extension:/);await expect(popup.locator('.detail-header img')).toHaveAttribute('src',/^blob:chrome-extension:/);
await expect(popup.locator('.message-body')).toHaveText(group.message);await expect(popup.locator('.message-body img')).toHaveCount(0);
await popup.screenshot({animations:'disabled',path:'outputs/screenshots/05-group-fixture.png'});
// Exercise actual resource download, encryption, recall and offline rendering.
const videoData=await zalo.evaluate(async()=>{
 const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
 const initial=canvas.getContext('2d');initial.fillStyle='#2864d7';initial.fillRect(0,0,160,90);
 const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
 const parts=[];recorder.ondataavailable=event=>parts.push(event.data);
 const done=new Promise(resolve=>{recorder.onstop=resolve;});
 recorder.start();
 const drawing=setInterval(()=>{const ctx=canvas.getContext('2d');ctx.fillStyle=Date.now()%2?'#2864d7':'#7cddb5';ctx.fillRect(0,0,160,90);},40);
 await new Promise(resolve=>setTimeout(resolve,400));recorder.stop();await done;clearInterval(drawing);stream.getTracks().forEach(track=>track.stop());
 const bytes=new Uint8Array(await new Blob(parts,{type:'video/webm'}).arrayBuffer());
 return btoa(String.fromCharCode(...bytes));
});
await mkdir('work/media-fixtures',{recursive:true});
await writeFile('work/media-fixtures/test-video.webm',Buffer.from(videoData,'base64'));
await cp(resolve('src/icons/128.png'),resolve('work/media-fixtures/test-image.png'));
await service.evaluate(({videoData,imageData,gifData})=>{
 globalThis.fixtureResourcesAvailable=true;
 const png=imageData;
 globalThis.fetch=async(source,options)=>{
  if(!globalThis.fixtureResourcesAvailable)throw Error('Fixture CDN removed');
  if(options.credentials!=='omit'||options.referrerPolicy!=='no-referrer')throw Error('Unexpected credentials');
  const video=String(source).endsWith('.webm');
  const gif=String(source).endsWith('.gif');
  const bytes=Uint8Array.from(atob(video?videoData:gif?gifData:png),char=>char.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':video?'video/webm':gif?'image/gif':'image/png','Content-Length':String(bytes.length)}});
 };
},{videoData,imageData:(await readFile('src/icons/128.png')).toString('base64'),gifData:(await readFile('tests/fixtures/animated.gif')).toString('base64')});
await popup.locator('#settings-button').click();if(await popup.locator('#enable-resources').isVisible())await popup.locator('#enable-resources').click();await popup.locator('#archive-button').click();
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).settings.cacheMedia)).toBe(true);
const mediaMessages=[
 {...base,msgId:'201',cliMsgId:'601',toUid:'g200',msgType:2,message:{normalUrl:'https://photo.zadn.vn/cache-image.png'}},
 {...base,msgId:'202',cliMsgId:'602',toUid:'g200',msgType:4,message:{stickerUrl:'https://sticker.zadn.vn/cache-sticker.png'}},
 {...base,msgId:'203',cliMsgId:'603',toUid:'g200',msgType:18,message:{videoUrl:'https://file-stal-21.dlfl.vn/cache-video.webm'}}
];
for(const message of mediaMessages)await renderMessage(message);
// Zalo's nested group sticker can expose a prefixed copy of the same server ID.
await renderMessage({...mediaMessages[1],msgId:'grp202'});
await expect.poll(async()=>popup.evaluate(async()=>{
 const state=await chrome.runtime.sendMessage({type:'STATE'});
 return state.records.filter(record=>['201','202','203'].includes(record.messageId)&&record.attachments?.[0]?.cached).length;
})).toBe(3);
expect(await popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(record=>record.messageId==='202').length)).toBe(1);
const encryptedAssets=await service.evaluate(()=>new Promise((resolve,reject)=>{
 const open=indexedDB.open('fsub-password-vault');
 open.onsuccess=()=>{const db=open.result;const request=db.transaction('assets').objectStore('assets').getAll();request.onsuccess=()=>{resolve(request.result.map(item=>({id:item.id,mime:item.mime,encrypted:item.data instanceof ArrayBuffer,prefix:Array.from(new Uint8Array(item.data).slice(0,8))})));db.close();};request.onerror=()=>reject(request.error);};open.onerror=()=>reject(open.error);
}));
expect(encryptedAssets.length).toBeGreaterThanOrEqual(3);
expect(encryptedAssets.every(item=>item.encrypted&&!item.id.includes('https:'))).toBe(true);
expect(encryptedAssets.some(item=>item.prefix.join(',')==='137,80,78,71,13,10,26,10')).toBe(false);
await service.evaluate(()=>{globalThis.fixtureResourcesAvailable=false;});
for(const message of mediaMessages)await renderMessage({...message,msgType:20,message:''},true);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(record=>record.recalledAt).length)).toBe(5);
await context.setOffline(true);
await popup.reload();await popup.locator('.filter-toggle').click();await popup.getByText('Nhóm',{exact:true}).click();
await popup.locator('[data-record-id="201"]').click();await expect(popup.locator('.media-preview img')).toHaveCount(1);await expect.poll(()=>popup.locator('.media-preview img').evaluate(i=>i.complete&&i.naturalWidth>0&&i.src.startsWith('blob:'))).toBe(true);await popup.locator('.media-expand').click();
await expect(popup.getByRole('dialog')).toBeVisible();
await expect.poll(() => popup.locator('.expanded-image').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
await popup.keyboard.press('Escape');
await expect(popup.getByRole('dialog')).toHaveCount(0);
await expect(popup.locator('.media-expand')).toBeFocused();
await popup.setViewportSize({width:400,height:350});
await expect(popup.locator('.message-detail')).toBeVisible();
await popup.locator('.media-expand').click();
await expect(popup.getByRole('dialog')).toBeVisible();
await popup.keyboard.press('Escape');
await expect(popup.getByRole('dialog')).toHaveCount(0);
await expect(popup.locator('.message-detail')).toBeVisible();
await expect(popup.locator('.media-expand')).toBeFocused();
await popup.setViewportSize({width:800,height:600});

await popup.locator('[data-record-id="202"]').click();await expect(popup.locator('.media-preview img')).toHaveCount(1);await expect.poll(()=>popup.locator('.media-preview img').evaluate(i=>i.complete&&i.naturalWidth>0&&i.src.startsWith('blob:'))).toBe(true);await popup.locator('[data-record-id="203"]').click();
await expect(popup.locator('.media-preview video')).toHaveCount(1);

try{await expect.poll(()=>popup.locator('.media-preview video').evaluate(video=>video.readyState>=1)).toBe(true);}catch(error){console.log('Video diagnostic',await popup.locator('.media-preview video').evaluate(v=>({src:v.src,error:v.error?.message,readyState:v.readyState,networkState:v.networkState})),await popup.evaluate(async()=>{const s=await chrome.runtime.sendMessage({type:'STATE'});const r=s.records.find(r=>r.messageId==='203');const a=await chrome.runtime.sendMessage({type:'ASSET',recordId:r.id,role:'attachment',index:0});return{record:r,asset:{mime:a.asset?.mime,length:a.asset?.data?.length}};}));throw error;}
await popup.locator('.media-preview video').evaluate(video=>video.play());
await expect.poll(()=>popup.locator('.media-preview video').evaluate(video=>video.currentTime)).toBeGreaterThan(0);
await popup.locator('.media-preview video').evaluate(video=>video.pause());
// Selected content must stay mounted, opaque and at the same blob URL through polling.
await popup.locator('.media-preview video').evaluate(v=>{window.fixtureVideo=v;window.fixtureVideoUrl=v.src;window.fixtureArticle=v.closest('article');});
const newer={...base,msgId:'205',cliMsgId:'605',toUid:'g200',message:'[TEST] Newer recall must not steal selection'};
await renderMessage(newer);await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.length)).toBe(6);
await renderMessage({...newer,msgType:20,message:''},true);
await popup.waitForTimeout(10500);
expect(await popup.locator('.media-preview video').evaluate(v=>v===window.fixtureVideo&&v.src===window.fixtureVideoUrl&&v.closest('article')===window.fixtureArticle&&getComputedStyle(v.closest('article')).opacity==='1'&&getComputedStyle(v.closest('article')).animationName==='none')).toBe(true);
console.log('PASS: selected article/video nodes and blob URL remain unchanged and fully opaque after a newer recall and two refresh cycles.');

await popup.locator('[data-record-id="102"]').click();await expect.poll(()=>popup.locator('.detail-header img').first().getAttribute('src')).toMatch(/^blob:/);await popup.locator('[data-record-id="203"]').click();await expect.poll(()=>popup.locator('.media-preview video').evaluate(v=>v.readyState>=1)).toBe(true);
await popup.screenshot({animations:'disabled',path:'outputs/screenshots/06-media-offline-fixture.png'});
await popup.setViewportSize({width:360,height:600});
await expect.poll(()=>popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
await popup.locator('.mobile-back').click();
await expect(popup.locator('.mantine-Switch-track').first()).toBeVisible();
await popup.screenshot({animations:'disabled',path:'outputs/screenshots/07-media-narrow-fixture.png'});
await popup.setViewportSize({width:800,height:600});
await context.setOffline(false);
await popup.locator('#search').fill('khong co');await expect(popup.locator('#empty-title')).toHaveText('Không tìm thấy tin phù hợp');
await popup.locator('#search').fill('');
await popup.locator('#capture-toggle').uncheck();
await expect(popup.locator('.action-notice')).toHaveText('Đã tạm dừng lưu tin nhắn');
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).settings.enabled)).toBe(false);
await renderMessage({...base,msgId:'103',cliMsgId:'503',message:'Should not save'});
await popup.reload();await expect(popup.locator('#storage-label')).toContainText('6 tin');
const raw=await service.evaluate(()=>chrome.storage.local.get(null));expect(raw.records).toBeUndefined();expect(raw.vault).toBeUndefined();const protectedState=await service.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('fsub-password-vault');o.onsuccess=()=>{const d=o.result,r=d.transaction('meta').objectStore('meta').get('state');r.onsuccess=()=>{resolve(r.result);d.close();};r.onerror=()=>reject(r.error);};}));expect(protectedState.vault.algorithm).toBe('AES-256-GCM');expect(JSON.stringify(protectedState)).not.toContain(base.message);expect(JSON.stringify(raw)).not.toContain(base.message);expect(JSON.stringify(raw)).not.toContain(group.avatar);
// Browser-state persistence, as opposed to an in-memory popup cache.
await service.evaluate(()=>chrome.storage.local.set({testPersist:true}));
const demo=await context.newPage();await demo.goto(`chrome-extension://${id}/popup.html?demo=1`);
await expect(demo.locator('.message')).toHaveCount(5);await demo.screenshot({animations:'disabled',path:'outputs/screenshots/02-popup-demo.png'});
await demo.setViewportSize({width:360,height:600});
await expect.poll(()=>demo.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
await demo.screenshot({animations:'disabled',path:'outputs/screenshots/03-narrow-demo.png'});
await demo.setViewportSize({width:800,height:600});await demo.locator('#settings-button').click();await demo.screenshot({animations:'disabled',path:'outputs/screenshots/04-settings-demo.png'});await demo.locator('.more-menu').click();await demo.locator('#about-button').click();await demo.screenshot({animations:'disabled',path:'outputs/screenshots/12-about.png'});await demo.locator('#support-button').click();await demo.screenshot({animations:'disabled',path:'outputs/screenshots/11-support.png'});await demo.getByText('EN',{exact:true}).click();await expect(demo.locator('#support')).toContainText('Support StillHere');await demo.screenshot({animations:'disabled',path:'outputs/screenshots/13-english.png'});await demo.setViewportSize({width:360,height:600});await expect.poll(()=>demo.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await demo.screenshot({animations:'disabled',path:'outputs/screenshots/14-support-narrow.png'});
await popup.locator('#settings-button').click();await popup.locator('#clear').click();await popup.locator('#confirm-clear').click();
await expect(popup.locator('.action-notice')).toHaveText('Đã xoá tin đã lưu và tạm dừng lưu tin mới');
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.length)).toBe(0);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).settings.enabled)).toBe(false);
// More than one bridge batch can appear in a single render. Preserve every
// original before applying the matching group recalls, including batch 2.
await zalo.evaluate(()=>document.getElementById('messageView').replaceChildren());
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,retentionDays:30}));
// Zalo can deliver an E2EE MP4 as a file. Archive only the decoded blob that
// follows the user's click on that exact video message and matching filename.
const decodedVideo={...base,msgId:'204',cliMsgId:'604',toUid:'g200',msgType:19,message:{title:'decoded-video.mp4',href:'e2ee://unreadable'}};
await renderMessage(decodedVideo);
await zalo.evaluate(()=>{
 const element=document.createElement('div');element.className='conv-item';element.id='stale-preview';
 element.__reactInternalInstance$fixture={memoizedProps:{conversation:{userId:'g200',lastSmsLocalId:'204'},isGroup:true,previewMsg:{message:'Tin nhắn đã được thu hồi',dName:'Người thử nghiệm',messageTime:Date.now()}}};
 document.body.append(element);
});
await expect.poll(async()=>popup.evaluate(async()=>{
 const record=(await chrome.runtime.sendMessage({type:'STATE'})).records.find(record=>record.messageId==='204');
 return record ? record.recalledAt : 'missing';
})).toBe(null);
await zalo.locator('#text-mCntr_604').click();
await zalo.evaluate(videoData=>{
 const bytes=Uint8Array.from(atob(videoData),char=>char.charCodeAt(0));
 const anchor=document.createElement('a');anchor.download='decoded-video.mp4';anchor.href=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));
 anchor.click();URL.revokeObjectURL(anchor.href);
},videoData);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.find(record=>record.messageId==='204')?.attachments?.[0]?.cached)).toBe(true);
await zalo.evaluate(()=>document.getElementById('stale-preview').remove());
await renderMessage({...decodedVideo,msgType:20,message:''},true);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.find(record=>record.messageId==='204')?.recalledAt)).toBeTruthy();
await popup.locator('#archive-button').click();await popup.reload();await expect(popup.locator('.media-preview video')).toHaveCount(1);
await expect.poll(()=>popup.locator('.media-preview video').evaluate(video=>video.readyState>=1)).toBe(true);
await service.evaluate(()=>{globalThis.fixtureResourcesAvailable=true;});
const gif={...base,msgId:'207',cliMsgId:'607',toUid:'g200',msgType:7,message:{oriUrl:'https://photo.zadn.vn/animated.gif'}};
await renderMessage(gif);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.find(record=>record.messageId==='207')?.attachments[0]?.cached)).toBe(true);
await renderMessage({...gif,msgType:20,message:''},true);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.find(record=>record.messageId==='207')?.recalledAt)).toBeTruthy();
await service.evaluate(()=>{globalThis.fixtureResourcesAvailable=false;});await context.setOffline(true);
await popup.reload();await popup.locator('[data-record-id="207"]').click();await expect(popup.locator('.media-label')).toContainText('GIF');await expect.poll(()=>popup.locator('.media-preview img').evaluate(image=>image.complete&&image.naturalWidth===64)).toBe(true);
const gifAsset=await popup.evaluate(async()=>{const state=await chrome.runtime.sendMessage({type:'STATE'});const record=state.records.find(record=>record.messageId==='207');return (await chrome.runtime.sendMessage({type:'ASSET',recordId:record.id,role:'attachment',index:0})).asset;});
expect(gifAsset.mime).toBe('image/gif');expect(gifAsset.data).toBe((await readFile('tests/fixtures/animated.gif')).toString('base64'));
await context.setOffline(false);
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'CLEAR'}));
await zalo.evaluate(()=>document.getElementById('messageView').replaceChildren());
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,retentionDays:30}));
async function renderBulkGroup(recall=false){
 await zalo.evaluate(recall=>{
  const fragment=document.createDocumentFragment();
  for(let index=0;index<351;index++){
   const message={msgId:String(10000+index),cliMsgId:String(20000+index),toUid:'g300',fromUid:'42',dName:'Người kiểm thử lô',msgType:recall?20:1,message:recall?'':`[BULK ${index}] Bản gốc tin nhóm`,sendDttm:Date.now()};
   const el=document.createElement('div');el.id='bulk-mCntr_'+message.cliMsgId;el.textContent=recall?'Tin nhắn đã được thu hồi':message.message;
   el.__reactFiber$fixture={memoizedProps:{data:message},return:{memoizedProps:{conversation:{userId:'g300',type:2,name:'Nhóm kiểm thử nhiều tin'}}}};
   fragment.append(el);
  }
  document.getElementById('messageView').replaceChildren(fragment);
 },recall);
}
await renderBulkGroup();
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(r=>r.conversationId==='g300'&&r.hasOriginal).length)).toBe(351);
await renderBulkGroup(true);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(r=>r.conversationId==='g300'&&r.recalledAt&&r.hasOriginal).length)).toBe(351);
const bulkRecords=await popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records);
for(let index=0;index<351;index++)expect(bulkRecords.find(r=>r.messageId===String(10000+index))?.text).toBe(`[BULK ${index}] Bản gốc tin nhóm`);

await zalo.evaluate(()=>{const element=document.createElement('div');element.className='conv-item';element.id='preview-fixture';element.__reactInternalInstance$fixture={memoizedProps:{conversation:{userId:'g-preview',lastSmsLocalId:'preview-id'},displayName:'Preview group',isGroup:true,previewMsg:{message:'Preview original',dName:'Preview tester',messageTime:Date.now(),icon:''}}};document.body.append(element);});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.some(record=>record.messageId==='preview-id'&&record.text==='Preview original'))).toBe(true);
await zalo.evaluate(()=>{const element=document.getElementById('preview-fixture');element.__reactInternalInstance$fixture.memoizedProps.previewMsg.message='Tin nhắn đã được thu hồi';element.textContent='Tin nhắn đã được thu hồi';});
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.some(record=>record.messageId==='preview-id'&&record.recalledAt&&record.text==='Preview original'))).toBe(true);

// DOM structure observed in native Zalo. Enrich an existing own-message record
// when the signed-in sidebar image becomes available, then retain it on recall.
await service.evaluate(()=>{globalThis.fixtureResourcesAvailable=true;});
const ownAvatarMessage={...base,toUid:'g200',msgId:'own-avatar-01',cliMsgId:'own-avatar-client',fromUid:'0',dName:'Bạn',message:'Own avatar regression'};
await renderMessage(ownAvatarMessage);
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.some(record=>record.messageId==='own-avatar-01'&&record.hasOriginal))).toBe(true);
const legacyOwn=await popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.find(record=>record.messageId==='own-avatar-01'));
const legacyBackup=await exportPortable([{...legacyOwn,accountScope:await accountScope('zalo',{name:'Tài khoản QA FSUB'}),note:'Keep upgrade note',pinned:true}],'upgrade-fixture-password');
expect(await popup.evaluate(backup=>chrome.runtime.sendMessage({type:'BACKUP_IMPORT',backup,password:'upgrade-fixture-password'}),legacyBackup)).toMatchObject({ok:true});
await service.evaluate(()=>chrome.storage.session.remove('accountAliases'));
await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_LOCK'}));
await zalo.evaluate(()=>{
 const sidebar=document.createElement('nav');sidebar.id='sidebarNav';
 const tabs=document.createElement('div');tabs.id='main-tab';
 const account=document.createElement('div');account.className='nav__tabs__zalo web';account.title='Tài khoản QA FSUB';
 const image=document.createElement('img');image.src='https://s160-26-ava-talk.zadn.vn/own-avatar.jpg';image.setAttribute('data-ava-uid','91234567890');
 account.append(image);tabs.append(account);sidebar.append(tabs);document.body.prepend(sidebar);
});
await expect.poll(pendingLocked).toBeGreaterThan(0);
await renderMessage({...ownAvatarMessage,msgType:20,message:''},true);
await expect.poll(pendingLocked).toBeGreaterThan(1);
expect((await popup.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Fixture password 054 secure'}))).unlocked).toBe(true);
await expect.poll(async()=>popup.evaluate(async()=>{
 const rows=(await chrome.runtime.sendMessage({type:'STATE'})).records.filter(record=>record.messageId==='own-avatar-01');
 return rows.length===1&&rows[0].recalledAt&&rows[0].text==='Own avatar regression'&&rows[0].sender==='Tài khoản QA FSUB'&&rows[0].senderAvatarCached===true&&rows[0].pinned===true&&rows[0].note==='Keep upgrade note';
})).toBeTruthy();
await popup.reload();await popup.locator('[data-record-id="own-avatar-01"]').click();
await expect.poll(()=>popup.locator('.detail-header img').first().getAttribute('src')).toMatch(/^blob:/);

await popup.evaluate(()=>chrome.runtime.sendMessage({type:'CLEAR'}));
await expect.poll(async()=>popup.evaluate(async()=>(await chrome.runtime.sendMessage({type:'STATE'})).records.length)).toBe(0);
await context.close();
const reopened=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-gpu',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
service=reopened.serviceWorkers()[0]||await reopened.waitForEvent('serviceworker');
expect(await service.evaluate(async()=>(await chrome.storage.local.get('testPersist')).testPersist)).toBe(true);
const restored=await reopened.newPage();await restored.goto(`chrome-extension://${id}/popup.html`);
// Browser restart clears the session key; all archive reads fail closed.
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_STATUS'}))).unlocked).toBe(false);
for(const type of ['STATE','ASSET','UI_READ','DRAFT_WRITE'])expect((await restored.evaluate(type=>chrome.runtime.sendMessage({type}),type)).error).toBeTruthy();
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Incorrect fixture password'}))).error).toBeTruthy();
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_UNLOCK',password:'Fixture password 054 secure'}))).unlocked).toBe(true);
const restoredState=await restored.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}));
expect(restoredState.error).toBeUndefined();expect(restoredState.records).toEqual([]);
// Prepare a legacy plaintext archive in this disposable profile only.
await restored.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_LOCK'}));
await service.evaluate(async()=>{
 await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('fsub-password-vault');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
 await chrome.storage.local.set({records:[{id:'migration',text:'Legacy private original',sender:'Legacy user',conversationId:'u9',messageId:'9',clientId:'9',firstSeen:Date.now(),recalledAt:Date.now(),hasOriginal:true,kind:'text'}]});
});
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture password 054 secure'}))).unlocked).toBe(true);
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).records[0].text).toBe('Legacy private original');
const migrated=await service.evaluate(()=>chrome.storage.local.get(null));
expect(migrated.records).toBeUndefined();expect(JSON.stringify(migrated)).not.toContain('Legacy private original');
// The current policy keeps the unlock session for the Chrome lifetime. A
// stale legacy expiresAt field must not unexpectedly lock or discard data.
await service.evaluate(async()=>{const {vaultUnlock}=await chrome.storage.session.get('vaultUnlock');await chrome.storage.session.set({vaultUnlock:{...vaultUnlock,expiresAt:Date.now()-1}});});
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).records[0].text).toBe('Legacy private original');
// A damaged ciphertext fails closed and is never silently replaced.
const damaged=await service.evaluate(()=>new Promise((resolve,reject)=>{const o=indexedDB.open('fsub-password-vault');o.onsuccess=()=>{const d=o.result,tx=d.transaction('meta','readwrite'),st=tx.objectStore('meta'),r=st.get('state');let cipher;r.onsuccess=()=>{const state=r.result;state.vault.data=(state.vault.data[0]==='A'?'B':'A')+state.vault.data.slice(1);cipher=state.vault.data;st.put(state,'state');};tx.oncomplete=()=>{d.close();resolve(cipher);};tx.onerror=()=>reject(tx.error);};}));
expect((await restored.evaluate(()=>chrome.runtime.sendMessage({type:'STATE'}))).error).toBeTruthy();
expect(await service.evaluate(()=>new Promise(resolve=>{const o=indexedDB.open('fsub-password-vault');o.onsuccess=()=>{const d=o.result,r=d.transaction('meta').objectStore('meta').get('state');r.onsuccess=()=>{resolve(r.result.vault.data);d.close();};};}))).toBe(damaged);
await reopened.close();
await rm(testDir,{recursive:true,force:true});
expect(errors).toEqual([]);
console.log('PASS: encrypted avatar/image/sticker/video cache, real video playback and image rendering after CDN removal while offline, optional media opt-in, AES-GCM archive, real MV3 capture/recall, all 351 group originals across batches, filters, XSS, pause, clear, persistence and 800/360px UI. Synthetic fixtures only.');
