// Native Zalo blocks data: video but permits blob: media. No page policy is weakened.
import {chromium, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const browser = await chromium.launch({channel:'chromium', headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:600}});
  await page.setContent(`<meta http-equiv="Content-Security-Policy" content="media-src blob:; img-src blob:"><div style="width:300px"><span id="message">Recalled</span></div>`);
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width=160; canvas.height=90;
    const brush=canvas.getContext('2d');
    brush.fillStyle='#0643d7'; brush.fillRect(0,0,160,90);
    const stream=canvas.captureStream(10), recorder=new MediaRecorder(stream,{mimeType:'video/webm'}), parts=[];
    recorder.ondataavailable=event=>parts.push(event.data);
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();
    let frame=0;
    const drawing=setInterval(()=>{brush.fillStyle=++frame%2?'#0643d7':'#42c4ee';brush.fillRect(0,0,160,90);},50);
    await new Promise(resolve=>setTimeout(resolve,1000)); recorder.stop(); await stopped;
    clearInterval(drawing); stream.getTracks().forEach(track=>track.stop());
    return btoa(String.fromCharCode(...new Uint8Array(await new Blob(parts,{type:'video/webm'}).arrayBuffer())));
  });
  await page.evaluate(video => {
    window.fixture={mime:'video/webm',data:video}; window.locked=false; window.language='en';
    window.ownedURLs=new Set(); window.createdURLs=[]; window.revokedURLs=[];
    const create=URL.createObjectURL.bind(URL), revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);window.ownedURLs.add(url);window.createdURLs.push(url);return url;};
    URL.revokeObjectURL=url=>{window.ownedURLs.delete(url);window.revokedURLs.push(url);revoke(url);};
    const attach=Element.prototype.attachShadow;
    Element.prototype.attachShadow=function(options){return window.root=attach.call(this,options);};
    window.setInterval=fn=>{window.tick=fn;return 1;};
    window.chrome={runtime:{id:'fixture',onMessage:{addListener(fn){window.notify=fn;}},sendMessage:async message=>{
      if(message.type==='INLINE_READ')return {language:window.language,record:window.locked?null:{text:'QA media',hasAttachment:true,attachmentStatus:'saved'}};
      if(message.type==='INLINE_ASSET')return {asset:window.fixture};
    }}};
  },video);
  const source=await readFile('src/core/inline-viewer.js','utf8');
  await page.addScriptTag({content:source.replace('export function','function')+'\nstartInlineViewer(()=>[{node:document.getElementById("message"),conversationId:"chat",messageId:"video"}]);'});
  await page.waitForFunction(()=>window.root?.querySelector('button'));
  await page.evaluate(()=>window.root.querySelector('button').click());
  await expect.poll(()=>page.evaluate(()=>window.root.querySelector('video')?.readyState||0),{timeout:4000}).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(()=>window.root.querySelector('video').src)).toMatch(/^blob:/);
  await page.evaluate(()=>{const video=window.root.querySelector('video');window.oldVideo=video;video.muted=true;return video.play();});
  await expect.poll(()=>page.evaluate(()=>window.oldVideo.currentTime)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.ownedURLs.size)).toBe(1);
  await page.evaluate(()=>{window.locked=true;window.notify({type:'SETTINGS_CHANGED'});});
  await expect(page.locator('[data-stillhere-inline]')).toHaveCount(0);
  expect(await page.evaluate(()=>({urls:window.ownedURLs.size,paused:window.oldVideo.paused,source:window.oldVideo.getAttribute('src')}))).toEqual({urls:0,paused:true,source:null});

  await page.evaluate(()=>{
    window.locked=false;window.language='vi';
    window.fixture={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII='};
    window.notify({type:'SETTINGS_CHANGED'});
  });
  await page.waitForFunction(()=>window.root?.textContent.includes('Xem tệp đã lưu'));
  await page.evaluate(()=>window.root.querySelector('button').click());
  await expect.poll(()=>page.evaluate(()=>window.root.querySelector('img')?.naturalWidth||0)).toBe(1);
  expect(await page.evaluate(()=>window.ownedURLs.size)).toBe(1);
  await page.evaluate(()=>{window.chrome.runtime.id='';window.tick();});
  await expect(page.locator('[data-stillhere-inline]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.ownedURLs.size)).toBe(0);
  expect(await page.evaluate(()=>window.createdURLs.length)).toBe(2);
  expect(await page.evaluate(()=>window.revokedURLs.length)).toBe(2);
  console.log('PASS inline video/image under blob-only page CSP, playback, lock stops and revokes media, context invalidation releases all URLs. Synthetic page and assets.');
} finally {await browser.close();}
