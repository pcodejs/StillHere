import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chromium',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:600}});
 await page.setContent('<div style="width:300px"><span id="message">Recalled</span></div>');
 await page.evaluate(()=>{
   const attach=Element.prototype.attachShadow;
   Element.prototype.attachShadow=function(opts){const root=attach.call(this,opts);window.testRoot=root;return root;};
   window.assetAttempts=0;window.hasAttachment=true;window.attachmentStatus='saved';window.language='en';
   window.chrome={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:async m=>{
     if(m.type==='INLINE_READ')return {language:window.language,record:{hasAttachment:window.hasAttachment,attachmentStatus:window.attachmentStatus,text:'Test message'}};
     if(m.type==='INLINE_ASSET'){window.assetAttempts++;if(window.assetAttempts===1)throw Error('temporary failure');return {asset:{mime:'image/png',data:'invalid'}};}
   }}};
 });
 const source=await readFile('src/core/inline-viewer.js','utf8');
 await page.addScriptTag({content:source.replace('export function','function')+'\nstartInlineViewer(()=>[{node:document.querySelector("#message"),conversationId:"chat",messageId:"image"}]);'});
 await page.waitForFunction(()=>window.testRoot?.querySelector('button'));
 assert.equal(await page.evaluate(()=>window.testRoot.textContent.includes('open StillHere to view')),false);
 await page.evaluate(()=>window.testRoot.querySelector('button').click());
 await page.waitForFunction(()=>window.testRoot.querySelector('button').textContent.includes('retry'));
 assert.equal(await page.evaluate(()=>window.testRoot.querySelector('button').disabled),false);
 await page.evaluate(()=>window.testRoot.querySelector('button').click());
 await page.waitForFunction(()=>window.assetAttempts===2);
 await page.waitForFunction(()=>!window.testRoot.querySelector('img')&&!window.testRoot.querySelector('button').disabled);
 assert.equal(await page.evaluate(()=>window.testRoot.querySelector('button').hidden),false);
 assert.ok(await page.evaluate(()=>document.querySelector('[data-stillhere-inline]').getBoundingClientRect().width<=300));
 await page.evaluate(()=>{chrome.runtime.sendMessage=async m=>m.type==='INLINE_READ'?{language:window.language,record:{text:'Test message',hasAttachment:window.hasAttachment,attachmentStatus:window.attachmentStatus}}:{asset:{mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII='}};window.testRoot.querySelector('button').click();});
 await page.waitForFunction(()=>window.testRoot.querySelector('img')?.naturalWidth===1);
 assert.equal(await page.evaluate(()=>getComputedStyle(window.testRoot.querySelector('button')).display),'none');
 await page.evaluate(()=>window.hasAttachment=false);
 await page.waitForFunction(()=>!window.testRoot.textContent.includes('View saved attachment'));
 await page.evaluate(()=>{window.hasAttachment=true;window.language='vi';});
 await page.waitForFunction(()=>window.testRoot.textContent.includes('Xem tệp đã lưu'));
 await page.evaluate(()=>window.attachmentStatus='missing');
 await page.waitForFunction(()=>window.testRoot.textContent.includes('Chưa có tệp trên máy'));
 assert.equal(await page.evaluate(()=>window.testRoot.textContent.includes('Xem tệp đã lưu')),false);
 assert.equal(await page.evaluate(()=>window.testRoot.querySelectorAll('button').length),1);
 await page.evaluate(()=>{window.attachmentStatus='preview';window.language='en';});
 await page.waitForFunction(()=>window.testRoot.textContent.includes('View saved preview'));
 const race=await browser.newPage();
 await race.setContent('<span id="message">Recalled</span>');
 await race.evaluate(()=>{
  window.locked=false;window.requests=0;
  window.chrome={runtime:{id:'fixture',onMessage:{addListener(fn){window.notify=fn;}},sendMessage:m=>{
   window.requests++;
   if(window.requests===1)return new Promise(resolve=>window.resolveRead=resolve);
   return Promise.resolve({record:null});
  }}};
 });
 await race.addScriptTag({content:source.replace('export function','function')+'\nstartInlineViewer(()=>[{node:document.querySelector("#message"),conversationId:"chat",messageId:"image"}]);'});
 await race.waitForFunction(()=>window.resolveRead);
 await race.evaluate(()=>{window.notify({type:'SETTINGS_CHANGED'});window.resolveRead({language:'en',record:{text:'STALE SECRET'}});});
 await race.waitForFunction(()=>window.requests>=2);
 assert.equal(await race.locator('[data-stillhere-inline]').count(),0,'A pre-lock response must not render after locking');
 // A reused DOM node must lose its previous chat's plaintext before the next read resolves.
 const reused=await browser.newPage();
 await reused.setContent('<span id="message">Recalled</span>');
 await reused.evaluate(()=>{
  window.chat='first';window.tick=null;
  window.setInterval=fn=>{window.tick=fn;return 1;};
  window.chrome={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:m=>m.conversationId==='first'?Promise.resolve({language:'en',record:{text:'FIRST CHAT'}}):new Promise(resolve=>window.resolveSecond=resolve)}};
 });
 await reused.addScriptTag({content:source.replace('export function','function')+'\nstartInlineViewer(()=>[{node:document.querySelector("#message"),conversationId:window.chat,messageId:"image"}]);'});
 await reused.waitForFunction(()=>document.querySelector('[data-stillhere-inline]'));
 await reused.evaluate(()=>{window.chat='second';window.tick();});
 await reused.waitForFunction(()=>window.resolveSecond);
 assert.equal(await reused.locator('[data-stillhere-inline]').count(),0,'Previous chat content must disappear before the new response');
 await reused.evaluate(()=>window.resolveSecond({record:null}));
 console.log('PASS reused message node removes previous conversation content immediately on refresh');
 const mediaRace=await browser.newPage();
 await mediaRace.setContent('<span id="message">Recalled</span>');
 await mediaRace.evaluate(()=>{
  const attach=Element.prototype.attachShadow;
  Element.prototype.attachShadow=function(opts){return window.root=attach.call(this,opts);};
  window.locked=false;
  window.chrome={runtime:{id:'fixture',onMessage:{addListener(fn){window.notify=fn;}},sendMessage:m=>m.type==='INLINE_READ'?Promise.resolve({language:'en',record:window.locked?null:{text:'Media',hasAttachment:true,attachmentStatus:'saved'}}):new Promise(resolve=>window.resolveAsset=resolve)}};
 });
 await mediaRace.addScriptTag({content:source.replace('export function','function')+'\nstartInlineViewer(()=>[{node:document.querySelector("#message"),conversationId:"chat",messageId:"image"}]);'});
 await mediaRace.waitForFunction(()=>window.root?.querySelector('button'));
 await mediaRace.evaluate(()=>window.root.querySelector('button').click());
 await mediaRace.waitForFunction(()=>window.resolveAsset);
 await mediaRace.evaluate(()=>{window.locked=true;window.notify({type:'SETTINGS_CHANGED'});window.resolveAsset({asset:{mime:'image/png',data:'invalid'}});});
 await mediaRace.waitForFunction(()=>!document.querySelector('[data-stillhere-inline]'));
 assert.equal(await mediaRace.evaluate(()=>window.root.querySelector('img')),null,'Late media must not even be added to the detached shadow tree');
 console.log('PASS pending attachment discarded after lock');
 const theme=await browser.newPage({viewport:{width:390,height:600}});
 await theme.setContent('<div style="width:300px;--mwp-message-row-background:rgb(31,31,31);background:linear-gradient(purple,blue)"><span id="message">Recalled</span></div>');
 await theme.evaluate(()=>{window.chrome={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:async()=>({language:'en',record:{text:'Short'}})}};});
 await theme.addScriptTag({content:source.replace('export function','function')+'\nstartInlineViewer(()=>[{node:document.querySelector("#message"),conversationId:"chat",messageId:"image",messengerRow:true}]);'});
 await theme.waitForFunction(()=>document.querySelector('[data-stillhere-inline]'));
 assert.deepEqual(await theme.evaluate(()=>{const h=document.querySelector('[data-stillhere-inline]');return [getComputedStyle(h).backgroundColor,h.getBoundingClientRect().width];}),['rgb(31, 31, 31)',300]);
 const nested=await browser.newPage();
 await nested.setContent('<div id="outer"><span id="body">Recalled</span><span id="time">10:12</span></div><div id="other">Recalled</div>');
 await nested.evaluate(()=>{
  window.setInterval=fn=>{window.tick=fn;return 1;};
  window.chrome={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:async()=>({record:{text:'Original'}})}};
 });
 await nested.addScriptTag({content:source.replace('export function','function')+`\nstartInlineViewer(()=>['body','time','outer','other'].map(id=>({node:document.getElementById(id),conversationId:'chat',messageId:id==='other'?'second':'first'})));`});
 await nested.waitForFunction(()=>document.querySelectorAll('[data-stillhere-inline]').length===2);
 assert.equal(await nested.locator('#outer [data-stillhere-inline]').count(),0,'Nested model candidates must not each receive a viewer');
 assert.equal(await nested.evaluate(()=>document.querySelector('#outer').nextElementSibling.hasAttribute('data-stillhere-inline')),true);
 await nested.evaluate(()=>window.tick());
 await nested.waitForTimeout(100);
 assert.equal(await nested.locator('[data-stillhere-inline]').count(),2,'Repeated scans keep one viewer per distinct message');
 console.log('PASS nested Zalo targets deduplicated while distinct messages retain their own viewers');
 console.log('PASS Messenger inserted row covers gradient with theme surface at bounded width');
 console.log('PASS pending inline read invalidated on lock and immediately rechecked');
 console.log('PASS inline retries, corrupt image, successful image button visibility, late attachment, VI language refresh, bounded width');
} finally {await browser.close();}
