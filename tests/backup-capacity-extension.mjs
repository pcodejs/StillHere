import {chromium,expect} from '@playwright/test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {exportPortable,importPortableBundle} from '../src/core/vault.js';
import {PNG} from 'pngjs';
import {randomFillSync} from 'node:crypto';
const root=await mkdtemp(resolve(tmpdir(),'stillhere-backup-'));
const extension=resolve('outputs/go-lai-extension');
const contexts=[];
async function open(name){
 const context=await chromium.launchPersistentContext(resolve(root,name),{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:800,height:600}});
 contexts.push(context);
 await context.route('https://**/*',route=>route.abort());
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
 expect(await page.evaluate(()=>chrome.runtime.sendMessage({type:'VAULT_SETUP',password:'local-fixture'}))).toMatchObject({unlocked:true});
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'SETTINGS',consent:true,enabled:false,platforms:['zalo']}));
 return {context,page};
}
try{
 const {page}=await open('capacity');
 const bytes=Buffer.alloc(20*1024*1024);bytes.set([137,80,78,71,13,10,26,10]);
 const data=bytes.toString('base64'),now=Date.now();
 const media=Array.from({length:5},(_,i)=>({source:'https://s120-ava-talk.zadn.vn/capacity-'+i+'.png',data}));
 const records=media.map((m,i)=>({platform:'zalo',conversationId:'capacity',messageId:String(i),sender:'Fixture',conversationName:'Capacity',kind:'image',text:'Capacity '+i,attachments:[{kind:'image',source:m.source}],hasOriginal:true,firstSeen:now-2000,recalledAt:now-1000}));
 let encoded=JSON.stringify(await exportPortable(records,'portable-pass',media));
 console.log('Prepared encrypted envelope bytes:',encoded.length);
 const begin=await page.evaluate(size=>chrome.runtime.sendMessage({type:'BACKUP_TRANSFER_BEGIN',size}),encoded.length);
 expect(begin.token).toBeTruthy();
 const chunk=512*1024;
 for(let offset=0,index=0;offset<encoded.length;offset+=chunk,index++){
  const result=await page.evaluate(m=>chrome.runtime.sendMessage(m),{type:'BACKUP_TRANSFER_CHUNK',token:begin.token,index,part:encoded.slice(offset,offset+chunk)});
  expect(result.received).toBe(Math.min(offset+chunk,encoded.length));
 }
 expect(await page.evaluate(token=>chrome.runtime.sendMessage({type:'BACKUP_TRANSFER_COMMIT',token,password:'portable-pass'}),begin.token)).toMatchObject({ok:true,count:5});
 encoded=null;
 console.log('Maximum media imported through runtime chunks');
 const offered=await page.evaluate(()=>chrome.runtime.sendMessage({type:'BACKUP_EXPORT_MEDIA',password:'portable-pass'}));
 expect(offered.token).toBeTruthy();expect(offered.size).toBeGreaterThan(180000000);
 const parts=[];
 for(let offset=0;offset<offered.size;offset+=chunk){
  const result=await page.evaluate(m=>chrome.runtime.sendMessage(m),{type:'BACKUP_TRANSFER_READ',token:offered.token,offset});
  expect(result.part.length).toBe(Math.min(chunk,offered.size-offset));parts.push(result.part);
 }
 await page.evaluate(token=>chrome.runtime.sendMessage({type:'BACKUP_TRANSFER_CANCEL',token}),offered.token);
 const restored=await importPortableBundle(JSON.parse(parts.join('')),'portable-pass');
 expect(restored.records).toHaveLength(5);expect(restored.media).toHaveLength(5);
 expect(restored.media.every(m=>m.data===data)).toBe(true);
 console.log('PASS maximum 100 MiB media through real MV3 runtime import/export chunks; decrypted bytes match.');
}finally{for(const context of contexts)await context.close();await rm(root,{recursive:true,force:true});}
