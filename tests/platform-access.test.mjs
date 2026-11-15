import test from 'node:test';import assert from 'node:assert/strict';import {selectedOrigins,SITE_ORIGINS,syncPlatformScripts} from '../src/core/platform-access.js';
test('platform choice asks only for selected site and its CDN origins',()=>{
 assert(selectedOrigins(['zalo']).every(o=>!o.includes('facebook')&&!o.includes('messenger')&&!o.includes('fbcdn')));
 assert(selectedOrigins(['facebook']).every(o=>!o.includes('zalo')&&!o.includes('zadn')&&!o.includes('zdn')));
 assert.equal(selectedOrigins(['zalo','facebook']).length,13);assert.deepEqual(selectedOrigins(['zalo'],false),SITE_ORIGINS.zalo);
});
test('registration respects consent, grants and selection; switching unregisters old platform',async()=>{
 let registered=[],granted=['zalo'];const api={permissions:{contains:async({origins})=>granted.some(p=>SITE_ORIGINS[p]===origins)},scripting:{getRegisteredContentScripts:async()=>registered,registerContentScripts:async rows=>registered.push(...rows),unregisterContentScripts:async({ids})=>{registered=registered.filter(r=>!ids.includes(r.id));}}};
 await syncPlatformScripts(api,{consent:false,platforms:['zalo','facebook']});assert.equal(registered.length,0);
 await syncPlatformScripts(api,{consent:true,platforms:['zalo','facebook']});assert.equal(registered.length,2);
 granted=['facebook'];await syncPlatformScripts(api,{consent:true,platforms:['facebook']});assert.deepEqual(registered.map(r=>r.id),['stillhere-facebook-reader']);
 granted=[];await syncPlatformScripts(api,{consent:true,platforms:['facebook']});assert.equal(registered.length,0);
});
