import {platformFromUrl, PLATFORMS} from './platforms.js';
// A tab ID survives navigation. Never reuse another platform's heartbeat.
export function currentTabHealth(tabs, health) {
 return health.filter(h => h && Number.isInteger(h.tabId) &&
  tabs.some(tab => tab.id === h.tabId && platformFromUrl(tab.url) === h.platform));
}
export function diagnosticTabs(tabs,health,settings,now=Date.now()){
 const current = currentTabHealth(tabs, health);
 return tabs.flatMap(tab=>{
  const platform=platformFromUrl(tab.url);if(!platform)return [];
  const h=current.find(value=>value?.tabId===tab.id);
  const enabled=settings.consent&&settings.enabled&&(settings.platforms||['zalo','facebook']).includes(platform);
  const status=!enabled?'paused':tab.discarded||tab.frozen?'suspended':!h?.at?'waiting':now-h.at>16000?'stale':!h.online?'offline':h.matched>0?'live':'connected';
  return [{tabId:tab.id,platform,host:new URL(tab.url).hostname,accountName:typeof h?.accountName==='string'?h.accountName.slice(0,100):'',status,lastSeen:h?.at||null,background:tab.active===false}];
 });
}

export async function focusDiagnosticTab(api, tabId, platform) {
 if (!Number.isInteger(tabId)) return {ok:false};
 try {
  const tab=await api.tabs.get(tabId);
  if (!platformFromUrl(tab.url) || platformFromUrl(tab.url)!==platform) return {ok:false};
  await api.tabs.update(tabId,{active:true});
  await api.windows.update(tab.windowId,{focused:true});
  return {ok:true};
 } catch { return {ok:false}; }
}

export async function openPlatformTab(api, platform) {
 if (!Object.hasOwn(PLATFORMS, platform)) return {ok:false};
 try {
  const tabs=(await api.tabs.query({})).filter(tab=>platformFromUrl(tab.url)===platform);
  tabs.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));
  for (const tab of tabs) {
   const result=await focusDiagnosticTab(api,tab.id,platform);
   if(result.ok)return result;
  }
  await api.tabs.create({url:PLATFORMS[platform].home});
  return {ok:true};
 } catch { return {ok:false}; }
}
