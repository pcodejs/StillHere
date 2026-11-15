import {decodeBase64} from './base64.js';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const SESSION = 'vaultUnlock';
const ITERATIONS = 600000;
export function base64(value) {
  let result = '';
  for (let i = 0; i < value.length; i += 8192) result += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(result);
}
const bytes = decodeBase64;
export async function seal(records, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:encoder.encode('go-lai-archive-v1')}, key, encoder.encode(JSON.stringify(records)));
  return {version:1, algorithm:'AES-256-GCM', iv:base64(iv), data:base64(new Uint8Array(cipher))};
}
export async function unseal(vault, key) {
  if (vault?.version !== 1 || vault.algorithm !== 'AES-256-GCM') throw Error('Unsupported archive');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes(vault.iv), additionalData:encoder.encode('go-lai-archive-v1')}, key, bytes(vault.data));
  const records = JSON.parse(decoder.decode(plain));
  if (!Array.isArray(records)) throw Error('Invalid archive');
  return records;
}
function openDatabase(name, stores) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      for (const store of stores) request.result.createObjectStore(store, store === 'assets' ? {keyPath:'id'} : undefined);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function openProtectedDatabase() {
  return openDatabase('fsub-password-vault', ['meta','assets']);
}
async function transact(db, store, mode, operation) {
  return new Promise((resolve,reject) => {
    const tx=db.transaction(store,mode);
    let value;
    operation(tx.objectStore(store), result => {value=result;});
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error || Error('Vault transaction aborted'));
  });
}
export async function metaGet(key) {
  const db=await openProtectedDatabase();
  try {return await transact(db,'meta','readonly',(store,done)=>{const r=store.get(key);r.onsuccess=()=>done(r.result);});}
  finally {db.close();}
}
export async function metaWrite(key,value) {
  const db=await openProtectedDatabase();
  try {await transact(db,'meta','readwrite',store=>{if(value===undefined)store.delete(key);else store.put(value,key);});}
  finally {db.close();}
}
export async function derivePasswordKey(password,salt,extractable=false) {
  if(typeof password!=='string'||password.length<6||password.length>256)throw Error('Mật khẩu cần từ 6 đến 256 ký tự.');
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},extractable,['encrypt','decrypt']);
}
async function sessionFor(config) {
  const session=(await chrome.storage.session.get(SESSION))[SESSION];
  if(!session||session.id!==config?.id) {
    await chrome.storage.session.remove(SESSION);
    return null;
  }
  return session;
}
export async function vaultStatus() {
  const config=await metaGet('config');
  let legacyIssue;
  if (!config) {
    const old = await chrome.storage.local.get(['vault', 'feedbackDraft']);
    if ((old.vault || old.feedbackDraft) && !await oldRead('go-lai-device-vault', 'keys', 'archive')) {
      legacyIssue = 'missing-key';
    }
  }
  return {configured:!!config,unlocked:!!(config&&await sessionFor(config)),sessionLifetime:'browser',legacyIssue};
}
export async function deviceKey() {
  const config=await metaGet('config');
  const session=config&&await sessionFor(config);
  if(!session)throw Error('VAULT_LOCKED');
  return crypto.subtle.importKey('raw',bytes(session.key),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function lockVault() {
  await chrome.storage.session.remove(SESSION);
  return vaultStatus();
}
async function rememberKey(config,key) {
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.session.set({[SESSION]:{id:config.id,key:base64(new Uint8Array(await crypto.subtle.exportKey('raw',key)))}});
}
async function oldRead(name,store,key) {
  const db=await openDatabase(name,[store]);
  try {if(!db.objectStoreNames.contains(store))return key===undefined?[]:undefined;return await transact(db,store,'readonly',(s,done)=>{const r=key===undefined?s.getAll():s.get(key);r.onsuccess=()=>done(r.result);});}
  finally {db.close();}
}
async function clearOldStore(name,store) {
  const db=await openDatabase(name,[store]);
  try {if(db.objectStoreNames.contains(store))await transact(db,store,'readwrite',s=>s.clear());}finally {db.close();}
}
async function cleanupLegacy() {
  // New state is committed before any legacy data or key is removed.
  await chrome.storage.local.remove(['vault','records','feedbackDraft']);
  await clearOldStore('go-lai-resource-cache','assets');
  await clearOldStore('go-lai-device-vault','keys');
  await metaWrite('cleanupComplete',true);
}
async function migrateDraft(envelope,oldKey,newKey) {
  if(!envelope)return undefined;
  const aad=encoder.encode('fsub-feedback-draft-v1');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:aad},oldKey,bytes(envelope.data));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},newKey,plain);
  return {...envelope,iv:base64(iv),data:base64(new Uint8Array(data))};
}
export async function setupVault(password,defaultSettings={},options={}) {
  if(await metaGet('config'))throw Error('Bạn đã tạo mật khẩu. Hãy nhập mật khẩu để tiếp tục.');
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await derivePasswordKey(password,salt,true);
  const old=await chrome.storage.local.get(['vault','records','settings','feedbackDraft']);
  const oldKey=await oldRead('go-lai-device-vault','keys','archive');
  const assets=await oldRead('go-lai-resource-cache','assets');
  const missingLegacyKey = !oldKey && !!(old.vault || old.feedbackDraft || assets.length);
  if (missingLegacyKey && options.preserveUnreadableLegacy !== true) {
    const error = Error('Dữ liệu cũ thiếu khoá giải mã. Chọn giữ bản sao dữ liệu cũ để tiếp tục.');
    error.code = 'LEGACY_KEY_MISSING';
    throw error;
  }
  const records = old.vault && !missingLegacyKey
    ? await unseal(old.vault, oldKey)
    : Array.isArray(old.records) ? old.records : [];
  const draft = missingLegacyKey ? undefined : await migrateDraft(old.feedbackDraft,oldKey,key);
  let recovery;
  if (missingLegacyKey) {
    // Preserve every old envelope and file byte before replacing its storage.
    // The new password encrypts this snapshot even though its old contents remain unreadable.
    recovery = await seal([{
      version: 1,
      reason: 'missing-legacy-key',
      savedAt: Date.now(),
      local: old,
      assets: assets.map(asset => ({
        ...asset,
        iv: base64(new Uint8Array(asset.iv)),
        data: base64(new Uint8Array(asset.data)),
      })),
    }], key);
  }
  const state={settings:{...defaultSettings,...old.settings},vault:await seal(records,key)};
  const config={version:1,id:crypto.randomUUID(),salt:base64(salt),iterations:ITERATIONS,verifier:await seal(['fsub-password-check-v1'],key)};
  const db=await openProtectedDatabase();
  try {
    // Staged files are inaccessible until config and state commit together.
    await transact(db,'assets','readwrite',store=>store.clear());
    for(const asset of missingLegacyKey ? [] : assets) {
      const aad=encoder.encode('go-lai-resource-v1:'+asset.id);
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:asset.iv,additionalData:aad},oldKey,asset.data);
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plain);
      await transact(db,'assets','readwrite',store=>store.put({...asset,iv,data}));
    }
    await transact(db,'meta','readwrite',store=>{
      store.put(state,'state');store.put(config,'config');
      if(draft)store.put(draft,'draft');
      if(recovery)store.put(recovery,'legacyRecovery');
    });
  } finally {db.close();}
  await cleanupLegacy();
  await rememberKey(config,key);
  return vaultStatus();
}
export async function unlockVault(password) {
  const config=await metaGet('config');
  if(!config)throw Error('Hãy tạo mật khẩu để bảo vệ tin nhắn.');
  const key=await derivePasswordKey(password,bytes(config.salt),true);
  try {
    const check=await unseal(config.verifier,key);
    if(check[0]!=='fsub-password-check-v1')throw Error('Invalid verifier');
  } catch {throw Error('Mật khẩu chưa đúng hoặc không thể đọc dữ liệu đã lưu.');}
  if(!await metaGet('cleanupComplete'))await cleanupLegacy();
  await rememberKey(config,key);
  return vaultStatus();
}
export async function saveState(state) {
  const vault=await seal(state.records,await deviceKey());
  await metaWrite('state',{settings:state.settings,vault});
}
export async function loadState(defaultSettings) {
  const key=await deviceKey(),data=await metaGet('state');
  return {settings:{...defaultSettings,...data?.settings},records:data?.vault?await unseal(data.vault,key):[]};
}
export async function readDraftEnvelope() {await deviceKey();return metaGet('draft');}
export async function writeDraftEnvelope(value) {await deviceKey();await metaWrite('draft',value);}
export async function clearDraftEnvelope() {await deviceKey();await metaWrite('draft',undefined);}

// Includes base64 media plus encryption overhead for the 100 MiB media cache.
export const MAX_PORTABLE_BYTES=200*1024*1024;
export async function exportPortable(records,password,media){
 if(!Array.isArray(records)||(media!==undefined&&!Array.isArray(media)))throw Error('Invalid backup');
 const payload={version:media===undefined?1:2,exportedAt:Date.now(),records,...(media===undefined?{}:{media})};
 if(encoder.encode(JSON.stringify(payload)).length>Math.floor((MAX_PORTABLE_BYTES-4096)*3/4))throw Error('Backup capacity exceeded');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await derivePasswordKey(password,salt,true);
 const envelope=await seal([payload],key);
 return {version:1,algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA-256',iterations:ITERATIONS,salt:base64(salt),envelope};
}
export async function importPortableBundle(file,password){
 if(!file||JSON.stringify(file).length>MAX_PORTABLE_BYTES||file.iterations!==ITERATIONS||typeof file.salt!=='string'||bytes(file.salt).length!==16||file.version!==1||file.algorithm!=='AES-256-GCM'||file.kdf!=='PBKDF2-SHA-256')throw Error('Invalid backup');
 const key=await derivePasswordKey(password,bytes(file.salt),true);
 const items=await unseal(file.envelope,key),payload=items[0];
 if(items.length!==1||!payload||![1,2].includes(payload.version)||!Array.isArray(payload.records)||(payload.version===2&&!Array.isArray(payload.media)))throw Error('Invalid backup');
 return {records:payload.records,media:payload.version===2?payload.media:[]};
}
export async function importPortable(file,password){
 const payload=await importPortableBundle(file,password);
 return payload.records;
}
