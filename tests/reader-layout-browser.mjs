import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'reader-layout-'));const extension=resolve('outputs/go-lai-extension');let c;
try{
 c=await chromium.launchPersistentContext(root,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));const url=`chrome-extension://${new URL(w.url()).host}/popup.html`;
 for(const language of ['vi','en'])for(const width of [390,800,1280]){
  await p.setViewportSize({width,height:width===800?600:900});await p.goto(url+'?demo=1');
  await p.getByText(language==='vi'?'VI':'EN',{exact:true}).first().click();await expect(p.locator('.message')).toHaveCount(5);
  for(const view of ['archive','settings','diagnostics','feedback','about','support']){
   if(['feedback','about'].includes(view))await p.locator('.more-menu').click();
   await p.locator('#'+view+'-button').click();
   await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await p.waitForTimeout(180);
   expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(view==='support'){await expect(p.locator('#support-qr')).toBeVisible();expect(await p.locator('#support-qr').evaluate(i=>i.complete&&i.naturalWidth>0&&i.getBoundingClientRect().width>=180)).toBe(true);}
   await p.screenshot({path:`outputs/screenshots/reader-${view}-${language}-${width}.png`});
  }
  await p.locator('#archive-button').click();
  await p.locator('#search').fill('no-match-reader-fixture');
  await expect(p.locator('.message')).toHaveCount(0);
  await expect(p.locator('.active-filters button')).toHaveCount(2);
  await p.locator('.active-filters button').first().click();
  await expect(p.locator('#search')).toHaveValue('');
  await expect(p.locator('.message')).toHaveCount(5);
  await expect(p.locator('.active-filters')).toHaveCount(0);
  await p.locator('.message').first().click();
  await expect(p.locator('.message-detail')).toBeVisible();
  await expect(p.locator('.message-annotations')).toHaveCount(0);
  await p.getByRole('button',{name:language==='vi'?'Thêm ghi chú':'Add note',exact:true}).click();await expect(p.locator('.message-annotations')).toBeVisible();
  if(width<700){await p.locator('.mobile-back').click();await expect(p.locator('.message.current')).toBeFocused();}
 }
 // High zoom reduces the CSS viewport: the reader must remain reachable below tools.
 for(const language of ['vi','en'])for(const width of [400,630,800]){
  await p.setViewportSize({width,height:350});await p.goto(url+'?demo=1');
  await p.getByText(language==='vi'?'VI':'EN',{exact:true}).first().click();
  await p.locator('.message').first().click();
  await expect(p.locator('.message-detail')).toBeVisible();
  const action=p.getByRole('button',{name:language==='vi'?'Thêm ghi chú':'Add note',exact:true});
  await action.scrollIntoViewIfNeeded();await expect(action).toBeInViewport();
  await action.click();await expect(p.locator('.message-annotations')).toBeVisible();
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await p.setViewportSize({width:390,height:800});await p.goto(url);await expect(p.locator('#vault-password')).toBeVisible();expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path:'outputs/screenshots/reader-vault-create.png'});
 expect(errors).toEqual([]);console.log('PASS redesigned six views VI/EN at 390/800/1280; overflow, menu navigation, progressive note, mobile focus, password layout.');
}finally{await c?.close();await rm(root,{recursive:true,force:true});}
