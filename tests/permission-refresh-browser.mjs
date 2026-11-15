// Disposable profile. Permission responses/events are simulated, no real access is granted.
import {chromium, expect} from '@playwright/test';
import {mkdtemp, cp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
const root = await mkdtemp(join(tmpdir(), 'stillhere-permission-refresh-'));
let context;
try {
  const extension = join(root, 'extension');
  await cp(resolve('outputs/go-lai-extension'), extension, {recursive:true});
  context = await chromium.launchPersistentContext(join(root, 'profile'), {
    channel:'chromium', headless:true, ignoreDefaultArgs:['--disable-extensions'],
    args:[`--load-extension=${extension}`, `--disable-extensions-except=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const url = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
  await page.goto(url);
  await page.evaluate(() => chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-permission-pass'}));
  await page.evaluate(() => chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:false,platforms:['zalo']}));
  await page.addInitScript(() => {
    window.fixtureGranted = true;
    window.permissionAdded = [];
    window.permissionRemoved = [];
    for (const [event, listeners] of [[chrome.permissions.onAdded,window.permissionAdded], [chrome.permissions.onRemoved,window.permissionRemoved]]) {
      const add = event.addListener.bind(event);
      event.addListener = listener => { listeners.push(listener); add(listener); };
    }
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message, ...args) => {
      const result = await send(message, ...args);
      return message?.type === 'STATE'
        ? {...result,sitePermissions:{...result.sitePermissions,zalo:window.fixtureGranted}}
        : result;
    };
  });
  await page.goto(url+'?view=diagnostics');
  const access = page.locator('.activity-platform').first();
  await expect(access).toContainText('Đã cấp');
  // Returning from Chrome's access manager must refresh while Connection stays open.
  await page.evaluate(() => {
    window.fixtureGranted = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(access).toContainText('Chưa cấp');
  await page.evaluate(() => {
    window.fixtureGranted = true;
    for (const listener of window.permissionAdded) listener({origins:['https://chat.zalo.me/*']});
  });
  await expect(access).toContainText('Đã cấp');
  // Revocation must also refresh Settings without leaving the form.
  await page.locator('#settings-button').click();
  await page.evaluate(() => {
    window.fixtureGranted = false;
    for (const listener of window.permissionRemoved) listener({origins:['https://chat.zalo.me/*']});
  });
  await expect(page.locator('.platform-access-row').first().locator('p')).toContainText('Đọc hội thoại: Chưa cấp');
  // A permission change on a secondary view must be current when Connection is reopened.
  await page.locator('.more-menu').click();
  await page.locator('#feedback-button').click();
  await page.evaluate(() => {window.fixtureGranted = true;});
  await page.locator('#diagnostics-button').click();
  await expect(access).toContainText('Đã cấp');
  expect(errors).toEqual([]);
  console.log('PASS: Connection and Settings refresh host access on visibility, permission events and view entry. Permission changes simulated in disposable Chromium.');
} finally {
  await context?.close();
  await rm(root,{recursive:true,force:true});
}
