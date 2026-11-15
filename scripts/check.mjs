import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='outputs/go-lai-extension';
const manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(manifest.permissions,['storage','alarms','scripting']);
assert.deepEqual(manifest.host_permissions||[],[]);
assert.equal(manifest.content_scripts,undefined);
const {SITE_ORIGINS,selectedOrigins,platformScripts}=await import('../src/core/platform-access.js');
assert.deepEqual(new Set(manifest.optional_host_permissions),new Set(selectedOrigins(['zalo','facebook'])));
for(const platform of ['zalo','facebook'])for(const script of platformScripts(platform)){
 assert.deepEqual(script.matches,SITE_ORIGINS[platform]);assert.equal(script.runAt,'document_start');for(const f of script.js)await readFile(dir+'/'+f);
}
for(const f of await readdir(dir)){
 if(!f.endsWith('.js'))continue;
 const source=await readFile(dir+'/'+f,'utf8');
 assert(!/\beval\s*\(|new Function\s*\(|new WebSocket\s*\(|XMLHttpRequest|sendBeacon\s*\(|chrome\.storage\.sync/.test(source),'Remote execution/network/sync API: '+f);
 if(/\bfetch\s*\(/.test(source))assert(['background.js','page-observer.js','messenger-content.js'].includes(f),'Unexpected network entry point: '+f);
}
assert(manifest.content_security_policy.extension_pages.includes('connect-src https://*.zadn.vn https://*.zdn.vn https://*.dlfl.vn https://*.flchat.vn https://api.zalo.me'));
assert(manifest.content_security_policy.extension_pages.includes("media-src 'self' blob:"));
assert.equal(manifest.web_accessible_resources,undefined);
await readFile(dir+'/privacy.html');
console.log('PASS: MV3, 3 required permissions, optional platform/CDN access, selected dynamic Zalo/Messenger scripts, bounded resource fetch, no remote code or sync');
