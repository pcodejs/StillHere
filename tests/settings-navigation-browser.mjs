import {chromium,expect} from '@playwright/test';import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {exportPortable} from '../src/core/vault.js';
const root=await mkdtemp(join(tmpdir(),'stillhere-073-')),extension=join(root,'extension'),profile=join(root,'profile');let c;
await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
// Fixture-only grant: product asks for this permission during onboarding.
const mf=join(extension,'manifest.json'),manifest=JSON.parse(await readFile(mf,'utf8'));manifest.host_permissions=['https://chat.zalo.me/*'];await writeFile(mf,JSON.stringify(manifest));
const background=join(extension,'background.js');await writeFile(background,`const originalInstallListener=chrome.runtime.onInstalled.addListener.bind(chrome.runtime.onInstalled);chrome.runtime.onInstalled.addListener=fn=>{globalThis.fixtureInstalled=fn;originalInstallListener(fn);};\n`+await readFile(background,'utf8'));
async function launch(){c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});const w=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');return {w,url:`chrome-extension://${new URL(w.url()).host}/`};}
try {
 const {url}=await launch(); const p=await c.newPage();
 await p.goto(url+'popup.html');
 await p.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'fixture-pass'}));
 await p.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:false,platforms:['zalo']}));
 await p.reload(); await p.locator('#settings-button').click();
 for(const language of ['VI','EN']) {
  await p.locator('.header-actions label').filter({hasText:new RegExp('^'+language+'$')}).click();
  for(const [width,height] of [[390,600],[800,600],[1280,600],[1470,900]]) {
   await p.setViewportSize({width,height});
   for(const id of ['storage','security','backup','delete','platforms']) {
    await p.locator(`.settings-index a[href="#settings-${id}"]`).click();
    await expect(p.locator('.settings-index [aria-current="location"]')).toHaveAttribute('href',`#settings-${id}`);
    const bounds=await p.evaluate(()=>{const n=document.querySelector('.settings-index').getBoundingClientRect(),r=document.querySelector('main').getBoundingClientRect();return {top:n.top,root:r.top,right:n.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};});
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.root-1); expect(bounds.right).toBeLessThanOrEqual(bounds.width); expect(bounds.overflow).toBe(false);
   }
  }
 }
 await p.setViewportSize({width:800,height:600});
 await p.locator('.settings-index a[href="#settings-security"]').focus();
 await p.keyboard.press('Enter');
 await expect(p.locator('.settings-index [aria-current="location"]')).toHaveAttribute('href','#settings-security');
 await p.mouse.move(600,400);
 await p.mouse.wheel(0,-10000);
 await expect(p.locator('.settings-index [aria-current="location"]')).toHaveAttribute('href','#settings-platforms');
 await p.locator('.settings-index a[href="#settings-delete"]').click();
 await p.keyboard.press('Home');
 await p.locator('#main-content').evaluate(el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));el.scrollTop=0;});
 await expect(p.locator('.settings-index [aria-current="location"]')).toHaveAttribute('href','#settings-platforms');
 await p.locator('.settings-index a[href="#settings-backup"]').click();
 await p.locator('#archive-button').click();
 expect(new URL(p.url()).hash).toBe('');
 console.log('PASS settings sticky navigation and current section VI/EN at 390/800/1280 x 600 and 1470 x 900');
} finally {await c?.close();await rm(root,{recursive:true,force:true});}
