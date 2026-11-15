import {RESOURCE_ORIGINS_BY_PLATFORM} from './resources.js';
export const SITE_ORIGINS={zalo:['https://chat.zalo.me/*'],facebook:['https://www.facebook.com/*','https://facebook.com/*','https://web.facebook.com/*','https://www.messenger.com/*','https://messenger.com/*']};
export function selectedOrigins(platforms,media=true){return [...new Set(platforms.filter(p=>SITE_ORIGINS[p]).flatMap(p=>[...SITE_ORIGINS[p],...(media?RESOURCE_ORIGINS_BY_PLATFORM[p]:[])]))];}
export function platformScripts(platform){return platform==='zalo'?[{id:'stillhere-zalo-main',matches:SITE_ORIGINS.zalo,js:['page-observer.js'],world:'MAIN',runAt:'document_start'},{id:'stillhere-zalo-reader',matches:SITE_ORIGINS.zalo,js:['content.js'],world:'ISOLATED',runAt:'document_start'}]:[{id:'stillhere-facebook-reader',matches:SITE_ORIGINS.facebook,js:['messenger-content.js'],world:'ISOLATED',runAt:'document_start'}];}
export async function syncPlatformScripts(api,settings){
 const wanted=[];
 for(const platform of settings.consent?(settings.platforms||['zalo','facebook']):[]){if(SITE_ORIGINS[platform]&&await api.permissions.contains({origins:SITE_ORIGINS[platform]}))wanted.push(...platformScripts(platform));}
 const registered=await api.scripting.getRegisteredContentScripts();
 const remove=registered.filter(s=>s.id.startsWith('stillhere-')&&!wanted.some(w=>w.id===s.id)).map(s=>s.id);
 if(remove.length)await api.scripting.unregisterContentScripts({ids:remove});
 const add=wanted.filter(s=>!registered.some(r=>r.id===s.id));if(add.length)await api.scripting.registerContentScripts(add);
 return wanted;
}
