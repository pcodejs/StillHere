import {decodeBase64} from './base64.js';
import {recordSources} from './assets.js';
import {metaGet,metaWrite,deviceKey,seal,unseal,base64} from './vault.js';
const decode = decodeBase64;
// Only the public encryption key is available while locked. The private key
// is wrapped by the password-derived vault key and never persisted in plaintext.
export async function prepareLockedCapture() {
  if (await metaGet('captureKeys')) return;
  const pair = await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const publicKey = await crypto.subtle.exportKey('jwk',pair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk',pair.privateKey);
  await metaWrite('captureKeys',{publicKey,privateKey:await seal([privateKey],await deviceKey())});
}
export async function lockedSettings() {
  if (!await metaGet('captureKeys')) return {enabled:false};
  return (await metaGet('state'))?.settings || {enabled:false};
}
export async function enqueueLocked(payload) {
  const keys=await metaGet('captureKeys');
  if(!keys)throw Error('Capture key unavailable');
  const hash=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))));
  const queue=await metaGet('captureQueue') || [];
  if(queue.some(e=>e.hash===hash))return;
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const publicKey=await crypto.subtle.importKey('jwk',keys.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const envelope=await seal([payload],key);
  const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},publicKey,await crypto.subtle.exportKey('raw',key));
  const entry={hash,id:crypto.randomUUID(),at:Date.now(),wrapped:base64(new Uint8Array(wrapped)),envelope};
  // Bound both disk use and event flooding. Never store plaintext fallback.
  if(queue.length>=3000 || queue.reduce((n,e)=>n+e.envelope.data.length,0)+envelope.data.length>140*1024*1024){await metaWrite('captureCapacityReached',true);throw Error('Locked capture capacity reached');}
  if(payload.source)entry.sourceHash=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload.source))));
  if(payload.events)entry.references=await Promise.all([...new Set(payload.events.flatMap(recordSources))].map(source=>sourceHash(source)));
  if(payload.events)entry.scopedReferences=await Promise.all([...new Set(payload.events.flatMap(event=>recordSources(event).map(source=>JSON.stringify([event.accountScope||'',source]))))].map(value=>sourceHash(value)));
  queue.push(entry);
  await metaWrite('captureQueue',queue);
}
export async function drainLocked(consume) {
  const keys=await metaGet('captureKeys'),queue=await metaGet('captureQueue') || [];
  if(!keys||!queue.length)return;
  const [jwk]=await unseal(keys.privateKey,await deviceKey());
  const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  for(const item of queue){
    const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},privateKey,decode(item.wrapped));
    const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
    const [payload]=await unseal(item.envelope,key);
    await consume(payload,item.at);
    // Commit consumer first: a retry can replay an event but never lose it.
    const current=await metaGet('captureQueue') || [];
    await metaWrite('captureQueue',current.filter(e=>e.id!==item.id));
    await metaWrite('captureCapacityReached',false);
  }
}

export async function queuedSource(source) {
 const hash=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))));
 return (await metaGet('captureQueue') || []).some(e=>e.sourceHash===hash);
}

export async function expireLockedCapture() {
 const settings=await lockedSettings();
 const cutoff=Date.now()-(settings.retentionDays===7?7:30)*86400000;
 const queue=await metaGet('captureQueue') || [];
 if(queue.some(e=>e.at<cutoff)){await metaWrite('captureQueue',queue.filter(e=>e.at>=cutoff));await metaWrite('captureCapacityReached',false);}
}

async function sourceHash(source){return base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))));}
export async function queuedReference(source,scopes){
 if(scopes){
  const hashes=await Promise.all(scopes.map(scope=>sourceHash(JSON.stringify([scope,source]))));
  return (await metaGet('captureQueue')||[]).some(e=>e.scopedReferences?.some(hash=>hashes.includes(hash)));
 }
 const hash=await sourceHash(source);
 return (await metaGet('captureQueue') || []).some(e=>e.references?.includes(hash));
}

// Expose operational status only; never disclose message content before unlock.
export async function lockedCaptureStatus(){
 const settings=await lockedSettings();
 const flags=await chrome.storage.session.get(['capture-blocked:zalo','capture-blocked:facebook']);
 const platforms=settings.platforms||['zalo','facebook'];
 return {enabled:!!(settings.consent&&settings.enabled),ready:!!await metaGet('captureKeys'),
   capacityReached:!!await metaGet('captureCapacityReached'),
   accountBlocked:platforms.some(p=>flags['capture-blocked:'+p])};
}
