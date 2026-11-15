import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'stillhere-permission-upgrade-'));
const extension=join(root,'extension');let context;
async function launch(){context=await chromium.launchPersistentContext(join(root,'profile'),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});return context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');}
try{
 await cp(resolve('outputs/go-lai-extension'),extension,{recursive:true});
 const path=join(extension,'manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));
 // Simulate an older required grant in an isolated profile only.
 await writeFile(path,JSON.stringify({...manifest,host_permissions:['https://api.telegram.org/*']}));
 let worker=await launch();
 console.log('legacy',await worker.evaluate(()=>chrome.permissions.getAll()));
 await context.close();context=null;
 await writeFile(path,JSON.stringify(manifest));
 worker=await launch();
 const upgraded=await worker.evaluate(()=>chrome.permissions.getAll());
 expect(upgraded.origins).not.toContain('https://api.telegram.org/*');
 console.log('PASS isolated upgrade removes obsolete required Telegram origin',upgraded);
 console.log('explicit removal',await worker.evaluate(async()=>{try{return await chrome.permissions.remove({origins:['https://api.telegram.org/*']});}catch(e){return {error:e.message};}}));
 console.log('after removal',await worker.evaluate(()=>chrome.permissions.getAll()));
}finally{await context?.close();await rm(root,{recursive:true,force:true});}
