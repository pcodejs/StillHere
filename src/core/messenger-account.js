import {resourceSource} from "./resources.js";
const accountMenuSelector='[role="dialog"][aria-label="Trang cá nhân của bạn"], [role="dialog"][aria-label="Your profile"]';

function selfProfile(menu) {
  return Array.from(menu.querySelectorAll('a[href]')).find(link=>{
    try {return new URL(link.href).pathname==='/me/' && new URL(link.href).origin===menu.ownerDocument.location.origin;}
    catch {return false;}
  });
}

export function messengerAccount(document) {
  const names=Array.from(document.querySelectorAll(accountMenuSelector))
    .map(menu=>selfProfile(menu)?.innerText?.trim())
    .filter(name=>name && name.length<=100);
  // The observed Messenger account control is present without opening its menu.
  // Reuse only the explicit own-profile identity, never a conversation name.
  const own = messengerSelfIdentity(document);
  if (own?.name) names.push(own.name);
  const distinct=[...new Set(names)];
  return distinct.length===1?{accountName:distinct[0]}:{};
}

export function messengerAccountAction(target) {
  const button=target.closest?.('[role="button"],button');
  const menu=button?.closest(accountMenuSelector);
  if (!menu || !selfProfile(menu)) return null;
  const label=button.innerText?.trim().replace(/\s+/g,' ');
  if (['Đăng xuất','Log out'].includes(label)) return 'logout';
  // Lock before opening the observed profile picker, including when two
  // accounts have identical names. Opening the picker does not prove which
  // account will be selected, so capture must wait for another unlock.
  if (['Xem tất cả trang cá nhân','See all profiles'].includes(label)) return 'switch';
  if (label?.length<=220 && /^(?:Chuyển sang|Switch to) .+$/.test(label)) return 'switch';
  return null;
}

// Only explicitly identified own-profile controls; never infer self from a chat avatar.
export function messengerSelfIdentity(document) {
  if (!document?.querySelectorAll) return null;
  const candidates=[];
  for (const menu of document.querySelectorAll(accountMenuSelector)) {
    const link=selfProfile(menu), name=link?.innerText?.trim();
    if(name && name.length<=100)candidates.push({element:link,name});
  }
  for (const button of document.querySelectorAll('[role="button"][aria-label],button[aria-label]')) {
    const label=button.getAttribute('aria-label') || '';
    const match=/^(.+?) @[^ ]+ - (?:Cài đặt, trợ giúp và hơn thế nữa|Settings, help and more)$/.exec(label);
    if(match && match[1].length<=100)candidates.push({element:button,name:match[1].trim()});
  }
  if(new Set(candidates.map(item=>item.name)).size!==1)return null;
  const sources=[...new Set(candidates.flatMap(({element})=>Array.from(element.querySelectorAll('img,svg image')).map(image=>
    resourceSource(image.currentSrc || image.src || image.getAttribute('href') || image.getAttribute('xlink:href'),false,'facebook')
  )).filter(Boolean))];
  return {name:candidates[0].name,avatar:sources.length===1?sources[0]:''};
}
