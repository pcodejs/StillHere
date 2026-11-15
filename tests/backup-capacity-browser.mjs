import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`export * from './src/core/vault.js'; export * from './src/core/backup-media.js'; export * from './src/core/assets.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'fixture'});
const browser=await chromium.launch({headless:true,channel:'chromium'});
try {
 const page=await browser.newPage();
 await page.route('http://localhost/**',r=>r.fulfill({body:'<!doctype html><title>Atomic backup fixture</title>'}));
 await page.goto('http://localhost/');
 await page.evaluate(()=>{
  const area=()=>{const values={};return {async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]]));},async set(v){Object.assign(values,v);},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete values[k];},async setAccessLevel(){}};};
  window.chrome={storage:{session:area(),local:area()}};
 });
 await page.addScriptTag({content:bundled.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const started=performance.now();
  await fixture.setupVault('fixture-pass',{});
  // Synthetic container bytes stress size/crypto/IndexedDB, not image decoding.
  const bytes=new Uint8Array(20*1024*1024);bytes.set([137,80,78,71,13,10,26,10]);
  const data=fixture.base64(bytes),media=Array.from({length:5},(_,i)=>({source:'https://s120-ava-talk.zadn.vn/maximum-'+i+'.png',data}));
  const records=media.map((file,i)=>({id:String(i),text:'Capacity fixture',attachments:[{source:file.source}]}));
  await fixture.commitBackup({settings:{enabled:false},records},media);
  const collected=await fixture.collectBackupMedia(records);
  const backup=await fixture.exportPortable(records,'portable-pass',collected);
  const size=JSON.stringify(backup).length;
  const restored=await fixture.importPortableBundle(backup,'portable-pass');
  const matches=restored.media.every(file=>file.data===data)&&restored.media.length===5;
  await fixture.commitBackup({settings:{enabled:false},records:restored.records},restored.media);
  return {size,matches,assets:(await fixture.cacheInventory()).length,elapsed:Math.round(performance.now()-started)};
 });
 expect(result.matches).toBe(true);expect(result.assets).toBe(5);
 expect(result.size).toBeLessThanOrEqual(200*1024*1024);
 console.log('PASS 100 MiB synthetic media cache encrypt/export/decrypt/restore:',JSON.stringify(result));
}finally{await browser.close();}
