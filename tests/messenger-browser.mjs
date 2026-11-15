import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const facebookHost=process.env.STILLHERE_TEST_FACEBOOK_HOST || 'www.facebook.com';
if(!['www.facebook.com','web.facebook.com'].includes(facebookHost)) throw Error('Unsupported fixture host');
const root=await mkdtemp(resolve(tmpdir(),'fsub-messenger-'));
let context;
try {
 const extension=resolve(root,'extension');await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 // Auto-grant CDN access only in this disposable test profile.
 const manifestPath=resolve(extension,'manifest.json');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 manifest.host_permissions=[...(manifest.host_permissions||[]),...manifest.optional_host_permissions];
 await writeFile(manifestPath,JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(resolve(root,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const ui=await context.newPage();await ui.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 const request=(type,values={})=>ui.evaluate(message=>chrome.runtime.sendMessage(message),{type,...values});
 await request('VAULT_SETUP',{password:'Fixture6!'});
 for(const host of ['www.messenger.com',facebookHost]) await context.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><div data-message-id="shared" aria-label="Lúc 11:18, Bạn: Synthetic private message"></div></body></html>'}));
 const messenger=await context.newPage();await messenger.goto('https://www.messenger.com/e2ee/t/123/');
 expect((await request('STATE')).records).toHaveLength(0);
 await request('SETTINGS',{consent:true,enabled:true,retentionDays:30});
 try {await expect.poll(async()=>(await request('STATE')).records.length,{timeout:12000}).toBe(1);} catch(e) {console.log('DIAGNOSTIC',JSON.stringify(await request('STATE')),await messenger.locator('[data-message-id]').getAttribute('aria-label'));throw e;}
 let state=await request('STATE');expect(state.records[0]).toMatchObject({platform:'facebook',conversationId:'123',messageId:'shared',text:'Synthetic private message',recalledAt:null});
 // Exercise background SETTINGS with an old Zalo-only permission grant.
 await worker.evaluate(()=>{
  globalThis.realPermissionContains=chrome.permissions.contains;
  chrome.permissions.contains=async({origins})=>origins.every(origin=>/zadn|zdn|dlfl|zalo\.me/.test(origin));
 });
 await request('SETTINGS',{consent:true,enabled:true,cacheMedia:true,retentionDays:30});
 state=await request('STATE');
 expect(state.settings.cacheMedia).toBe(true);
 expect(state.resourcePermissions).toEqual({zalo:true,facebook:false});
 await request('SETTINGS',{consent:true,enabled:false,cacheMedia:true,retentionDays:30});
 expect((await request('STATE')).settings.cacheMedia).toBe(true);
 await worker.evaluate(()=>{chrome.permissions.contains=globalThis.realPermissionContains;});
 await request('SETTINGS',{consent:true,enabled:true,cacheMedia:false,retentionDays:30});
 // A virtualized node disappearing is not proof of recall.
 await messenger.locator('[data-message-id]').evaluate(el=>el.remove());
 expect((await request('STATE')).records[0].recalledAt).toBeNull();
 const facebook=await context.newPage();await facebook.goto(`https://${facebookHost}/`);
 // Homepage is connected, but feed nodes must never become messages.
 await expect.poll(async()=>Object.values(await worker.evaluate(()=>chrome.storage.session.get(null))).filter(v=>v?.platform==='facebook'&&v?.at>0).length>=2).toBe(true);
 expect((await request('STATE')).records).toHaveLength(1);
 // Facebook SPA navigation starts capture without reloading or opening the popup.
 await facebook.evaluate(()=>history.pushState({},'', '/messages/t/456/'));

 await expect.poll(async()=>(await request('STATE')).records.length).toBe(2);
 expect((await request('STATE')).records.map(r=>r.conversationId).sort()).toEqual(['123','456']);
 await facebook.locator('[data-message-id]').evaluate(el=>{
  el.setAttribute('aria-label','Lúc 11:18, Bạn');
  el.innerText='Bạn đã gửi\nBạn đã xóa một tin nhắn';
 });
 await expect.poll(async()=>(await request('STATE')).records.filter(r=>r.recalledAt).length).toBe(1);
 const recalled=(await request('STATE')).records.find(r=>r.recalledAt);
 expect(recalled).toMatchObject({platform:'facebook',conversationId:'456',text:'Synthetic private message',hasOriginal:true});
 await expect(facebook.locator('[data-stillhere-inline]')).toHaveCount(1,{timeout:10000});
 await request('SETTINGS',{consent:true,enabled:true,platforms:['zalo'],retentionDays:30});
 await expect(facebook.locator('[data-stillhere-inline]')).toHaveCount(0,{timeout:10000});
 await ui.reload();await expect(ui.locator('#facebook-button')).toHaveCount(0);
 await request('SETTINGS',{consent:true,enabled:true,platforms:['zalo','facebook'],retentionDays:30});
 await expect(facebook.locator('[data-stillhere-inline]')).toHaveCount(1,{timeout:10000});


 await ui.reload();await ui.locator('#facebook-button').click();
 await expect(ui.locator('.message')).toHaveCount(1);
 await expect(ui.locator('.message-body')).toHaveText('Synthetic private message');
 await ui.locator('#zalo-button').click();await expect(ui.locator('.message')).toHaveCount(0);
 await ui.locator('#facebook-button').click();await expect(ui.locator('.message-body')).toHaveText('Synthetic private message');
 // Received-message recall must preserve the original as well as self-recall.
 await messenger.evaluate(()=>{
  const el=document.createElement('div');el.dataset.messageId='received';
  el.setAttribute('aria-label','Lúc 11:31, Minh: Received fixture original');
  const region=document.createElement('section');region.setAttribute('role','region');
  const header=document.createElement('a');header.href='https://www.facebook.com/100000000000001/';header.innerText='Minh An';
  const log=document.createElement('div');log.setAttribute('role','log');log.setAttribute('aria-label','Tin nhắn trong cuộc trò chuyện với Minh An');
  log.append(el);region.append(header,log);document.body.append(region);
 });
 await expect.poll(async()=>(await request('STATE')).records.some(r=>r.messageId==='received'&&r.hasOriginal)).toBe(true);
 await messenger.locator('[data-message-id="received"]').evaluate(el=>{
  el.setAttribute('aria-label','Lúc 11:31, Minh');el.innerText='Minh\nMinh đã xóa một tin nhắn';
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='received')?.recalledAt).toBeTruthy();
 // The already-open archive must update without a page reload.
 await expect(ui.locator('.message')).toHaveCount(2,{timeout:12000});
 expect((await request('STATE')).records.find(r=>r.messageId==='received')).toMatchObject({text:'Received fixture original',sender:'Minh',hasOriginal:true,platform:'facebook'});
 expect((await request('STATE')).records.find(r=>r.messageId==='received').conversationType).toBe('personal');
 await ui.locator('.filter-toggle').click();
 await ui.getByText('Cá nhân',{exact:true}).click();
 await expect(ui.locator('.message')).toHaveCount(1);
 await expect(ui.locator('.message-body')).toHaveText('Received fixture original');
 if(!await ui.getByText('Tất cả',{exact:true}).isVisible())await ui.locator('.filter-toggle').click();
 await ui.getByText('Tất cả',{exact:true}).click();
 // SPA navigation can leave old DOM mounted briefly. Do not clone it into the new thread.
 await messenger.evaluate(()=>history.pushState({},'', '/t/789/'));
 await expect.poll(async()=>(await request('STATE')).health.some(h=>h.online)).toBe(true);
 await messenger.waitForTimeout(3500);
 expect((await request('STATE')).records.some(r=>r.conversationId==='789')).toBe(false);
 // Exercise the real content -> background -> encrypted assets path for a page blob.
 await request('SETTINGS',{consent:true,enabled:true,cacheMedia:true,retentionDays:30});
 const png=(await readFile('src/icons/128.png')).toString('base64');
 // Real observed Facebook sticker structure: semantic DIV + computed CSS URL.
 await messenger.evaluate(()=>{
  const el=document.createElement('div');el.dataset.messageId='css-sticker';el.setAttribute('aria-label','Lúc 13:45, Minh');
  const sticker=document.createElement('div');sticker.setAttribute('role','img');
  sticker.setAttribute('aria-label','Cheeky text, typing and cheeky side glance sticker');
  sticker.style.cssText='width:96px;height:96px';
  el.append(sticker);document.body.append(el);
 });
 await messenger.waitForTimeout(400);
 await messenger.locator('[data-message-id="css-sticker"] [role="img"]').evaluate(el=>{el.style.backgroundImage='url("https://scontent.test.fbcdn.net/sticker.png")';});
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='css-sticker')?.attachments[0]?.kind,{timeout:12000}).toBe('sticker');
 await messenger.locator('[data-message-id="css-sticker"]').evaluate(el=>{el.innerText='Minh\nMinh đã xóa một tin nhắn';});
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='css-sticker')?.recalledAt).toBeTruthy();
 expect((await request('STATE')).records.find(r=>r.messageId==='css-sticker').attachments[0].source).toBe('https://scontent.test.fbcdn.net/sticker.png');
 await messenger.evaluate(data=>{
  const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  const src=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
  const el=document.createElement('div');el.dataset.messageId='blob-image';el.setAttribute('aria-label','Lúc 12:00, Minh');
  const img=new Image();img.width=128;img.height=128;img.alt='Mở ảnh';img.src=src;
  const viewer=document.createElement('a');viewer.href='/messenger_media/?attachment_id=fixture';
  viewer.append(img);el.append(viewer);document.body.append(el);
 },png);
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='blob-image')?.attachments[0]?.cached,{timeout:15000}).toBe(true);
 const media=(await request('STATE')).records.find(r=>r.messageId==='blob-image');
 await messenger.locator('[data-message-id="blob-image"]').evaluate(el=>{
  URL.revokeObjectURL(el.querySelector('img').src);
  const replacement=document.createElement('div');replacement.dataset.messageId='blob-image-recalled';
  replacement.setAttribute('aria-label','Lúc 12:00, Minh');
  replacement.innerText='Minh\nMinh đã xóa một tin nhắn';el.replaceWith(replacement);
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='blob-image')?.recalledAt).toBeTruthy();
 expect((await request('STATE')).records.find(r=>r.messageId==='blob-image').messageAliases).toContain('blob-image-recalled');
 const asset=await request('ASSET',{recordId:media.id,role:'attachment',index:0});
 expect(asset.asset.data).toBe(png);expect(asset.asset.mime).toBe('image/png');
 // Pausing then immediately resuming must not let an old CDN job save bytes.
 // Deliberately ignore abort in the fixture fetch to test the generation guard too.
 await worker.evaluate(data=>{
  globalThis.delayedMedia=[];
  globalThis.fetch=(source,options)=>{
   if(!String(source).endsWith('/pause-fixture.png'))throw Error('Fixture only');
   return new Promise(resolve=>globalThis.delayedMedia.push({signal:options.signal,release:()=>resolve(new Response(Uint8Array.from(atob(data),c=>c.charCodeAt(0))))}));
  };
 },png);
 await messenger.evaluate(()=>{
  const el=document.createElement('div');el.dataset.messageId='pause-image';el.setAttribute('aria-label','Lúc 12:01, Minh');
  const image=new Image();image.width=128;image.height=128;image.src='https://scontent.test.fbcdn.net/pause-fixture.png';el.append(image);document.body.append(el);
 });
 await expect.poll(()=>worker.evaluate(()=>globalThis.delayedMedia.length)).toBe(1);
 await request('SETTINGS',{consent:true,enabled:true,cacheMedia:false,retentionDays:30});
 expect(await worker.evaluate(()=>globalThis.delayedMedia[0].signal.aborted)).toBe(true);
 await request('SETTINGS',{consent:true,enabled:true,cacheMedia:true,retentionDays:30});
 await expect.poll(()=>worker.evaluate(()=>globalThis.delayedMedia.length)).toBe(2);
 await worker.evaluate(()=>globalThis.delayedMedia[0].release());
 await messenger.waitForTimeout(200);
 expect((await request('STATE')).records.find(r=>r.messageId==='pause-image').attachments[0].cached).toBe(false);
 await worker.evaluate(()=>globalThis.delayedMedia[1].release());
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='pause-image').attachments[0].cached).toBe(true);
 // Actual observed GIF origin and element label, using a local animated fixture.
 const gif=(await readFile('tests/fixtures/animated.gif')).toString('base64');
 await context.route('https://cdn.fbsbx.com/v/t59.2708-21/fixture.gif',route=>route.fulfill({contentType:'image/gif',body:Buffer.from(gif,'base64')}));
 await worker.evaluate(data=>{
  globalThis.fetch=async(source,options)=>{
   if(String(source)!=='https://cdn.fbsbx.com/v/t59.2708-21/fixture.gif')throw Error('Fixture only');
   if(options.credentials!=='omit'||options.referrerPolicy!=='no-referrer')throw Error('Unexpected credentials');
   return new Response(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
  };
 },gif);
 await messenger.evaluate(()=>{
  const el=document.createElement('div');el.dataset.messageId='cdn-gif';el.setAttribute('aria-label','Lúc 14:59, Minh');
  const image=new Image();image.width=64;image.height=64;image.alt='Hình ảnh GIF';image.src='https://cdn.fbsbx.com/v/t59.2708-21/fixture.gif';el.append(image);document.body.append(el);
 });
 try {await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='cdn-gif')?.attachments[0]?.cached,{timeout:12000}).toBe(true);}
 catch(error){
  const snapshot=await request('STATE');
  console.log('GIF fixture diagnostic',JSON.stringify({settings:snapshot.settings,permissions:snapshot.resourcePermissions,record:snapshot.records.find(r=>r.messageId==='cdn-gif'),health:snapshot.health}),await messenger.locator('[data-message-id="cdn-gif"]').evaluate(n=>({url:location.href,label:n.getAttribute('aria-label'),images:[...n.querySelectorAll('img')].map(i=>({src:i.src,width:i.width,height:i.height}))})));
  throw error;
 }
 const gifRecord=(await request('STATE')).records.find(r=>r.messageId==='cdn-gif');
 expect(gifRecord.attachments[0].mime).toBe('image/gif');
 await messenger.locator('[data-message-id="cdn-gif"]').evaluate(el=>{el.innerText='Minh\nMinh đã xóa một tin nhắn';});
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='cdn-gif')?.recalledAt).toBeTruthy();
 const gifAsset=await request('ASSET',{recordId:gifRecord.id,role:'attachment',index:0});
 expect(gifAsset.asset.data).toBe(gif);expect(gifAsset.asset.mime).toBe('image/gif');
 await ui.locator('.message').filter({hasText:'GIF'}).first().click();
 await expect.poll(()=>ui.locator('.media-preview img').evaluate(image=>image.naturalWidth>0)).toBe(true);
 const encryptedAsset=await worker.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('fsub-password-vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').getAll();r.onsuccess=()=>resolve(r.result.map(a=>({iv:a.iv.length,bytes:Array.from(new Uint8Array(a.data).slice(0,8))})));r.onerror=()=>reject(r.error);});}finally{db.close();}
 });
 expect(encryptedAsset.length).toBeGreaterThan(0);
 for(const a of encryptedAsset){expect(a.iv).toBe(12);expect(a.bytes).not.toEqual([137,80,78,71,13,10,26,10]);}

 // Real E2EE behaviour observed in Chrome: recall replaces the entire node,
 // changing the numeric ID as well as the recipient prefix.
 await messenger.evaluate(()=>{
  for(const [id,text] of [['same-minute-first','First original'],['same-minute-second','Second original']]) {
   const article=document.createElement('div');article.setAttribute('role','article');
   const el=document.createElement('div');el.dataset.messageId=id;
   el.setAttribute('aria-label','Lúc 16:05, Bạn: '+text);
   article.append(el);document.body.append(article);
  }
 });
 await expect.poll(async()=>(await request('STATE')).records.filter(r=>r.messageId.startsWith('same-minute-')).length).toBe(2);
 await messenger.locator('[data-message-id="same-minute-second"]').evaluate(el=>{
  const article=document.createElement('div');article.setAttribute('role','article');
  const replacement=document.createElement('div');replacement.dataset.messageId='different-recall-id';
  replacement.setAttribute('aria-label','Lúc 16:05, Bạn');
  replacement.innerText='Bạn đã gửi\nBạn đã xóa một tin nhắn';article.append(replacement);
  el.closest('[role=article]').replaceWith(article);
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='same-minute-second')?.recalledAt).toBeTruthy();
 const replaced=(await request('STATE')).records.find(r=>r.messageId==='same-minute-second');
 expect(replaced.text).toBe('Second original');
 expect(replaced.messageAliases).toContain('different-recall-id');
 expect((await request('STATE')).records.find(r=>r.messageId==='same-minute-first').recalledAt).toBeNull();
 expect((await request('STATE')).records.some(r=>r.messageId==='different-recall-id')).toBe(false);
 await expect(ui.locator('.message').filter({hasText:'Second original'})).toHaveCount(1,{timeout:12000});

 // Focused media content is portalled after the timeline while an empty
 // data-message-id placeholder remains between its neighbours.
 await messenger.evaluate(()=>{
  for(const [id,time,text] of [['portal-before','18:00','Before portal'],['portal-original','18:01','Portalled original'],['portal-after','18:02','After portal']]) {
   const el=document.createElement('div');el.dataset.messageId=id;
   el.setAttribute('aria-label','Lúc '+time+', Bạn: '+text);document.body.append(el);
  }
 });
 await expect.poll(async()=>(await request('STATE')).records.some(r=>r.messageId==='portal-original')).toBe(true);
 await messenger.locator('[data-message-id="portal-original"]').evaluate(el=>{
  const portal=el.cloneNode(true);portal.dataset.portalFixture='true';
  portal.removeAttribute('data-message-id');
  el.setAttribute('aria-label','Lúc 18:01, Bạn');el.innerHTML='';
  document.body.append(portal);
 });
 await messenger.waitForTimeout(700);
 await messenger.evaluate(()=>{
  document.querySelector('[data-portal-fixture]').remove();
  const el=document.querySelector('[data-message-id="portal-original"]');
  el.dataset.messageId='portal-recalled';el.innerText='Bạn đã gửi\nBạn đã xóa một tin nhắn';
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='portal-original')?.recalledAt).toBeTruthy();
 expect((await request('STATE')).records.find(r=>r.messageId==='portal-original').text).toBe('Portalled original');
 expect((await request('STATE')).records.some(r=>r.messageId==='portal-recalled')).toBe(false);

 // Observed group header: a conversation button with a two-photo collage.
 await worker.evaluate(data=>{
  globalThis.fetch=async(source,options)=>{
   if(!/^https:\/\/scontent\.test\.fbcdn\.net\/group-[12]\.png$/.test(source))throw Error('Fixture only');
   if(options.credentials!=='omit'||options.referrerPolicy!=='no-referrer')throw Error('Unexpected credentials');
   return new Response(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
  };
 },png);
 await messenger.evaluate(()=>{
  const region=document.createElement('section');region.setAttribute('role','region');
  const header=document.createElement('div');header.setAttribute('role','button');header.setAttribute('aria-label','Cuộc trò chuyện với Minh và Lan');header.innerText='Minh, Lan';
  for(let index=1;index<=2;index++){
   const image=new Image();image.width=27;image.height=27;image.src=`https://scontent.test.fbcdn.net/group-${index}.png`;header.append(image);
  }
  const log=document.createElement('div');log.setAttribute('role','log');log.setAttribute('aria-label','Tin nhắn trong cuộc trò chuyện với Minh và Lan');
  const item=document.createElement('div');item.dataset.messageId='group-original';item.setAttribute('aria-label','Lúc 19:34, Minh: Group original');
  log.append(item);region.append(header,log);document.body.append(region);
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='group-original')?.conversationAvatarsCached,{timeout:12000}).toEqual([true,true]);
 const group=(await request('STATE')).records.find(r=>r.messageId==='group-original');
 expect(group.conversationType).toBe('group');expect(group.conversationName).toBe('Minh, Lan');
 for(const index of [0,1])expect((await request('ASSET',{recordId:group.id,role:'conversation-part',index})).asset.data).toBe(png);
 expect((await request('ASSET',{recordId:group.id,role:'conversation-part',index:2})).ok).toBe(false);
 await messenger.locator('[data-message-id="group-original"]').evaluate(el=>{
  el.setAttribute('aria-label','Lúc 19:34, Minh');el.innerText='Minh\nMinh đã xóa một tin nhắn';
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='group-original')?.recalledAt).toBeTruthy();
 await ui.getByText('Nhóm',{exact:true}).click();
 await expect(ui.locator('.message')).toHaveCount(1);
 await expect(ui.locator('.message')).toContainText('Nhóm — Minh, Lan');
 await ui.locator('.message').click();
 await expect(ui.locator('.message-body')).toHaveText('Group original');
 await expect.poll(()=>ui.locator('.group-collage img').evaluateAll(images=>images.length===4&&images.every(image=>image.naturalWidth>0&&image.src.startsWith('blob:')))).toBe(true);
 await ui.reload();
 await expect(ui.locator('.message')).toHaveCount(1);
 await expect.poll(()=>ui.locator('.group-collage img').evaluateAll(images=>images.length===4&&images.every(image=>image.naturalWidth>0))).toBe(true);
 if(!await ui.getByText('Tất cả',{exact:true}).isVisible())await ui.locator('.filter-toggle').click();
 await ui.getByText('Tất cả',{exact:true}).click();

 const raw=await worker.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('fsub-password-vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise((resolve,reject)=>{const tx=db.transaction('meta');const r=tx.objectStore('meta').get('state');r.onsuccess=()=>resolve(JSON.stringify(r.result));r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
 });expect(raw).not.toContain('Synthetic private message');expect(raw).not.toContain('group-1.png');
 // Explicit Messenger own-profile control supplies self avatar, never a group member image.
 await messenger.evaluate(()=>{
  const button=document.createElement('button');button.id='self-avatar-fixture';
  button.setAttribute('aria-label','Fixture Self @fixture - Cài đặt, trợ giúp và hơn thế nữa');
  const image=new Image();image.src='https://scontent.test.fbcdn.net/group-1.png';button.append(image);document.body.append(button);
  const node=document.createElement('div');node.dataset.messageId='self-avatar-message';node.setAttribute('aria-label','Lúc 20:00, Bạn: Own avatar fixture');document.body.append(node);
 });
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='self-avatar-message')?.senderAvatarCached).toBe(true);
 let own=(await request('STATE')).records.find(r=>r.messageId==='self-avatar-message');
 expect(own.sender).toBe('Fixture Self');expect(own.isSelf).toBe(true);
 expect((await request('ASSET',{recordId:own.id,role:'sender'})).asset.data).toBe(png);
 await messenger.locator('[data-message-id="self-avatar-message"]').evaluate(el=>{el.setAttribute('aria-label','Lúc 20:00, Bạn');el.innerText='Bạn\nBạn đã xóa một tin nhắn';});
 await expect.poll(async()=>(await request('STATE')).records.find(r=>r.messageId==='self-avatar-message')?.recalledAt).toBeTruthy();
 await ui.reload();await ui.locator('[data-record-id="self-avatar-message"]').click();
 await expect(ui.locator('.detail-header h2')).toHaveText('Fixture Self');
 await expect.poll(()=>ui.locator('.detail-header img').evaluate(image=>image.naturalWidth>0&&image.src.startsWith('blob:'))).toBe(true);
 await messenger.locator('#self-avatar-fixture').evaluate(el=>el.remove());
 // Observed own-account dialog must never read conversation sender names.
 await messenger.evaluate(()=>{
  const menu=document.createElement('div');menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Trang cá nhân của bạn');
  const self=document.createElement('a');self.href='/me/';self.innerText='Fixture Account A';
  const logout=document.createElement('button');logout.innerText='Đăng xuất';
  menu.append(self,logout);document.body.append(menu);
 });
 // The prior own-profile fixture identified Fixture Self. Changing to A
 // must lock too; unlock explicitly before checking its account-scoped state.
 await expect.poll(async()=>(await request('VAULT_STATUS')).unlocked).toBe(false);
 expect((await request('STATE')).error).toBeTruthy();
 await request('VAULT_UNLOCK',{password:'Fixture6!'});
 expect((await request('VAULT_STATUS')).unlocked).toBe(true);
 await expect.poll(async()=>(await request('STATE')).health?.some(h=>h.accountName==='Fixture Account A')).toBe(true);
 await messenger.locator('[role="dialog"] a').evaluate(link=>{link.innerText='Fixture Account B';});
 await expect.poll(async()=>(await request('VAULT_STATUS')).unlocked).toBe(false);
 expect((await request('STATE')).error).toBeTruthy();
 await request('VAULT_UNLOCK',{password:'Fixture6!'});
 await expect.poll(async()=>(await request('STATE')).health.some(h=>h.accountName==='Fixture Account B')).toBe(true);
 // Merely quoted account-action text outside the own-account menu cannot lock.
 await messenger.evaluate(()=>{
  const outside=document.createElement('button');outside.id='quoted-logout';outside.innerText='Đăng xuất';document.body.append(outside);
 });
 await messenger.locator('#quoted-logout').click();
 expect((await request('VAULT_STATUS')).unlocked).toBe(true);
 // Security boundaries apply even when the user has paused message capture.
 await request('SETTINGS',{enabled:false,consent:true});
 await messenger.evaluate(()=>{
  const button=document.createElement('button');button.id='profile-picker';button.innerText='Xem tất cả trang cá nhân';
  document.querySelector('[role="dialog"]').append(button);
 });
 await messenger.locator('#profile-picker').click();
 await expect.poll(async()=>(await request('VAULT_STATUS')).unlocked).toBe(false);
 expect((await request('STATE')).error).toBeTruthy();
 await request('VAULT_UNLOCK',{password:'Fixture6!'});
 expect((await request('STATE')).settings.enabled).toBe(false);
 await messenger.evaluate(()=>{
  const button=document.createElement('button');button.id='quick-profile';button.innerText='Chuyển sang Fixture Profile';
  document.querySelector('[role="dialog"]').append(button);
 });
 await messenger.locator('#quick-profile').click();
 await expect.poll(async()=>(await request('VAULT_STATUS')).unlocked).toBe(false);
 await request('VAULT_UNLOCK',{password:'Fixture6!'});
 await messenger.locator('[role="dialog"] a').evaluate(link=>{link.innerText='Fixture Account B';});
 await messenger.getByRole('dialog',{name:'Trang cá nhân của bạn'}).getByRole('button',{name:'Đăng xuất',exact:true}).click();
 await expect.poll(async()=>(await request('VAULT_STATUS')).unlocked).toBe(false);
 expect((await request('STATE')).error).toBeTruthy();
 console.log('PASS: both Facebook origins capture observed text after consent, stable conversation boundaries, encrypted archive, disappearing DOM never treated as recall, locked reads denied. Synthetic self and received recall preserve originals and renders only in Facebook menu; live-service acceptance still pending.');
} finally {await context?.close();await rm(root,{recursive:true,force:true});}
