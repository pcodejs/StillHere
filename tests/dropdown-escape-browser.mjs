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
 await p.locator('.filter-toggle').click();
 await p.evaluate(()=>window.addEventListener('keydown',e=>{if(e.key==='Escape')window.escapeCancelled=e.defaultPrevented;}));
 let checked=0;
 for(const language of ['VI','EN']) {
  await p.getByText(language,{exact:true}).first().click();
  const selects=p.locator('[aria-haspopup="listbox"]');
  expect(await selects.count()).toBeGreaterThanOrEqual(4);
  for(let i=0;i<await selects.count();i++) {
   const select=selects.nth(i);
   await select.click();
   await expect(select).toHaveAttribute('aria-expanded','true');
   await p.keyboard.press('Escape');
   await expect(select).toHaveAttribute('aria-expanded','false');
   await expect(p.getByRole('listbox')).toBeHidden();
   expect(await p.evaluate(()=>window.escapeCancelled)).toBe(true);
   await expect(select).toBeFocused();
   await p.keyboard.press('Escape');
   expect(await p.evaluate(()=>window.escapeCancelled)).toBe(false);
   checked++;
  }
 }
 console.log(`PASS ${checked} VI/EN dropdown cases: Escape closes list and retains focus; plain Escape stays unchanged.`);
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
