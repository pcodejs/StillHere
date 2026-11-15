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
  const source='https://s120-ava-talk.zadn.vn/fixture.png';
  const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJRkAAAAASUVORK5CYII=';
  await fixture.setupVault('fixture-pass',{});
  const state={settings:{enabled:false},records:[{id:'original',text:'Keep this original',attachments:[{source}]}]};
  await fixture.commitBackup(state,[{source,data}]);
  const before=await fixture.loadState({});
  let invalidRejected=false;
  try {await fixture.commitBackup({...state,records:[{...state.records[0],text:'Must not replace'}]},[{source,data:'aGVsbG8='}]);}catch{invalidRejected=true;}
  const afterInvalid=await fixture.loadState({});
  // Force capacity rejection inside the IndexedDB transaction, after encryption.
  const db=await fixture.openProtectedDatabase();
  await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put({id:'capacity-fixture',size:100*1024*1024});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  let capacityRejected=false;
  try {await fixture.commitBackup({...state,records:[{...state.records[0],text:'Must also not replace'}]},[{source,data}]);}catch{capacityRejected=true;}
  const afterCapacity=await fixture.loadState({});
  const asset=await fixture.readResource(source);
  return {invalidRejected,capacityRejected,before,afterInvalid,afterCapacity,data,asset};
 });
 expect(result.invalidRejected).toBe(true);
 expect(result.capacityRejected).toBe(true);
 expect(result.afterInvalid).toEqual(result.before);
 expect(result.afterCapacity).toEqual(result.before);
 expect(result.asset.data).toBe(result.data);
 console.log('PASS: browser IndexedDB media restore; invalid files and transaction capacity abort preserve original messages and media.');
}finally{await browser.close();}
