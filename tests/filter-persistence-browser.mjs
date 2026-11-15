import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
const root=await mkdtemp(join(tmpdir(),'stillhere-return-'));let context;
try{
 const extension=resolve('outputs/go-lai-extension');
 context=await chromium.launchPersistentContext(root,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const p=await context.newPage();
 const url=`chrome-extension://${new URL(worker.url()).host}/popup.html`;await p.goto(url);
 await p.evaluate(async()=>{await chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'Fixture6!'});await chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:true,platforms:['facebook']});});
 await p.goto(url);

 for (const lang of ['VI','EN']) {
  await p.getByText(lang,{exact:true}).first().click();
  await p.locator('.filter-toggle').click();
  const important=lang==='VI'?'Chỉ tin quan trọng':'Important messages only';
  const content=lang==='VI'?'Loại nội dung':'Content type';
  await p.getByRole('checkbox',{name:important,exact:true}).check();
  await p.getByRole('combobox',{name:content,exact:true}).click();
  await p.getByRole('option',{name:'Video',exact:true}).click();
  await expect.poll(()=>p.evaluate(async()=>(await chrome.runtime.sendMessage({type:'UI_READ'})).preferences)).toMatchObject({kind:'video',pinnedOnly:true});
  await p.reload();
  await p.locator('.filter-toggle').click();
  await expect(p.getByRole('checkbox',{name:important,exact:true})).toBeChecked();
  await expect(p.getByRole('combobox',{name:content,exact:true})).toHaveValue('Video');
  await p.getByRole('button',{name:lang==='VI'?'Xoá bộ lọc':'Reset filters',exact:true}).last().click();
  await expect.poll(()=>p.evaluate(async()=>(await chrome.runtime.sendMessage({type:'UI_READ'})).preferences)).toMatchObject({kind:'all',pinnedOnly:false});
  await p.reload();
 }
 console.log('PASS VI/EN content and important filters persist through reload; reset persists.');
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
