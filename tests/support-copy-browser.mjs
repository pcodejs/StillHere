import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'stillhere-copy-'));let c;
try{
 const extension=resolve('outputs/go-lai-extension');
 c=await chromium.launchPersistentContext(root,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker'),p=await c.newPage();
 await c.grantPermissions(['clipboard-read','clipboard-write']);
 await p.goto(`chrome-extension://${new URL(w.url()).host}/popup.html?demo=1`);
 for(const language of ['VI','EN']){
  await p.getByText(language,{exact:true}).click();
  await p.locator('#support-button').click();
  await p.locator('#support button').filter({hasText:language==='VI'?'Sao chép':'Copy'}).first().click();
  expect(await p.evaluate(()=>navigator.clipboard.readText())).toBe('192198');
  await expect(p.locator('#support')).toContainText(language==='VI'?'Đã sao chép':'Copied');
  await p.waitForTimeout(2600);
 }
 console.log('PASS support copy in VI/EN: clipboard contains exact account 192198 and success feedback.');
}finally{await c?.close();await rm(root,{recursive:true,force:true});}
