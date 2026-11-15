// Render plain text in a closed shadow root. Never send the archive into page scripts.
export function startInlineViewer(findTargets) {
  const entries=new Map();let running=false,epoch=0,pending=false;
  const dispose=item=>{
    if(!item)return;
    item.host.remove();
    for(const [media,url] of item.mediaUrls){
      media.pause?.();media.removeAttribute('src');
      if(media.tagName==='VIDEO')media.load();
      URL.revokeObjectURL(url);
    }
    item.mediaUrls.clear();
  };
  // Zalo exposes the same message model on nested bubble/body/time nodes.
  // Render once per conversation/message, choosing the containing node when available.
  const uniqueTargets=()=>{
    const byMessage=new Map();
    for(const target of findTargets()){
      if(!target.node?.isConnected)continue;
      const key=JSON.stringify([target.conversationId,target.messageId]);
      const previous=byMessage.get(key);
      if(!previous||target.node.contains(previous.node))byMessage.set(key,target);
    }
    return [...byMessage.values()];
  };
  const current=target=>target.node.isConnected&&uniqueTargets().some(t=>t.node===target.node&&t.conversationId===target.conversationId&&t.messageId===target.messageId);
  async function refresh(){
    if(!chrome.runtime?.id){for(const item of entries.values())dispose(item);entries.clear();return;}
    if(running){pending=true;return;}running=true;const generation=epoch;
    try {
      const targets=uniqueTargets().slice(-40),live=new Set(targets.map(t=>t.node));
      for(const [node,item] of entries)if(!live.has(node)||!node.isConnected||!targets.some(t=>t.node===node&&t.conversationId===item.conversationId&&t.messageId===item.messageId)){dispose(item);entries.delete(node);}
      for(const target of targets){
        const result=await chrome.runtime.sendMessage({type:'INLINE_READ',conversationId:target.conversationId,messageId:target.messageId});
        if(generation!==epoch||!chrome.runtime?.id)return;
        if(!current(target))continue;
        const old=entries.get(target.node);
        if(!result?.record){dispose(old);entries.delete(target.node);continue;}
        const attachmentStatus=result.record.attachmentStatus;
        const text=result.record.text|| (result.language==='en'?'Attachment':'Tệp đính kèm');
        const label=(result.language==='en'?'Unsent message: ':'Tin nhắn đã gỡ: ')+text;
        const renderKey=JSON.stringify([label,Boolean(result.record.hasAttachment),attachmentStatus,result.language,target.conversationId,target.messageId]);
        if(old?.renderKey===renderKey)continue;
        dispose(old);
        const host=document.createElement('span');host.setAttribute('data-stillhere-inline','');
        host.style.cssText='display:block;box-sizing:border-box;width:fit-content;max-width:100%;min-width:0;isolation:isolate';
        // Messenger paints one gradient behind its rows; cover only our added row
        // with the same theme surface instead of exposing the gradient through gaps.
        if(target.messengerRow)host.style.cssText+=';width:100%;padding:4px 12px;background:var(--mwp-message-row-background,var(--messenger-card-background,#fff))';
        const shadow=host.attachShadow({mode:'closed'}),box=document.createElement('div'),mediaUrls=new Map();
        box.style.cssText='display:block;margin:6px 0;padding:10px 12px;background:#eef5ff;color:#173052;border:1px solid #cdddf5;border-radius:10px;font:13px/1.6 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;max-width:480px';
        box.style.width='fit-content';box.style.boxSizing='border-box';box.style.maxWidth='min(480px,100%)';
        box.textContent=label;
        const actionStyle='display:block;margin-top:6px;border:0;background:transparent;color:#0643d7;cursor:pointer;font:inherit;padding:4px 0;text-align:start';
        if(result.record.hasAttachment && ['saved','preview'].includes(attachmentStatus)){
          const mediaButton=document.createElement('button');mediaButton.textContent=attachmentStatus==='preview'?(result.language==='en'?'View saved preview':'Xem ảnh xem trước'):(result.language==='en'?'View saved attachment':'Xem tệp đã lưu');
          mediaButton.style.cssText=actionStyle;
          mediaButton.addEventListener('click',async()=>{
            mediaButton.disabled=true;
            try{
              const response=await chrome.runtime.sendMessage({type:'INLINE_ASSET',conversationId:target.conversationId,messageId:target.messageId});
              if(generation!==epoch||!host.isConnected||!current(target))return;
              const asset=response?.asset;
              if(!asset||!/^(?:image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm))$/.test(asset.mime))throw Error('unavailable');
              const media=document.createElement(asset.mime.startsWith('video/')?'video':'img');
              media.style.cssText='display:block;max-width:100%;max-height:260px;margin-top:8px';
              if(media.tagName==='VIDEO')media.controls=true;
              const fail=()=>{
                const url=mediaUrls.get(media);
                if(url){URL.revokeObjectURL(url);mediaUrls.delete(media);}
                media.remove();mediaButton.style.display='block';mediaButton.hidden=false;mediaButton.disabled=false;mediaButton.textContent=result.language==='en'?'Could not load file — retry':'Chưa tải được tệp — thử lại';
              };
              media.addEventListener('error',fail,{once:true});
              media.addEventListener(media.tagName==='VIDEO'?'loadeddata':'load',()=>{mediaButton.hidden=true;mediaButton.style.display='none';},{once:true});
              // Zalo permits blob: media but blocks data: video. Keep its policy intact.
              const bytes=Uint8Array.from(atob(asset.data),char=>char.charCodeAt(0));
              const url=URL.createObjectURL(new Blob([bytes],{type:asset.mime}));
              mediaUrls.set(media,url);media.src=url;media.alt='StillHere';box.append(media);
            }catch{mediaButton.disabled=false;mediaButton.textContent=result.language==='en'?'Could not load file — retry':'Chưa tải được tệp — thử lại';}
          });box.append(mediaButton);
        }else if(result.record.hasAttachment){
          const status=document.createElement('div');status.style.marginTop='6px';
          status.textContent=result.language==='en'?'No file saved on this device.':'Chưa có tệp trên máy.';
          box.append(status);
        }
        const button=document.createElement('button');button.textContent=result.language==='en'?'Open StillHere':'Mở StillHere';button.style.cssText='display:block;margin-top:6px;border:0;background:transparent;color:#0643d7;cursor:pointer;font:inherit;padding:0';
        button.addEventListener('click',()=>chrome.runtime.sendMessage({type:'INLINE_OPEN'}));box.append(button);shadow.append(box);
        target.node.after(host);entries.set(target.node,{host,mediaUrls,renderKey,conversationId:target.conversationId,messageId:target.messageId});
      }
    }catch{for(const item of entries.values())dispose(item);entries.clear();}finally{running=false;if(pending){pending=false;void refresh();}}
  }
  chrome.runtime.onMessage.addListener(m=>{if(m?.type==='SETTINGS_CHANGED'){epoch++;for(const item of entries.values())dispose(item);entries.clear();void refresh();}});
  setInterval(refresh,2500);void refresh();
}
