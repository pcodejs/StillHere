import {deviceKey,base64,openProtectedDatabase} from './vault.js';
import {resourceId,resourceSource,sniffResource,MAX_RESOURCE_BYTES,MAX_CACHE_BYTES,RESOURCE_ORIGINS} from './resources.js';


async function transact(mode,operation) {
  await deviceKey();
  const db=await openProtectedDatabase();
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction('assets',mode);
      let result;
      operation(transaction.objectStore('assets'),value=>{result=value;});
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error||Error('Cache transaction aborted'));
    });
  } finally { db.close(); }
}

export async function cacheInventory() {
  return transact('readonly',(store,done)=>{
    readMetadata(store,done);
  });
}

function readMetadata(store,done) {
  const metadata=[];
  const request=store.openCursor();
  request.onsuccess=()=>{
    const cursor=request.result;
    if(!cursor){done(metadata);return;}
    const {id,size,mime,createdAt}=cursor.value;
    metadata.push({id,size,mime,createdAt});
    cursor.continue();
  };
}

export async function saveResource(source,bytes,isCurrent=()=>true) {
  if(!resourceSource(source)||!bytes.length||bytes.length>MAX_RESOURCE_BYTES)throw Error('File size limit');
  const mime=sniffResource(bytes);
  if(!mime)throw Error('Unsupported or encrypted resource');
  const id=await resourceId(source);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('go-lai-resource-v1:'+id)},await deviceKey(),bytes);
  const entry={id,iv,data,mime,size:bytes.length,createdAt:Date.now()};
  await transact('readwrite',(store)=>{
    readMetadata(store,metadata=>{
      if(!isCurrent())return;
      const old=metadata.filter(item=>item.id!==id).sort((a,b)=>a.createdAt-b.createdAt);
      let total=old.reduce((sum,item)=>sum+item.size,entry.size);
      for(const item of old){
        if(total<=MAX_CACHE_BYTES)break;
        store.delete(item.id);
        total-=item.size;
      }
      store.put(entry);
    });
  });
  return {id,size:entry.size,mime};
}

export async function readResource(source) {
  const id=await resourceId(source);
  const entry=await transact('readonly',(store,done)=>{
    const request=store.get(id);
    request.onsuccess=()=>done(request.result);
  });
  if(!entry)return null;
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:entry.iv,additionalData:new TextEncoder().encode('go-lai-resource-v1:'+id)},await deviceKey(),entry.data));
  const mime=sniffResource(plain);
  if(!mime)throw Error('Unsupported cached resource');
  return {mime,data:base64(plain)};
}

export async function retainResources(sources) {
  const ids=new Set(await Promise.all([...sources].map(resourceId)));
  await transact('readwrite',store=>{
    const request=store.openCursor();
    request.onsuccess=()=>{
      const cursor=request.result;
      if(!cursor)return;
      if(!ids.has(cursor.key))cursor.delete();
      cursor.continue();
    };
  });
}

export async function downloadResource(source,signal) {
  if(!resourceSource(source,false))throw Error('Unsupported source');
  if(!await chrome.permissions.contains({origins:[new URL(source).origin+'/*']}))throw Error('Permission required');
  const facebook=!!resourceSource(source,false,'facebook');
  const timeout=AbortSignal.timeout(20000);
  // Extension connect-src checks every redirect before it reaches the network.
  const response=await fetch(source,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow',signal:signal?AbortSignal.any([signal,timeout]):timeout});
  const destination=response.url || source;
  if(!resourceSource(destination,false,facebook?'facebook':'zalo') ||
    !await chrome.permissions.contains({origins:[new URL(destination).origin+'/*']})) {
    await response.body?.cancel().catch(()=>{});
    throw Error('Unapproved resource destination');
  }
  if(!response.ok||!response.body)throw Error('Resource unavailable');
  if(Number(response.headers.get('content-length'))>MAX_RESOURCE_BYTES)throw Error('File size limit');
  const reader=response.body.getReader();
  const chunks=[];
  let size=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.length;
      if(size>MAX_RESOURCE_BYTES)throw Error('File size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}

export function recordSources(record) {
  return [record.senderAvatar,record.conversationAvatar,...(record.conversationAvatars||[]),...(record.attachments||[]).map(item=>item.source)].filter(value=>resourceSource(value));
}

export async function describeRecords(records) {
  const inventory=new Map((await cacheInventory()).map(item=>[item.id,item]));
  const result=[];
  for(const record of records){
    const attachments=[];
    for(const item of record.attachments||[]){
      const cached=inventory.get(await resourceId(item.source));
      attachments.push({...item,cached:!!cached,mime:cached?.mime||'',size:cached?.size||0});
    }
    const conversationAvatarsCached=await Promise.all((record.conversationAvatars||[]).map(async source=>inventory.has(await resourceId(source))));
    result.push({...record,attachments,conversationAvatarsCached,
      senderAvatarCached:!!(record.senderAvatar&&inventory.has(await resourceId(record.senderAvatar))),
      conversationAvatarCached:!!(record.conversationAvatar&&inventory.has(await resourceId(record.conversationAvatar)))
    });
  }
  return {records:result,cacheCount:inventory.size,cacheBytes:[...inventory.values()].reduce((sum,item)=>sum+item.size,0)};
}
