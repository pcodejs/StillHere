import {decodeBase64} from './base64.js';
import {recordSources,readResource} from './assets.js';
import {deviceKey,openProtectedDatabase,seal} from './vault.js';
import {MAX_CACHE_BYTES,MAX_RESOURCE_BYTES,resourceId,sniffResource} from './resources.js';
export async function collectBackupMedia(records){
 const files=[];
 for(const source of new Set(records.flatMap(recordSources))){
  const asset=await readResource(source);
  if(asset)files.push({source,data:asset.data});
 }
 return files;
}
export async function prepareBackupMedia(records,files,key){
 if(!Array.isArray(files)||files.length>6000)throw Error('Invalid backup media');
 const sources=new Set(records.flatMap(recordSources)),ids=new Set(),entries=[];let total=0;
 for(const file of files){
  if(!file||!sources.has(file.source)||typeof file.data!=='string'||file.data.length>Math.ceil(MAX_RESOURCE_BYTES/3)*4||! /^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw Error('Invalid backup media');
  const bytes=decodeBase64(file.data);
  const mime=sniffResource(bytes);if(!mime||bytes.length>MAX_RESOURCE_BYTES)throw Error('Unsupported backup file');
  total+=bytes.length;if(total>MAX_CACHE_BYTES)throw Error('Backup media capacity exceeded');
  const id=await resourceId(file.source);if(ids.has(id))throw Error('Duplicate backup resource');ids.add(id);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('go-lai-resource-v1:'+id)},key,bytes);
  entries.push({id,iv,data,mime,size:bytes.length,createdAt:Date.now()});
 }
 return entries;
}
export async function commitBackup(state,files){
 const key=await deviceKey();
 const entries=await prepareBackupMedia(state.records,files,key);
 const vault=await seal(state.records,key);
 await deviceKey(); // Reject if the unlock session expired during preparation.
 const db=await openProtectedDatabase();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta','assets'],'readwrite'),assets=tx.objectStore('assets');
  const request=assets.getAll();
  request.onsuccess=()=>{
   const incoming=new Set(entries.map(e=>e.id));
   const size=request.result.filter(e=>!incoming.has(e.id)).reduce((n,e)=>n+e.size,0)+entries.reduce((n,e)=>n+e.size,0);
   if(size>MAX_CACHE_BYTES){tx.abort();return;}
   entries.forEach(e=>assets.put(e));tx.objectStore('meta').put({settings:state.settings,vault},'state');
  };
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Backup capacity exceeded'));
 });}finally{db.close();}
}
