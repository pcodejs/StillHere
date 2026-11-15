import {chromium, expect} from '@playwright/test';
import {mkdtemp, cp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';

const directory = await mkdtemp(resolve(tmpdir(), 'fsub-session-ui-'));
const extension = resolve(directory, 'extension');
await cp(resolve('outputs/go-lai-extension'), extension, {recursive: true});
const launch = () => chromium.launchPersistentContext(resolve(directory, 'profile'), {
  channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: {width: 800, height: 600},
});
let context;
async function checkStartup(context, url, expectedTitle) {
  const probe = await context.newPage();
  try {
    await probe.addInitScript(() => {
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      let release;
      const ready = new Promise(resolve => {release = resolve;});
      window.releaseVaultStatus = release;
      chrome.runtime.sendMessage = (message, ...args) => message?.type === 'VAULT_STATUS'
        ? ready.then(() => send(message, ...args)) : send(message, ...args);
    });
    await probe.goto(url);
    await expect(probe.locator('#vault-loading')).toBeVisible();
    await expect(probe.locator('#vault-password')).toHaveCount(0);
    await expect(probe.locator('#vault-submit')).toHaveCount(0);
    await expect(probe.getByRole('heading')).toHaveCount(0);
    await probe.getByText('EN', {exact: true}).click();
    await expect(probe.locator('#vault-loading')).toHaveText('Opening the extension…');
    await probe.evaluate(() => window.releaseVaultStatus());
    await expect(probe.locator('#vault-loading')).toHaveCount(0);
    await expect(probe.locator('h2')).toHaveText(expectedTitle);
  } finally {
    await probe.close();
  }
}
try {
  context = await launch();
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const url = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
  await checkStartup(context, url, 'Protect your saved messages');
  let page = await context.newPage();
  await page.goto(url);
  await expect(page.locator('#legacy-recovery-notice')).toHaveCount(0);
  await expect(page.locator('#vault-password')).toBeVisible();
  await page.getByText('EN', {exact: true}).click();
  await expect(page.locator('h2')).toHaveText('Protect your saved messages');
  await expect(page.locator('#vault-security-copy')).toContainText('fully quit Chrome');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(await page.evaluate(() => chrome.runtime.sendMessage({type: 'LANGUAGE_READ'}))).toEqual({language: 'en'});
  expect((await page.evaluate(() => chrome.runtime.sendMessage({type: 'UI_READ'}))).error).toBeTruthy();
  await page.reload();
  await expect(page.locator('h2')).toHaveText('Protect your saved messages');
  await page.locator('#vault-password').fill('Test6!');
  await page.locator('#vault-confirm').fill('Other6!');
  await page.locator('#vault-submit').click();
  await expect(page.getByRole('alert')).toHaveText('The passwords do not match.');
  await page.getByText('VI', {exact: true}).click();
  await expect(page.getByRole('alert')).toHaveText('Hai mật khẩu chưa trùng nhau.');
  await page.getByText('EN', {exact: true}).click();
  await page.locator('#vault-confirm').fill('Test6!');
  await page.locator('#vault-submit').click();
  await expect(page.locator('#onboarding')).toBeVisible();
  await expect(page.locator('#vault-lock')).toHaveCount(0);
  await expect(page.getByRole('button', {name: /Lock extension|Khoá tiện ích/})).toHaveCount(0);
  const session = await worker.evaluate(async () => (await chrome.storage.session.get('vaultUnlock')).vaultUnlock);
  expect(session.expiresAt).toBeUndefined();
  const request = type => page.evaluate(type => chrome.runtime.sendMessage({type}), type);
  expect(await request('VAULT_STATUS')).toMatchObject({unlocked:true,sessionLifetime:'browser'});
  // Old time-based fields must not impose a timeout after the upgrade.
  await worker.evaluate(async()=>{const {vaultUnlock}=await chrome.storage.session.get('vaultUnlock');await chrome.storage.session.set({vaultUnlock:{...vaultUnlock,expiresAt:Date.now()-86400000}});});
  expect((await request('VAULT_STATUS')).unlocked).toBe(true);
  await page.reload();expect((await request('VAULT_STATUS')).unlocked).toBe(true);
  // Explicit security lock is separate from session duration.
  await page.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_LOCK'}));
  await expect(page.locator('#vault-password')).toBeVisible();
  await expect(page.locator('h2')).toHaveText('Unlock StillHere');
  expect((await request('STATE')).error).toBeTruthy();
  await page.locator('#vault-password').fill('Wrong6!');
  await page.locator('#vault-submit').click();
  await expect(page.getByRole('alert')).toHaveText('Unable to open your data. Check your password and try again.');
  await page.locator('#vault-password').fill('Test6!');
  await page.locator('#vault-submit').click();
  await expect(page.locator('#onboarding')).toBeVisible();
  await context.close();
  context = await launch();
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await checkStartup(context, url, 'Unlock StillHere');
  page = await context.newPage();
  await page.goto(url);
  await expect(page.locator('h2')).toHaveText('Unlock StillHere');
  expect((await page.evaluate(() => chrome.runtime.sendMessage({type: 'VAULT_STATUS'}))).unlocked).toBe(false);
  expect((await worker.evaluate(() => chrome.storage.session.get('vaultUnlock'))).vaultUnlock).toBeUndefined();
  await page.setViewportSize({width: 360, height: 600});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  console.log('PASS: delayed startup never displays a false setup/unlock form, browser-lifetime session, no elapsed-time expiry, Chrome restart prompt, no manual lock button, VI/EN setup/unlock/errors and persisted language, locked data remains protected.');
} finally {
  await context?.close();
  await rm(directory, {recursive: true, force: true});
}
