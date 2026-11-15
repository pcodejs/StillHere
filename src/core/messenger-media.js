import {resourceSource,normalizeAttachments} from './resources.js';

// Only resources rendered within this exact message. Never inspect inbox previews.
export function messengerMedia(node) {
  const attachments=[];
  const videos=Array.from(node.querySelectorAll?.('video') || []);
  for(const video of videos) {
    const source=resourceSource(video.currentSrc || video.src,true,'facebook');
    if(source) attachments.push({source,kind:'video'});
    else {
      const poster=resourceSource(video.poster,false,'facebook');
      if(poster)attachments.push({source:poster,kind:'image',previewOnly:true});
    }
  }
  for(const image of Array.from(node.querySelectorAll?.('img') || [])) {
    // 28px message avatars and small emoji are not message attachments.
    if(Number(image.width)<=40 || Number(image.height)<=40)continue;
    const anchor=image.closest?.('a[href]');
    if(anchor && !resourceSource(anchor.href,true,'facebook')) {
      // Observed photo viewer link, not an external-link preview.
      let viewer=false;
      try {
        const url=new URL(anchor.href);
        viewer=url.protocol==='https:' && ['web.facebook.com','www.facebook.com','www.messenger.com','messenger.com'].includes(url.hostname) &&
          !url.username && !url.password && !url.port && url.pathname==='/messenger_media/';
      } catch { /* Invalid links are not media viewers. */ }
      if(!viewer)continue;
    }
    const source=resourceSource(image.currentSrc || image.src,true,'facebook');
    if(!source)continue;
    const alt=(image.alt || '').toLowerCase();
    const kind=/sticker|nhãn dán/.test(alt)?'sticker':/\bgif\b/.test(alt)?'gif':'image';
    attachments.push({source,kind,previewOnly:videos.length>0});
  }
  // Messenger renders some stickers as labelled DIVs with a CSS background.
  // Restrict this to semantic sticker images inside the message, not decoration.
  for(const element of Array.from(node.querySelectorAll?.('[role="img"]') || [])) {
    if(!/sticker|nhãn dán/i.test(element.getAttribute?.('aria-label') || ''))continue;
    if(element.clientWidth<=40 || element.clientHeight<=40)continue;
    const view=element.ownerDocument?.defaultView;
    const background=view?.getComputedStyle(element).backgroundImage || '';
    const match=/^url\(["']?(https:\/\/[^"'()\s]+)["']?\)$/.exec(background);
    const source=resourceSource(match?.[1],false,'facebook');
    if(source)attachments.push({source,kind:'sticker'});
  }
  return normalizeAttachments(attachments,'facebook');
}
