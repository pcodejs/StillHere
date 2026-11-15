import {chromium, expect} from '@playwright/test';
import {mkdtemp, cp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const directory = await mkdtemp(resolve(tmpdir(), 'fsub-missing-key-'));
const extension = resolve(directory, 'extension');
await cp(resolve('outputs/go-lai-extension'), extension, {recursive: true});
let context;
try {
  context = await chromium.launchPersistentContext(resolve(directory, 'profile'), {
    channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: {width: 800, height: 600},
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const url = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
  await page.goto(url);
  const original = await worker.evaluate(async () => {
    const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('go-lai-archive-v1')}, key, new TextEncoder().encode(JSON.stringify([{text: 'Old fixture without its key'}])));
    const base64 = value => btoa(String.fromCharCode(...new Uint8Array(value)));
    const vault = {version: 1, algorithm: 'AES-256-GCM', iv: base64(iv), data: base64(data)};
    await chrome.storage.local.set({vault, settings: {consent: true, enabled: true, cacheMedia: false, retentionDays: 30}});
    const database = await new Promise(resolve => {
      const request = indexedDB.open('go-lai-resource-cache', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets', {keyPath: 'id'});
      request.onsuccess = () => resolve(request.result);
    });
    const asset = {id: 'orphan-file', iv: new Uint8Array([1, 2, 3]), data: new Uint8Array([4, 5, 6]).buffer, mime: 'image/png', size: 3, createdAt: 123};
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('assets', 'readwrite');
      transaction.objectStore('assets').put(asset);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return vault;
  });
  const request = (type, extra = {}) => page.evaluate(message => chrome.runtime.sendMessage(message), {type, ...extra});
  expect(await request('VAULT_STATUS')).toMatchObject({configured: false, legacyIssue: 'missing-key'});
  expect(await request('VAULT_SETUP', {password: 'Test6!'})).toMatchObject({code: 'LEGACY_KEY_MISSING'});
  expect((await worker.evaluate(() => chrome.storage.local.get('vault'))).vault).toEqual(original);
  expect((await request('VAULT_STATUS')).configured).toBe(false);

  await page.reload();
  await expect(page.locator('#legacy-recovery-notice')).toContainText('thiếu khoá giải mã');
  await expect(page.locator('#vault-submit')).toBeDisabled();
  await page.locator('#vault-password').fill('Test6!');
  await page.locator('#vault-confirm').fill('Test6!');
  await page.locator('#preserve-legacy').check();
  await page.locator('#vault-submit').click();
  await expect(page.locator('#archive-button')).toBeVisible();
  await expect(page.locator('#vault-lock')).toHaveCount(0);
  expect((await request('STATE')).records).toEqual([]);

  const recovery = await worker.evaluate(async () => {
    const database = await new Promise(resolve => {
      const request = indexedDB.open('fsub-password-vault');
      request.onsuccess = () => resolve(request.result);
    });
    const encrypted = await new Promise(resolve => {
      const request = database.transaction('meta').objectStore('meta').get('legacyRecovery');
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    const {vaultUnlock} = await chrome.storage.session.get('vaultUnlock');
    const bytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', bytes(vaultUnlock.key), 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes(encrypted.iv), additionalData: new TextEncoder().encode('go-lai-archive-v1')}, key, bytes(encrypted.data));
    return JSON.parse(new TextDecoder().decode(plaintext))[0];
  });
  expect(recovery.local.vault).toEqual(original);
  expect(recovery.reason).toBe('missing-legacy-key');
  expect(recovery.assets).toEqual([{id: 'orphan-file', iv: 'AQID', data: 'BAUG', mime: 'image/png', size: 3, createdAt: 123}]);
  expect((await worker.evaluate(() => chrome.storage.local.get('vault'))).vault).toBeUndefined();

  // A real content-script event verifies collection resumes through its normal entry point.
  await context.route('https://chat.zalo.me/**', route => route.fulfill({contentType: 'text/html', body: '<title>Fixture Zalo</title><div id="messageView"></div>'}));
  const zalo = await context.newPage();
  await zalo.goto('https://chat.zalo.me/');
  await zalo.evaluate(() => {
    const element = document.createElement('div');
    element.id = 'text-mCntr_601';
    element.textContent = 'New message after recovery';
    element.__reactFiber$fixture = {memoizedProps: {data: {
      msgId: '501', cliMsgId: '601', toUid: 'u100', fromUid: '42', dName: 'Fixture',
      msgType: 1, message: element.textContent, sendDttm: Date.now(),
    }}};
    document.querySelector('#messageView').append(element);
  });
  await expect.poll(async () => (await request('STATE')).records.some(record => record.text === 'New message after recovery')).toBe(true);
  await request('VAULT_LOCK');
  expect((await request('STATE')).error).toBeTruthy();
  expect(await request('VAULT_UNLOCK', {password: 'Test6!'})).toMatchObject({unlocked: true});
  expect((await request('STATE')).records.some(record => record.text === 'New message after recovery')).toBe(true);
  console.log('PASS: missing legacy key is diagnosed, confirmation required, original ciphertext and all asset bytes preserved under password, setup succeeds, new capture resumes, lock/unlock works.');
} finally {
  await context?.close();
  await rm(directory, {recursive: true, force: true});
}
