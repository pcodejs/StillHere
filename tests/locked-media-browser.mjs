// Disposable Chromium profile. Platform DOM, downloads and permission grants are fixtures.
import {chromium, expect} from '@playwright/test';
import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'stillhere-locked-media-'));
const extension = join(root, 'extension');
const password = 'fixture-locked-media';
let context;

async function launch() {
  context = await chromium.launchPersistentContext(join(root, 'profile'), {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  return {worker, popup};
}

async function pendingQueue(worker) {
  return worker.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('fsub-password-vault');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('meta').objectStore('meta').get('captureQueue');
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(request.result || []); };
    };
  }));
}

try {
  await cp(resolve('outputs/go-lai-extension'), extension, {recursive: true});
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = [...manifest.optional_host_permissions];
  await writeFile(manifestPath, JSON.stringify(manifest));

  let {worker, popup} = await launch();
  const request = message => popup.evaluate(message => chrome.runtime.sendMessage(message), message);
  expect(await request({type: 'VAULT_SETUP', password})).toMatchObject({unlocked: true});
  await context.route('https://chat.zalo.me/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Locked media fixture</title><main id="messageView"></main>',
  }));
  const zalo = await context.newPage();
  await zalo.goto('https://chat.zalo.me/');
  await zalo.evaluate(() => {
    const header = document.createElement('header');
    header.id = 'account-header';
    header.__reactFiber$fixture = {memoizedProps: {
      currUser: {userId: '91234567890', displayName: 'Locked media account'},
    }};
    document.body.prepend(header);
  });

  const video = await zalo.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const brush = canvas.getContext('2d');
    brush.fillStyle = '#0643d7';
    brush.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {mimeType: 'video/webm'});
    const parts = [];
    const finished = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.ondataavailable = event => parts.push(event.data);
    recorder.start();
    let frame = 0;
    const drawing = setInterval(() => {
      brush.fillStyle = ++frame % 2 ? '#0643d7' : '#42c4ee';
      brush.fillRect(0, 0, canvas.width, canvas.height);
    }, 50);
    await new Promise(resolve => setTimeout(resolve, 1000));
    recorder.stop();
    await finished;
    clearInterval(drawing);
    stream.getTracks().forEach(track => track.stop());
    const bytes = new Uint8Array(await new Blob(parts, {type: 'video/webm'}).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  const image = (await readFile('src/icons/128.png')).toString('base64');
  const gif = (await readFile('tests/fixtures/animated.gif')).toString('base64');
  const fixtures = {
    'https://photo.zadn.vn/locked-image.png': {data: image, mime: 'image/png'},
    'https://sticker.zadn.vn/locked-sticker.png': {data: image, mime: 'image/png'},
    'https://photo.zadn.vn/locked-animation.gif': {data: gif, mime: 'image/gif'},
    'https://file.dlfl.vn/locked-video.webm': {data: video, mime: 'video/webm'},
  };
  // Replace only these synthetic CDN responses. Capture, validation, encryption and storage are production code.
  await worker.evaluate(fixtures => {
    const originalFetch = fetch;
    globalThis.fetch = async (source, options) => {
      const fixture = fixtures[String(source)];
      if (!fixture) return originalFetch(source, options);
      const bytes = Uint8Array.from(atob(fixture.data), char => char.charCodeAt(0));
      return new Response(bytes, {headers: {'Content-Type': fixture.mime}});
    };
  }, fixtures);

  expect(await request({type: 'SETTINGS', consent: true, enabled: true, cacheMedia: true, platforms: ['zalo']})).toMatchObject({ok: true});
  await expect.poll(async () => (await request({type: 'STATE'})).health.some(item => item.accountName === 'Locked media account')).toBe(true);
  expect(await request({type: 'VAULT_LOCK'})).toMatchObject({unlocked: false});
  await popup.reload();
  await expect(popup.locator('#vault-password')).toBeVisible();

  const messages = [
    {msgId: 'locked-image', cliMsgId: 'locked-image-client', msgType: 2, message: {normalUrl: Object.keys(fixtures)[0]}},
    {msgId: 'locked-sticker', cliMsgId: 'locked-sticker-client', msgType: 4, message: {stickerUrl: Object.keys(fixtures)[1]}},
    {msgId: 'locked-gif', cliMsgId: 'locked-gif-client', msgType: 7, message: {normalUrl: Object.keys(fixtures)[2]}},
    {msgId: 'locked-video', cliMsgId: 'locked-video-client', msgType: 18, message: {videoUrl: Object.keys(fixtures)[3]}},
  ].map(message => ({...message, toUid: 'g200', fromUid: '42', dName: 'Media sender', sendDttm: Date.now()}));

  async function render(recalled) {
    await zalo.evaluate(({messages, recalled}) => {
      for (const message of messages) {
        document.getElementById('fixture-' + message.msgId)?.remove();
        const node = document.createElement('div');
        node.id = 'fixture-' + message.msgId;
        const bubble = document.createElement('div');
        bubble.id = 'text-mCntr_' + message.cliMsgId;
        bubble.className = recalled ? 'undo-message' : '';
        bubble.textContent = recalled ? 'Tin nhắn đã được thu hồi' : 'Locked media fixture';
        bubble.__reactFiber$fixture = {
          memoizedProps: {data: recalled ? {...message, msgType: 20, message: ''} : message},
          return: {memoizedProps: {conversation: {userId: 'g200', type: 2, name: 'Locked media group'}}},
        };
        node.append(bubble);
        document.getElementById('messageView').append(node);
      }
    }, {messages, recalled});
  }

  await render(false);
  await expect.poll(async () => (await pendingQueue(worker)).filter(item => item.sourceHash).length, {timeout: 15000}).toBe(4);
  const encrypted = JSON.stringify(await pendingQueue(worker));
  expect(encrypted).not.toContain('Media sender');
  expect(encrypted).not.toContain('https://photo.zadn.vn/locked-image.png');
  expect(encrypted).not.toContain(image);
  expect((await request({type: 'STATE'})).error).toBeTruthy();
  await render(true);
  await expect.poll(async () => (await pendingQueue(worker)).filter(item => !item.sourceHash).length).toBeGreaterThanOrEqual(2);

  await context.close();
  context = null;
  ({worker, popup} = await launch());
  await context.setOffline(true);
  await expect(popup.locator('#vault-password')).toBeVisible();
  expect((await request({type: 'STATE'})).error).toBeTruthy();
  await popup.locator('#vault-password').fill(password);
  await popup.locator('#vault-submit').click();
  await expect(popup.locator('.message')).toHaveCount(4);
  expect(await pendingQueue(worker)).toEqual([]);
  const state = await request({type: 'STATE'});
  expect(state.records).toHaveLength(4);
  for (const record of state.records) {
    expect(record.recalledAt).toBeTruthy();
    expect(record.attachments).toHaveLength(1);
    expect(record.attachments[0].cached).toBe(true);
    const asset = await request({type: 'ASSET', recordId: record.id, role: 'attachment', index: 0});
    expect(asset.asset).toMatchObject(fixtures[record.attachments[0].source]);
    await popup.locator(`[data-record-id="${record.messageId}"]`).click();
    await expect(popup.locator('.media-note')).toContainText('Đã lưu tệp');
    if (record.kind === 'video') {
      await expect.poll(() => popup.locator('.media-preview video').evaluate(video => ({ready:video.readyState>=1,error:video.error?.message||''}))).toEqual({ready:true,error:''});
      await popup.locator('.media-preview video').evaluate(video => video.play());
      await expect.poll(() => popup.locator('.media-preview video').evaluate(video => video.currentTime)).toBeGreaterThan(0);
    } else {
      await expect.poll(() => popup.locator('.media-preview img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    }
  }
  await popup.setViewportSize({width:800,height:600});
  await popup.goto(new URL('popup.html?popup=1',popup.url()).href);
  await popup.locator('[data-record-id="locked-video"]').click();
  const player=popup.locator('.media-preview video');
  await expect.poll(()=>player.evaluate(video=>video.readyState>=1)).toBe(true);
  expect(await player.evaluate(video=>{
    const rect=video.getBoundingClientRect();
    const footer=document.querySelector('footer').getBoundingClientRect();
    return rect.top>=document.querySelector('#main-content').getBoundingClientRect().top && rect.bottom<=footer.top;
  })).toBe(true);
  await popup.getByRole('button',{name:'Phát video',exact:true}).click();
  await expect.poll(()=>player.evaluate(video=>video.currentTime)).toBeGreaterThan(0);
  await popup.getByRole('button',{name:'Xem video lớn',exact:true}).click();
  await expect(popup.getByRole('dialog').locator('video')).toBeVisible();
  await popup.evaluate(()=>{window.addEventListener('keyup',event=>{if(event.key==='Escape')window.__overlayEscapeKeyupCancelled=event.defaultPrevented;},true);});
  await popup.keyboard.press('Escape');
  expect(await popup.evaluate(()=>window.__overlayEscapeKeyupCancelled)).toBe(true);
  await expect(popup.getByRole('dialog')).toHaveCount(0);
  await expect(popup.getByRole('button',{name:'Xem video lớn',exact:true})).toBeFocused();
  console.log('PASS locked Zalo media: four encrypted files captured before recall, Chromium restart requires password, offline unlock restores exact bytes and playable media. Synthetic platform/CDN only.');
} finally {
  await context?.close();
  await rm(root, {recursive: true, force: true});
}
