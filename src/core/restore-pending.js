import {loadState,saveState} from './vault.js';
import {resolveAccountAliases,recoverNameAccountAlias} from './tab-account.js';
import {applyEvents,DEFAULT_SETTINGS} from './model.js';
import {recordSources,saveResource} from './assets.js';
export async function restorePending(payload,at){
 const {accountAliases={}}=await chrome.storage.session.get('accountAliases');
 if(payload.accountAlias){
  const alias=payload.accountAlias;
  if(!/^[a-f0-9]{64}$/.test(alias.from)||!/^[a-f0-9]{64}$/.test(alias.scope))throw Error('Invalid account linkage');
  accountAliases[alias.from]={scope:alias.scope,name:typeof alias.name==='string'?alias.name.slice(0,100):''};
  await chrome.storage.session.set({accountAliases});
 }
 const state=await loadState(DEFAULT_SETTINGS);
 const recovered=recoverNameAccountAlias(state.records,payload.events||[],payload.accountCandidate);
 if(recovered){
  accountAliases[recovered.from]={scope:recovered.scope,name:recovered.name};
  await chrome.storage.session.set({accountAliases});
 }
 state.records=resolveAccountAliases(state.records,accountAliases);
 if(state.settings.conversationRules?.entries)state.settings.conversationRules={...state.settings.conversationRules,entries:resolveAccountAliases(state.settings.conversationRules.entries,accountAliases).map(({accountName,...entry})=>entry)};
 if(payload.events)state.records=applyEvents(state.records,resolveAccountAliases(payload.events,accountAliases),state.settings,at);
 await saveState(state);
 if(payload.source&&payload.data&&state.records.some(r=>recordSources(r).includes(payload.source)))await saveResource(payload.source,Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0)));
}
