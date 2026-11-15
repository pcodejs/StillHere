import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticTabs,currentTabHealth} from '../src/core/diagnostics.js';
test('diagnostics includes unregistered supported tabs and separates suspended stale and live',()=>{
 const tabs=[{id:1,url:'https://chat.zalo.me/',active:true},{id:2,url:'https://www.facebook.com/messages/',frozen:true},{id:3,url:'https://www.messenger.com/',active:false},{id:4,url:'https://example.com/'}];
 const settings={consent:true,enabled:true};
 assert.deepEqual(diagnosticTabs(tabs,[{tabId:1,platform:'zalo',at:30000,online:true,matched:2},{tabId:3,platform:'facebook',at:1,online:true}],settings,40000).map(t=>t.status),['live','suspended','stale']);
 assert.equal(diagnosticTabs([tabs[0]],[],settings)[0].status,'waiting');
 assert.equal(diagnosticTabs([tabs[0]],[],{...settings,enabled:false})[0].status,'paused');
 const result=diagnosticTabs([{...tabs[0],url:'https://chat.zalo.me/?private=secret'}],[{tabId:1,platform:'zalo',accountName:'PRIVATE',at:30000}],settings,40000);
 assert.equal(result[0].host,'chat.zalo.me');assert.equal(result[0].accountName,'PRIVATE');assert(!JSON.stringify(result).includes('secret'));
});

test('navigation drops old-platform heartbeats and excludes closed or unrelated tabs',()=>{
 const old={tabId:10,platform:'zalo',at:100,online:true,matched:2,accountName:'Old account'};
 const tabs=[{id:10,url:'https://www.facebook.com/messages/'}];
 assert.deepEqual(currentTabHealth(tabs,[old]),[]);
 const row=diagnosticTabs(tabs,[old],{consent:true,enabled:true},101)[0];
 assert.equal(row.status,'waiting');assert.equal(row.accountName,'');assert.equal(row.lastSeen,null);
 assert.deepEqual(currentTabHealth([{id:10,url:'https://example.com/'}],[old]),[]);
 assert.deepEqual(currentTabHealth([],[old]),[]);
 assert.deepEqual(currentTabHealth([{id:10,url:'https://chat.zalo.me/'}],[old]),[old]);
});

test('focus returns to the exact supported tab, refusing navigation and closed tabs',async()=>{
 const {focusDiagnosticTab}=await import('../src/core/diagnostics.js');const calls=[];
 const api={tabs:{get:async()=>({url:'https://web.facebook.com/messages/t/123',windowId:7}),update:async(...args)=>calls.push(args)},windows:{update:async(...args)=>calls.push(args)}};
 assert.deepEqual(await focusDiagnosticTab(api,42,'facebook'),{ok:true});assert.deepEqual(calls,[[42,{active:true}],[7,{focused:true}]]);
 calls.length=0;api.tabs.get=async()=>({url:'https://example.com',windowId:7});assert.deepEqual(await focusDiagnosticTab(api,42,'facebook'),{ok:false});assert.equal(calls.length,0);
 api.tabs.get=async()=>{throw Error('closed');};assert.deepEqual(await focusDiagnosticTab(api,42,'facebook'),{ok:false});
});

test('open platform reuses latest supported tab and creates only when none remains',async()=>{
 const {openPlatformTab}=await import('../src/core/diagnostics.js');const calls=[];
 const tabs=[{id:1,url:'https://chat.zalo.me/',lastAccessed:1},{id:2,url:'https://chat.zalo.me/',lastAccessed:9}];
 const api={tabs:{query:async()=>tabs,get:async id=>({...tabs.find(t=>t.id===id),windowId:7}),update:async id=>calls.push(['focus',id]),create:async value=>calls.push(['create',value])},windows:{update:async()=>{}}};
 assert.deepEqual(await openPlatformTab(api,'zalo'),{ok:true});assert.deepEqual(calls,[['focus',2]]);
 calls.length=0;api.tabs.get=async()=>({url:'https://example.com/',windowId:7});
 assert.deepEqual(await openPlatformTab(api,'zalo'),{ok:true});assert.deepEqual(calls,[['create',{url:'https://chat.zalo.me/'}]]);
 calls.length=0;assert.deepEqual(await openPlatformTab(api,'unknown'),{ok:false});assert.equal(calls.length,0);
 api.tabs.query=async()=>{throw Error('unavailable');};assert.deepEqual(await openPlatformTab(api,'zalo'),{ok:false});assert.equal(calls.length,0);
});
