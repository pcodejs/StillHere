// Disposable profile, no external mail delivery or real Zalo session.
import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'fsub-feedback-test-'));
let context;
try {
 const extension=join(root,'extension');
 await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
 expect(manifest.optional_host_permissions).not.toContain('https://api.telegram.org/*');
 const background=await readFile(join(extension,'background.js'),'utf8');
 expect(background).not.toContain('api.telegram.org');
 expect(background).not.toContain('__FSUB_PUBLISHER_CONFIG__');
 context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`],viewport:{width:800,height:600}});
 let outbound=0;
 await context.route(/^https?:/,route=>{outbound++;return route.abort();});
 const service=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(service.url()).host;
 const page=await context.newPage();
 await page.goto(`chrome-extension://${id}/popup.html?feedback=1`);
 expect(await page.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture password 054 secure'}))).toMatchObject({unlocked:true});
 await page.reload();
 // Intercept the external protocol and clipboard boundaries only.
 // No OS email handler is launched and no test content reaches the real clipboard.
 await page.evaluate(()=>{
   chrome.tabs.create=async options=>{window.__fixtureEmailTab=options;return {id:991};};
   navigator.clipboard.writeText=async text=>{window.__fixtureClipboard=text;};
 });
 const feedbackUrl=page.url();
 await expect(page.locator('#feedback-submit')).toBeDisabled();
 await expect(page.locator('#feedback-copy')).toBeDisabled();
 await page.locator('#feedback-message').fill('Xin thêm tính năng lọc theo loại ảnh.');
 await page.locator('#feedback-email').fill('tester@example.test');
 await page.locator('#feedback-copy').click();
 expect(await page.evaluate(()=>window.__fixtureClipboard)).toContain('Người nhận: contact.nguyenxuanphu@gmail.com');
 await expect(page.locator('#feedback-state')).toContainText('Đã sao chép góp ý');
 await expect(page.locator('#feedback-submit')).toBeDisabled();
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});
 await page.locator('#feedback-copy').click();
 await expect(page.locator('#feedback-state')).toContainText('Chưa sao chép được');
 await page.locator('#feedback-consent').check();
 await expect(page.locator('#feedback-submit')).toBeEnabled();
 await expect(page.locator('#feedback-submit')).toHaveText('Soạn email góp ý');
 await page.locator('#feedback-submit').scrollIntoViewIfNeeded();
 const bounds=await page.locator('#feedback-submit').boundingBox();
 const footer=await page.locator('footer').boundingBox();
 expect(bounds.y+bounds.height).toBeLessThanOrEqual(footer.y);
 await page.locator('#feedback-submit').click();
 expect(await page.evaluate(()=>window.__fixtureEmailTab.url)).toMatch(/^mailto:contact\.nguyenxuanphu@gmail\.com\?subject=/);
 expect(page.url()).toBe(feedbackUrl);
 await expect(page.locator('#feedback-state')).toContainText('Hãy kiểm tra và gửi trong ứng dụng email');
 await page.evaluate(()=>{chrome.tabs.create=async()=>{throw Error('unavailable');};});
 await page.locator('#feedback-submit').click();
 await expect(page.locator('#feedback-state')).toContainText('Chưa mở được email');
 await expect(page.locator('#feedback-message')).toHaveValue('Xin thêm tính năng lọc theo loại ảnh.');
 await expect.poll(()=>page.locator('.draft-row').textContent()).toContain('Đã lưu nháp');
 await page.reload();
 await expect(page.locator('#feedback-message')).toHaveValue('Xin thêm tính năng lọc theo loại ảnh.');
 await expect(page.locator('#feedback-consent')).not.toBeChecked();
 // A negative acknowledgement must never be presented as saved or deleted.
 await page.evaluate(()=>{window.originalSend=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(m,...args)=>['DRAFT_WRITE','DRAFT_CLEAR'].includes(m?.type)?Promise.resolve({ok:false}):window.originalSend(m,...args);});
 await page.locator('#feedback-message').fill('Unsaved text remains visible');
 await expect(page.locator('.draft-row')).toContainText('Chưa lưu được bản nháp');
 await page.getByRole('button',{name:'Xoá bản nháp',exact:true}).click();
 await expect(page.locator('#feedback-message')).toHaveValue('Unsaved text remains visible');
 await page.evaluate(()=>{chrome.runtime.sendMessage=window.originalSend;});
 await page.locator('#feedback-message').fill('Recovered draft');
 await expect(page.locator('.draft-row')).toContainText('Đã lưu nháp');
 await page.reload();await expect(page.locator('#feedback-message')).toHaveValue('Recovered draft');
 expect(outbound).toBe(0);
 console.log('PASS: feedback opens a separate email tab, copies locally without send consent, reports API failures, retains draft, resets consent and sends no HTTP request. External launch and clipboard intercepted.');
} finally {await context?.close();await rm(root,{recursive:true,force:true});}
