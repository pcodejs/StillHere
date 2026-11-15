import {resourceSource} from './resources.js';

// Conversation identity must come from this message's own log and header.
// A sender avatar or an inbox/profile link elsewhere is not a chat header.
export function messengerDetails(node,cache) {
  const log=node.closest?.('[role="log"][aria-label]');
  if(log && cache?.has(log))return cache.get(log);
  const details=detailsForLog(log);
  if(log)cache?.set(log,details);
  return details;
}

function detailsForLog(log) {
  const label=log?.getAttribute('aria-label') || '';
  const conversationName=/^(?:Tin nhắn trong cuộc trò chuyện với |Messages in conversation with )(.+)$/.exec(label)?.[1]?.trim().slice(0,100) || '';
  const details={conversationName,conversationType:'unknown',conversationAvatar:''};
  const region=log?.closest?.('[role="region"]');
  const logs=Array.from(region?.querySelectorAll?.('[role="log"]') || []);
  if(!conversationName || logs.length!==1 || logs[0]!==log)return details;
  const groupHeaders=Array.from(region.querySelectorAll('[role="button"],button')).filter(button=>
    !button.closest('[role="log"]') &&
    ['Cuộc trò chuyện với '+conversationName,'Conversation with '+conversationName].includes(button.getAttribute('aria-label')));
  if(groupHeaders.length===1) {
    const header=groupHeaders[0];
    const name=header.innerText?.trim().replace(/\s+/g,' ');
    const avatars=[...new Set(Array.from(header.querySelectorAll('img')).map(image=>resourceSource(image.currentSrc || image.src,false,'facebook')).filter(Boolean))].slice(0,2);
    // Observed group header is a conversation button, while a personal
    // header is a numeric profile link. No inference from commas in names.
    if(name && name.length<=100) {
      return {conversationName:name,conversationType:'group',conversationAvatar:avatars.length===1?avatars[0]:'',conversationAvatars:avatars.length===2?avatars:[]};
    }
  }
  const profiles=Array.from(region.querySelectorAll('a[href]')).filter(link=>{
    if(link.closest('[role="log"]') || link.innerText?.trim()!==conversationName)return false;
    try {
      const url=new URL(link.href);
      return url.protocol==='https:' && url.hostname==='www.facebook.com' &&
        !url.username && !url.password && !url.port && /^\/[0-9]{5,20}\/?$/.test(url.pathname);
    } catch {return false;}
  });
  const ids=new Set(profiles.map(link=>new URL(link.href).pathname.replaceAll('/','')));
  if(ids.size!==1)return details;
  details.conversationType='personal';
  const images=profiles.flatMap(link=>Array.from(link.querySelectorAll('img')));
  const avatars=[...new Set(images.map(image=>resourceSource(image.currentSrc || image.src,false,'facebook')).filter(Boolean))];
  if(avatars.length===1)details.conversationAvatar=avatars[0];
  return details;
}
