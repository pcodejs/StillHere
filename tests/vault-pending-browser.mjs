import {chromium, expect} from '@playwright/test';
import {mkdtemp, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root = await mkdtemp(join(tmpdir(), 'stillhere-pending-'));
let context;
try {
 const extension = resolve('outputs/go-lai-extension');
 context = await chromium.launchPersistentContext(root, {channel:'chromium', headless:true, ignoreDefaultArgs:['--disable-extensions'], args:[`--load-extension=${extension}`, `--disable-extensions-except=${extension}`]});
 const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 const url = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
 for (const language of ['vi','en']) {
  const p = await context.newPage();
  await p.addInitScript(language => {
   const original = chrome.runtime.sendMessage.bind(chrome.runtime);
   let statusCalls = 0;
   window.pendingQA = {statusCalls:0, unlockCalls:0};
   chrome.runtime.sendMessage = (message, ...args) => {
    if (message.type === 'LANGUAGE_READ') return Promise.resolve({language});
    if (message.type === 'VAULT_STATUS') {
     window.pendingQA.statusCalls++;
     if (++statusCalls > 1) return new Promise(resolve => {window.releaseStatus = resolve;});
     return Promise.resolve({configured:true,unlocked:false,capture:{ready:true,enabled:true}});
    }
    if (message.type === 'VAULT_UNLOCK') {
     window.pendingQA.unlockCalls++;
     return new Promise(resolve => {window.releaseUnlock = resolve;});
    }
    return original(message,...args);
   };
  }, language);
  await p.goto(url);
  await p.locator('#vault-password').fill('Fixture6!');
  await p.locator('#vault-submit').click();
  await expect(p.locator('#vault-progress')).toContainText(language==='vi'?'Đang xử lý':'Processing');
  await expect(p.locator('#vault-progress')).toContainText(language==='vi'?'lâu hơn bình thường':'longer than usual',{timeout:12000});
  const counts = await p.evaluate(() => window.pendingQA);
  expect(counts).toEqual({statusCalls:2,unlockCalls:1});
  await p.evaluate(() => {
   window.releaseUnlock({error:'Invalid',code:'PASSWORD_INVALID'});
   window.releaseStatus({configured:true,unlocked:false,capture:{ready:true,enabled:true}});
   window.releaseStatus = null;
   const previous = chrome.runtime.sendMessage;
   chrome.runtime.sendMessage = (m,...args) => m.type==='VAULT_STATUS' ? Promise.resolve({configured:true,unlocked:false,capture:{ready:true,enabled:true}}) : previous(m,...args);
  });
  await expect(p.locator('#vault-progress')).toHaveCount(0);
  await expect(p.locator('#vault-submit')).toBeEnabled();
  await expect(p.locator('#vault-password')).toHaveAttribute('aria-invalid','true');
  await p.close();
 }
 console.log('PASS VI/EN delayed unlock feedback, one outstanding status poll, invalid-password recovery.');
} finally {await context?.close(); await rm(root,{recursive:true,force:true});}
