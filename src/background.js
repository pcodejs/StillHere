import {SITE_ORIGINS,syncPlatformScripts} from './core/platform-access.js';
import {installedRelease} from './core/releases.js';
import {restorePending} from './core/restore-pending.js';
import {safeRules,conversationAllowed} from './core/conversation-rules.js';
import {diagnosticTabs,currentTabHealth,focusDiagnosticTab,openPlatformTab} from './core/diagnostics.js';
import {annotateRecord} from './core/annotations.js';
import {mergeArchive,readConversationJSON} from './core/archive-import.js';
import {prepareLockedCapture,lockedSettings,enqueueLocked,drainLocked,queuedSource,queuedReference,expireLockedCapture,lockedCaptureStatus} from './core/locked-capture.js';
import {createTabConnector} from './core/tab-connection.js';
import {platformFromUrl, recordPlatform} from './core/platforms.js';
import {preferencesMessage} from './core/preferences.js';
import {accountSession,accountChangeReason} from './core/account-session.js';
import {accountScope} from './core/account-scope.js';
import {documentScopeToken,resetDocumentScope,clearDocumentScopes} from './core/document-scope.js';
import {tabAccountKey,observedTabAccount,isIdentityEnrichment,resolveAccountAliases,recoverNameAccountAlias} from './core/tab-account.js';
async function currentAccountScope(platform,sender){
 const key=tabAccountKey(sender);
 const values=await chrome.storage.session.get(key);
 const token=await documentScopeToken(chrome.storage,key);
 return accountScope(platform,values[key],token);
}
async function accountUpgradeCandidate(platform,account,scope){
 if(platform!=='zalo'||!account?.id||!account.name)return null;
 return {platform,from:await accountScope(platform,{name:account.name}),scope,name:account.name};
}
import {DEFAULT_SETTINGS, normalizeEvent, applyEvents, cleanRecords, zaloMessageId, ADAPTER_VERSION} from './core/model.js';
import {loadState,saveState,vaultStatus,setupVault,unlockVault,lockVault,base64,exportPortable,importPortableBundle} from './core/vault.js';
import {commitBackup,collectBackupMedia} from './core/backup-media.js';
import {createBackupTransfers} from './core/backup-transfer.js';
const backupTransfers=createBackupTransfers();
import {cacheInventory,describeRecords,downloadResource,readResource,recordSources,retainResources,saveResource} from './core/assets.js';
import {resourceId,resourceSource,resourcePermissions,resourcePermissionDetails,sniffResource,MAX_RESOURCE_BYTES} from './core/resources.js';
let resourceEnabled=false;
let resourceGeneration=0;
let activeSources=new Set();
const resourceQueue=[];
const resourcePending=new Map();
const resourceRetry=new Map();
let resourceWorkers=0;
let lastResourceSchedule=0;

// Network work must not hold the serialized message queue (unlock, recall, health).
const lockedDownloads=new Set();
let capturePolicyEpoch=0;
function scheduleLockedDownloads(sources,platform){
  for(const source of sources){
    if(lockedDownloads.has(source)||lockedDownloads.size>=8)continue;
    lockedDownloads.add(source);
    const policyEpoch=capturePolicyEpoch;
    void (async()=>{
      if(await queuedSource(source))return;
      const bytes=await downloadResource(source);
      if(!sniffResource(bytes))return;
      await serial(async()=>{
        if(policyEpoch!==capturePolicyEpoch)return;
        const security=await vaultStatus();
        const state=security.unlocked?await read():null;
        const settings=state?.settings||await lockedSettings();
        if(!settings.consent||!settings.enabled||!settings.cacheMedia||!(settings.platforms||['zalo','facebook']).includes(platform))return;
        if((await chrome.storage.session.get('capture-blocked:'+platform))['capture-blocked:'+platform])return;
        if(state){
          if(state.records.some(r=>recordPlatform(r)===platform&&conversationAllowed(settings,r)&&recordSources(r).includes(source)))await saveResource(source,bytes);
        }else if(await queuedReference(source)&&!await queuedSource(source))await enqueueLocked({source,data:base64(bytes)});
      });
    })().catch(()=>{}).finally(()=>lockedDownloads.delete(source));
  }
}

function cancelResourceJobs() {
  resourceEnabled=false;
  resourceGeneration++;
  for(const job of resourcePending.values())job.controller.abort();
  resourceQueue.length=0;
  resourcePending.clear();
  resourceRetry.clear();
  activeSources.clear();
}

async function scheduleResources(records,settings,includeRecalled=false) {
  lastResourceSchedule=Date.now();
  const enabled=settings.consent&&settings.enabled&&settings.cacheMedia;
  if(!enabled){cancelResourceJobs();return;}
  resourceEnabled=true;
  records=records.filter(record=>(settings.platforms||['zalo','facebook']).includes(recordPlatform(record))&&conversationAllowed(settings,record));
  activeSources=new Set(records.flatMap(recordSources));
  const cached=new Set((await cacheInventory()).map(item=>item.id));
  for(const record of records){
    const sources=[record.senderAvatar,record.conversationAvatar,...(record.conversationAvatars||[])];
    if(includeRecalled||!record.recalledAt)sources.unshift(...(record.attachments||[]).map(item=>item.source));
    for(const source of sources){
      if(!resourceSource(source,false)||resourcePending.has(source)||cached.has(await resourceId(source)))continue;
      if(Date.now()-(resourceRetry.get(source)||0)<30000||resourceQueue.length>=80)continue;
      const job={source,generation:resourceGeneration,controller:new AbortController()};
      resourcePending.set(source,job);
      resourceQueue.push(job);
    }
  }
  drainResources();
}

function drainResources() {
  while(resourceWorkers<2&&resourceQueue.length){
    const job=resourceQueue.shift();
    resourceWorkers++;
    (async()=>{
      try {
        if(!resourceEnabled||!activeSources.has(job.source)||job.generation!==resourceGeneration)return;
        const bytes=await downloadResource(job.source,job.controller.signal);
        const isCurrent=()=>resourceEnabled&&activeSources.has(job.source)&&job.generation===resourceGeneration;
        if(isCurrent()){await saveResource(job.source,bytes,isCurrent);resourceRetry.delete(job.source);}
      } catch {
        if(resourceEnabled&&job.generation===resourceGeneration){
          resourceRetry.set(job.source,Date.now());
          while(resourceRetry.size>1500)resourceRetry.delete(resourceRetry.keys().next().value);
        }
      }
      finally {
        if(resourcePending.get(job.source)===job)resourcePending.delete(job.source);
        resourceWorkers--;drainResources();
      }
    })();
  }
}
let queue=Promise.resolve();
const serial = fn => {const next=queue.then(fn);queue=next.catch(()=>{});return next;};
async function read() {
  const state=await loadState(DEFAULT_SETTINGS);
  const {accountAliases}=await chrome.storage.session.get('accountAliases');
  const records=resolveAccountAliases(state.records,accountAliases);
  const entries=state.settings.conversationRules?.entries;
  const resolved=entries?resolveAccountAliases(entries,accountAliases):null;
  if(records.some((r,i)=>r!==state.records[i])||resolved?.some((r,i)=>r!==entries[i])){
    state.records=records;
    if(resolved)state.settings.conversationRules={...state.settings.conversationRules,entries:resolved.map(({accountName,...entry})=>entry)};
    await saveState(state);
  }
  return state;
}
const senderPlatform = s => s.id === chrome.runtime.id && s.frameId === 0 && Number.isInteger(s.tab?.id) ? platformFromUrl(s.url) : null;
const fromUI = s => {
  try { return s.id === chrome.runtime.id && new URL(s.url).protocol === 'chrome-extension:' && new URL(s.url).host === chrome.runtime.id && new URL(s.url).pathname === '/popup.html'; } catch { return false; }
};
async function stopResources() {
  cancelResourceJobs();
  await chrome.action.setBadgeText({text:''});
}
async function broadcast() {
  const registry=await chrome.storage.session.get(null);
  const registered=new Set(Object.values(registry).filter(h=>h && Number.isInteger(h.tabId)).map(h=>h.tabId));
  const tabs=(await chrome.tabs.query({})).filter(t=>registered.has(t.id));
  await Promise.allSettled(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'SETTINGS_CHANGED'})));
}
async function badge(records) {
  const count=records.filter(r=>r.recalledAt).length;
  await chrome.action.setBadgeBackgroundColor({color:'#0643d7'});
  await chrome.action.setBadgeText({text:count ? String(Math.min(count,999)) : ''});
}
async function init() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.alarms.create('retention',{periodInMinutes:60});
  await chrome.alarms.create('vault-expiry',{periodInMinutes:1});
  await chrome.alarms.create('tab-reconnect',{periodInMinutes:1});
}
const tabConnector = createTabConnector(chrome,async platform=>{const settings=await lockedSettings();return !!settings.consent&&(settings.platforms||['zalo','facebook']).includes(platform)&&await chrome.permissions.contains({origins:SITE_ORIGINS[platform]});});
let registration=Promise.resolve();
function reconnect(){registration=registration.catch(()=>{}).then(async()=>{await syncPlatformScripts(chrome,await lockedSettings());await tabConnector.sweep();});return registration;}
chrome.permissions.onAdded.addListener(()=>{void reconnect().catch(()=>{});});
chrome.permissions.onRemoved.addListener(()=>{void reconnect().catch(()=>{});void broadcast();});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.status === 'complete' || change.url || change.discarded === false || change.frozen === false) void tabConnector.connect(tab);
});
chrome.tabs.onActivated.addListener(({tabId})=>{void chrome.tabs.get(tabId).then(tab=>tabConnector.connect(tab)).catch(()=>{});});
chrome.runtime.onStartup.addListener(() => { void init(); void reconnect().catch(()=>{}); });
init().then(()=>reconnect()).catch(()=>{});
chrome.runtime.onInstalled.addListener(details=>{const notice=installedRelease(details,chrome.runtime.getManifest().version);if(notice)void chrome.storage.local.set({releaseNotice:notice});void init();void reconnect().catch(()=>{});if(details.reason==='install')void chrome.tabs.create({url:chrome.runtime.getURL('popup.html')});});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name==='tab-reconnect'){void reconnect().catch(()=>{});return;}
  if(alarm.name==='vault-expiry'){
    serial(async()=>{await expireLockedCapture();if(!(await vaultStatus()).unlocked){await stopResources();await broadcast();}}).catch(()=>{});
    return;
  }
  if(alarm.name!=='retention')return;
  serial(async()=>{if (!(await vaultStatus()).unlocked) { await stopResources(); await broadcast(); return; } await preferencesMessage({type:'DRAFT_EXPIRE'}); const d=await read();d.records=cleanRecords(d.records,d.settings);await saveState(d);await retainResources(new Set(d.records.flatMap(recordSources)));await badge(d.records);}).catch(()=>{});
});
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if (!m || typeof m.type!=='string') return;
  const platform=senderPlatform(s), content=!!platform, ui=fromUI(s);
  if (!content && !ui) return;
  serial(async()=>{
    if(content&&!await chrome.permissions.contains({origins:SITE_ORIGINS[platform]}))return {ok:false,settings:{enabled:false,consent:false}};
    let documentAccountChange;
    if(content&&m.type==='HEALTH'){
      const key=tabAccountKey(s),navigationKey='tab-last-account:'+platform+':'+s.tab.id;
      const identities=await chrome.storage.session.get([key,navigationKey]);
      const previous=identities[key];
      // Compare across navigation in this tab without assigning the old account
      // to the new document's messages before its identity is actually observed.
      documentAccountChange=accountSession(previous||identities[navigationKey],m.health);
      if(documentAccountChange.locked)await chrome.storage.session.set({['account-transition:'+platform]:{platform,reason:accountChangeReason(previous||identities[navigationKey],m.health),navigation:!previous,at:Date.now()}});
      const navigationAccount=observedTabAccount(identities[navigationKey],m.health);
      await chrome.storage.session.set({[navigationKey]:navigationAccount});
      const before=await currentAccountScope(platform,s),next=observedTabAccount(previous,m.health);
      await chrome.storage.session.set({[key]:next});
      if(m.health?.loggedOut===true||m.health?.accountChanging===true)await resetDocumentScope(chrome.storage,key);
      if(isIdentityEnrichment(previous,next)){
        const after=await currentAccountScope(platform,s);
        if(before!==after){
          const alias={from:before,scope:after,name:next.name||''};
          if(!(await vaultStatus()).unlocked&&(await lockedSettings()).enabled)await enqueueLocked({accountAlias:alias});
          const {accountAliases={}}=await chrome.storage.session.get('accountAliases');accountAliases[before]={scope:after,name:alias.name};await chrome.storage.session.set({accountAliases});
        }
      }
    }
    if(ui && m.type==='RUNTIME_INFO')return {version:__STILLHERE_BUILD_VERSION__,api:2};
    if (ui && ['LANGUAGE_READ', 'LANGUAGE_WRITE'].includes(m.type)) return preferencesMessage(m);
    if (ui && m.type === 'VAULT_STATUS') {
      const status = await vaultStatus();
      return {...status,capture:status.unlocked?undefined:await lockedCaptureStatus()};
    }
    if (ui && ['VAULT_SETUP','VAULT_UNLOCK','VAULT_LOCK'].includes(m.type)) {
      if (m.type === 'VAULT_SETUP') await setupVault(m.password, DEFAULT_SETTINGS, {preserveUnreadableLegacy:m.preserveUnreadableLegacy===true});
      if (m.type === 'VAULT_UNLOCK') await unlockVault(m.password);
      if (m.type === 'VAULT_LOCK') {backupTransfers.clear();await lockVault();}
      try {
      if (m.type !== 'VAULT_LOCK') {
        await prepareLockedCapture();
        await expireLockedCapture();
        for(const platform of ['zalo','facebook']){
          const pendingKey='pending-account:'+platform;
          const pending=(await chrome.storage.session.get(pendingKey))[pendingKey];
          if(pending)await chrome.storage.session.set({['active-account:'+platform]:pending});
          await chrome.storage.session.remove([pendingKey,'capture-blocked:'+platform]);
        }
        await drainLocked(restorePending);
      }
      } catch(error) { await lockVault(); await broadcast(); throw error; }
      await stopResources();
      await broadcast();
      return vaultStatus();
    }
    const security = await vaultStatus();
    if (!security.unlocked) {
      backupTransfers.clear();
      await stopResources();
      const settings=await lockedSettings();
      if(settings.conversationRules?.entries){
        const {accountAliases}=await chrome.storage.session.get('accountAliases');
        settings.conversationRules={...settings.conversationRules,entries:resolveAccountAliases(settings.conversationRules.entries,accountAliases)};
      }
      const allowed=content && settings.consent && settings.enabled && (settings.platforms||['zalo','facebook']).includes(platform);
      const accountKey='active-account:'+platform;
      const blockedKey='capture-blocked:'+platform;
      const blocked=(await chrome.storage.session.get(blockedKey))[blockedKey];
      if(content && m.type==='HEALTH'){
        const next=documentAccountChange;
        if(next.locked)await chrome.storage.session.set({[blockedKey]:true,['pending-account:'+platform]:next.pendingAccount});
        else if(next.account)await chrome.storage.session.set({[blocked?'pending-account:'+platform:accountKey]:next.account});
        return {ok:true};
      }
      if(content && m.type==='CONTENT_SETTINGS'){
        await chrome.storage.session.set({['health:'+s.tab.id]:{tabId:s.tab.id,platform,at:0,online:false}});
        return {settings:{...settings,enabled:!!allowed&&!blocked}};
      }
      if(allowed && !blocked && m.type==='CAPTURE' && Array.isArray(m.events)){
        const scope=await currentAccountScope(platform,s);
        const account=(await chrome.storage.session.get(tabAccountKey(s)))[tabAccountKey(s)];
        const events=m.events.slice(0,300).filter(e=>e&&typeof e==='object').map(e=>({...e,platform,accountScope:scope,accountName:account?.name||''}));
        if(JSON.stringify(events).length>2*1024*1024)return {ok:false};
        const normalized=events.map(e=>normalizeEvent(e)).filter(e=>e&&conversationAllowed(settings,e));
        if(!normalized.length)return {ok:true};
        await enqueueLocked({events:normalized,accountCandidate:await accountUpgradeCandidate(platform,account,scope)});
        if(settings.cacheMedia){
          const sources=[...new Set(normalized.flatMap(recordSources))].filter(source=>resourceSource(source,false)).slice(0,8);
          scheduleLockedDownloads(sources,platform);
        }
        return {ok:true};
      }
      if(allowed && !blocked && settings.cacheMedia && m.type==='MEDIA_INLINE'){
        const source=resourceSource(m.source,true,platform);
        if(!source.startsWith('blob:'+new URL(s.url).origin+'/')||typeof m.data!=='string'||m.data.length>Math.ceil(MAX_RESOURCE_BYTES/3)*4||!/^[A-Za-z0-9+/]+=*$/.test(m.data))return {ok:false};
        const scope=await currentAccountScope(platform,s);
        const {accountAliases={}}=await chrome.storage.session.get('accountAliases');
        const scopes=[scope,...Object.keys(accountAliases).filter(old=>resolveAccountAliases([{accountScope:old}],accountAliases)[0].accountScope===scope)];
        if(!await queuedReference(source,scopes))return {ok:false};
        if(!sniffResource(Uint8Array.from(atob(m.data),c=>c.charCodeAt(0))))return {ok:false};
        if(!await queuedSource(source))await enqueueLocked({source,data:m.data});
        return {ok:true};
      }
      return {error:'Tiện ích đang khoá. Hãy nhập mật khẩu để xem tin nhắn.'};
    }
    if (ui && ['UI_READ','UI_WRITE','DRAFT_WRITE','DRAFT_CLEAR'].includes(m.type)) return preferencesMessage(m);
    if(ui && m.type.startsWith('BACKUP_TRANSFER_')){
      const owner=s.documentId;
      if(!owner)throw Error('Missing backup document identity');
      if(m.type==='BACKUP_TRANSFER_BEGIN')return {token:backupTransfers.begin(owner,m.size)};
      if(m.type==='BACKUP_TRANSFER_CHUNK')return {received:backupTransfers.append(m.token,owner,m.index,m.part)};
      if(m.type==='BACKUP_TRANSFER_READ')return {part:backupTransfers.read(m.token,owner,m.offset)};
      if(m.type==='BACKUP_TRANSFER_CANCEL'){backupTransfers.cancel(m.token,owner);return {ok:true};}
      if(m.type==='BACKUP_TRANSFER_COMMIT'){
        const backup=JSON.parse(backupTransfers.finish(m.token,owner));
        if(backup?.algorithm!=='AES-256-GCM')throw Error('Encrypted backup required');
        m={type:'BACKUP_IMPORT',backup,password:m.password};
      }
    }
    const d=await read();
    if(ui && m.type==='CONVERSATION_RULES'){
      d.settings.conversationRules=safeRules(m.rules);
      capturePolicyEpoch++;
      await saveState(d);cancelResourceJobs();await broadcast();return {ok:true};
    }
    if(ui && m.type==='ANNOTATE'){
      d.records=annotateRecord(d.records,m.recordId,{note:m.note,pinned:m.pinned});
      await saveState(d);return {ok:true};
    }
    if(ui && m.type==='MEDIA_RETRY'){
      if(!d.settings.consent||!d.settings.enabled||!d.settings.cacheMedia)return {ok:false};
      resourceRetry.clear();await scheduleResources(d.records,d.settings,true);
      return {ok:true,pending:resourcePending.size};
    }
    if(ui&&m.type==='FOCUS_CHAT_TAB')return focusDiagnosticTab(chrome,m.tabId,m.platform);
    if(ui&&m.type==='OPEN_PLATFORM_TAB')return openPlatformTab(chrome,m.platform);
    if(ui&&m.type==='RECONNECT_TABS'){await reconnect();return {ok:true};}
    if(ui && m.type==='DIAGNOSTICS'){
      const registry=await chrome.storage.session.get(null);
      return {accountTransitions:Object.entries(registry).filter(([key])=>key.startsWith('account-transition:')).map(([,value])=>value),tabs:diagnosticTabs(await chrome.tabs.query({}),Object.values(registry),d.settings),saving:!!(d.settings.consent&&d.settings.enabled),mediaEnabled:!!d.settings.cacheMedia,mediaQueue:{queued:resourceQueue.length,active:Math.max(0,resourcePending.size-resourceQueue.length),failed:resourceRetry.size,locked:lockedDownloads.size}};
    }
    if(ui && m.type==='BACKUP_EXPORT')return {backup:await exportPortable(d.records,m.password)};
    if(ui && m.type==='BACKUP_EXPORT_MEDIA'){
      if(!s.documentId)throw Error('Missing backup document identity');
      const media=await collectBackupMedia(d.records);
      const backup=await exportPortable(d.records,m.password,media);
      if(!(await vaultStatus()).unlocked)throw Error('Backup session expired');
      return backupTransfers.offer(s.documentId,JSON.stringify(backup));
    }
    if(ui && m.type==='BACKUP_IMPORT'){
      const incoming=m.backup?.format==='stillhere-conversation'?{records:readConversationJSON(m.backup),media:[]}:await importPortableBundle(m.backup,m.password);
      const restored={...d,records:mergeArchive(d.records,incoming.records)};
      await commitBackup(restored,incoming.media);
      await badge(restored.records); await broadcast(); return {ok:true,count:restored.records.length};
    }
    if (m.type==='CONTENT_SETTINGS' && content) {
      await chrome.storage.session.set({['health:'+s.tab.id]:{tabId:s.tab.id,platform,at:0,online:false,matched:0}});
      resourceEnabled=d.settings.consent&&d.settings.enabled&&d.settings.cacheMedia;
      return {settings:{...d.settings,enabled:d.settings.enabled&&(d.settings.platforms||['zalo','facebook']).includes(platform)}};
    }
    if(content && !(d.settings.platforms||['zalo','facebook']).includes(platform))return {ok:false};
    if(content && ['INLINE_READ','INLINE_ASSET'].includes(m.type)) {
      if(!d.settings.consent||!d.settings.enabled)return {ok:false};
      const scope=await currentAccountScope(platform,s);
      const messageId=platform==='zalo'?zaloMessageId(m.messageId):m.messageId;
      const record=d.records.find(r=>recordPlatform(r)===platform&&r.accountScope===scope&&r.conversationId===m.conversationId&&(platform==='zalo'?zaloMessageId(r.messageId):r.messageId)===messageId&&r.recalledAt&&r.hasOriginal);
      if(m.type==='INLINE_ASSET'){const source=record?.attachments?.[0]?.source;return {asset:source?await readResource(source):null};}
      const prefs=await preferencesMessage({type:'LANGUAGE_READ'});
      if(!record)return {record:null,language:prefs.language};
      const described=await describeRecords([record]);
      const attachment=described.records[0].attachments?.[0];
      const attachmentStatus=attachment ? (attachment.cached ? (attachment.previewOnly?'preview':'saved'):'missing'):'none';
      return {record:{text:record.text,hasAttachment:!!attachment,attachmentStatus},language:prefs.language};
    }
    if(content && m.type==='INLINE_OPEN'){await chrome.tabs.create({url:chrome.runtime.getURL('popup.html?platform='+platform)});return {ok:true};}
    if (m.type === 'HEALTH' && content) {
      const key = 'active-account:' + platform;
      const next=documentAccountChange;
      if (next.locked) {
        await chrome.storage.session.set({['capture-blocked:'+platform]:true,['pending-account:'+platform]:next.pendingAccount});
        await lockVault();
        await stopResources();
        await chrome.storage.session.remove(key);
        await broadcast();
        return {ok:false,locked:true};
      }
      if (next.account) await chrome.storage.session.set({[key]:next.account});
    }
    if (m.type==='CAPTURE' && content) {
      if(!Array.isArray(m.events))return {ok:false};
      const scope=await currentAccountScope(platform,s);
      const account=(await chrome.storage.session.get(tabAccountKey(s)))[tabAccountKey(s)];
      const events=m.events.slice(0,300).filter(event=>event&&typeof event==='object').map(event=>normalizeEvent({...event,platform,accountScope:scope,accountName:account?.name||''})).filter(Boolean);
      const alias=recoverNameAccountAlias(d.records,events,await accountUpgradeCandidate(platform,account,scope));
      if(alias){
        const {accountAliases={}}=await chrome.storage.session.get('accountAliases');
        accountAliases[alias.from]={scope:alias.scope,name:alias.name};
        await chrome.storage.session.set({accountAliases});
        const linked=await read();d.records=linked.records;d.settings=linked.settings;
      }
      d.records=applyEvents(d.records,events,d.settings);
      await saveState(d); await badge(d.records);
      await scheduleResources(d.records,d.settings);
      return {ok:true};
    }
    if(m.type==='MEDIA_INLINE'&&content&&d.settings.consent&&d.settings.enabled&&d.settings.cacheMedia){
      const source=resourceSource(m.source,true,platform);
      if(platform==='facebook' && !source.startsWith('blob:'+new URL(s.url).origin+'/'))return {ok:false};
      const scope=await currentAccountScope(platform,s);
      const known=d.records.some(record=>recordPlatform(record)===platform&&record.accountScope===scope&&conversationAllowed(d.settings,record)&&(record.attachments||[]).some(item=>item.source===source));
      if(!known||!source.startsWith('blob:')||typeof m.data!=='string'||m.data.length>Math.ceil(MAX_RESOURCE_BYTES/3)*4)return {ok:false};
      if(!/^[A-Za-z0-9+/]+=*$/.test(m.data))return {ok:false};
      const bytes=Uint8Array.from(atob(m.data),char=>char.charCodeAt(0));
      await saveResource(source,bytes);
      return {ok:true};
    }
    if (m.type==='HEALTH' && content && d.settings.enabled && d.settings.consent) {
      await chrome.storage.session.set({['health:'+s.tab.id]:{tabId:s.tab.id,platform,at:Date.now(),online:m.health?.online===true,matched:Math.max(0,Number(m.health?.matched)||0),accountName:typeof m.health?.accountName==='string'?m.health.accountName.replace(/[\u0000-\u001f]/g,'').slice(0,100):'',adapter:platform==='facebook'?'messenger-dom-2026-11-12':ADAPTER_VERSION}});
      if(d.settings.cacheMedia&&Date.now()-lastResourceSchedule>30000)await scheduleResources(d.records,d.settings);
      return {ok:true};
    }
    if(!ui)return {ok:false};
    if(m.type==='STATE') {
      const kept=cleanRecords(d.records,d.settings);
      if(kept.length!==d.records.length || kept.some((record,index)=>record.messageId!==d.records[index]?.messageId)){d.records=kept;await saveState(d);await retainResources(new Set(d.records.flatMap(recordSources)));}
      await badge(d.records);
      const health=await chrome.storage.session.get(null);
      const tabs=await chrome.tabs.query({});
      const entries=currentTabHealth(tabs,Object.values(health));
      const described=await describeRecords(d.records);
      for (const record of described.records) {
        for (const attachment of record.attachments || []) {
          attachment.pending = !attachment.cached && resourcePending.has(attachment.source);
        }
      }
      const healthEntries=entries.map(h=>{
        const tab=tabs.find(t=>t.id===h.tabId);
        return {...h,fresh:Date.now()-h.at<16000,background:tab?.active===false,unavailable:tab?.discarded===true||tab?.frozen===true};
      });
      const permissionDetails=await resourcePermissionDetails(value=>chrome.permissions.contains(value));
      const permissions=Object.fromEntries(Object.entries(permissionDetails).map(([key,value])=>[key,value.available]));
      const completePermissions=Object.fromEntries(Object.entries(permissionDetails).map(([key,value])=>[key,value.complete]));
      const sitePermissions=Object.fromEntries(await Promise.all(Object.entries(SITE_ORIGINS).map(async([p,origins])=>[p,await chrome.permissions.contains({origins})])));
      return {...d,...described,sitePermissions,resourcePermission:Object.values(permissions).some(Boolean),resourcePermissions:permissions,resourcePermissionsComplete:completePermissions,health:healthEntries,tabs:entries.length,tabsByPlatform:{zalo:entries.filter(h=>(h.platform||'zalo')==='zalo').length,facebook:entries.filter(h=>h.platform==='facebook').length},bytes:await chrome.storage.local.getBytesInUse(null)};
    }
    if(m.type==='ASSET'){
      const record=d.records.find(item=>item.id===m.recordId);
      if(!record)return {ok:false};
      const source=m.role==='sender'?record.senderAvatar:m.role==='conversation'?record.conversationAvatar:m.role==='conversation-part'&&Number.isInteger(m.index)&&m.index>=0&&m.index<2?record.conversationAvatars?.[m.index]:m.role==='attachment'?record.attachments?.[m.index]?.source:null;
      if(!source)return {ok:false};
      return {asset:await readResource(source)};
    }
    if(m.type==='SETTINGS') {
      capturePolicyEpoch++;
      const cacheMedia=m.cacheMedia===undefined?d.settings.cacheMedia:m.cacheMedia===true&&Object.values(await resourcePermissions(value=>chrome.permissions.contains(value))).some(Boolean);
      d.settings={conversationRules:d.settings.conversationRules,consent:m.consent===true || d.settings.consent,enabled:m.enabled===true,retentionDays:m.retentionDays===7?7:30,cacheMedia,platforms:Array.isArray(m.platforms)&&m.platforms.some(p=>['zalo','facebook'].includes(p))?[...new Set(m.platforms.filter(p=>['zalo','facebook'].includes(p)))]:d.settings.platforms||['zalo','facebook']};
      if(!d.settings.consent)d.settings.enabled=false;
      d.records=cleanRecords(d.records,d.settings);
      await saveState(d);await reconnect();await scheduleResources(d.records,d.settings);await broadcast();return {ok:true};
    }
    if(m.type==='CLEAR') {
      capturePolicyEpoch++;
      // Clearing also turns collection off, so visible messages are not silently captured again.
      await saveState({records:[],settings:{...d.settings,enabled:false}});
      await clearDocumentScopes(chrome.storage);
      cancelResourceJobs();
      await retainResources(new Set());
      await badge([]);await broadcast();return {ok:true};
    }
    return {ok:false};
  }).then(reply).catch(error => {
    const vaultRequest = ui && ['VAULT_SETUP', 'VAULT_UNLOCK'].includes(m.type);
    if (vaultRequest && error?.code === 'LEGACY_KEY_MISSING') {
      reply({error:error.message, code:error.code});
      return;
    }
    const knownMessages = new Map([
      ['Mật khẩu cần từ 6 đến 256 ký tự.', 'PASSWORD_LENGTH'],
      ['Mật khẩu chưa đúng hoặc không thể đọc dữ liệu đã lưu.', 'PASSWORD_INVALID'],
      ['Bạn đã tạo mật khẩu. Hãy nhập mật khẩu để tiếp tục.', 'PASSWORD_EXISTS'],
      ['Hãy tạo mật khẩu để bảo vệ tin nhắn.', 'PASSWORD_REQUIRED'],
    ]);
    const message = vaultRequest
      ? knownMessages.has(error?.message) ? error.message : 'Chưa thể chuyển dữ liệu cũ. Dữ liệu vẫn được giữ trên máy. Hãy mở lại tiện ích để kiểm tra.'
      : 'Không thể đọc hoặc lưu dữ liệu. Hãy kiểm tra tiện ích đã mở khoá chưa và dung lượng Chrome.';
    reply({error:message, code:knownMessages.get(error?.message) || (m.type === 'VAULT_SETUP' ? 'VAULT_SETUP_FAILED' : 'STORAGE_ERROR')});
  });
  return true;
});
