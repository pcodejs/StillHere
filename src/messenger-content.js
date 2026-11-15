import {startInlineViewer} from './core/inline-viewer.js';
import {renderedBlob} from './core/rendered-blob.js';
import {messengerConversation} from './core/messenger-route.js';
import {messengerMessages} from './core/messenger-message.js';
import {createMessengerScope} from './core/messenger-scope.js';
import {messengerAccount,messengerAccountAction} from './core/messenger-account.js';
import {createMessengerHistory} from './core/messenger-history.js';

if (!globalThis.__stillhereReaderInstalled) {
globalThis.__stillhereReaderInstalled = true;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'STILLHERE_PING') reply({ready:true});
});
// Isolated-world DOM observer: no page bridge, cookies, network interception or E2EE keys.
let enabled = false;
let scanning = false;
let cacheMedia = false;
const savedBlobs = new Set();
const pendingBlobs = new Set();
const blobRetry = new Map();
let generation = 0;
const seen = new Map();
const belongsToConversation = createMessengerScope();
const history = createMessengerHistory();
async function configure() {
  const epoch = ++generation;
  enabled = false;
  cacheMedia = false;
  savedBlobs.clear();
  seen.clear();
  history.reset();
  try {
    const response = await chrome.runtime.sendMessage({type:'CONTENT_SETTINGS'});
    if(epoch !== generation) return;
    enabled = response?.settings?.consent === true && response.settings.enabled === true;
    cacheMedia = response?.settings?.cacheMedia === true;
  } catch { enabled = false; }
  void scan();
}
async function scan() {
  if(!enabled || scanning || !chrome.runtime?.id) return;
  scanning = true;
  const epoch = generation;
  try {
    const route = location.href;
    const conversation = messengerConversation(route);
    const nodes = conversation ? Array.from(document.querySelectorAll('[data-message-id]')).slice(-300) : [];
    const scoped = nodes.filter(node=>belongsToConversation(node,conversation));
    const parsed = messengerMessages(scoped,conversation);
    const events = history.reconcile(parsed, conversation?.conversationId || '', Date.now(), scoped.map(node=>node.getAttribute('data-message-id')));
    const health = await chrome.runtime.sendMessage({type:'HEALTH',health:{...messengerAccount(document),online:navigator.onLine,conversationOpen:!!conversation,matched:events.length}});
    if(health?.locked || health?.error) {enabled=false;seen.clear();return;}
    if(epoch !== generation || !enabled || location.href !== route) return;
    const changed = events.filter(event=>seen.get(event.conversationId+'\0'+event.messageId)!==JSON.stringify(event));
    const response = changed.length ? await chrome.runtime.sendMessage({type:'CAPTURE',events:changed}) : {ok:true};
    if(response?.ok && epoch === generation && enabled) {
      for(const event of changed) seen.set(event.conversationId+'\0'+event.messageId,JSON.stringify(event));
      while(seen.size>1500) seen.delete(seen.keys().next().value);
      if(cacheMedia)for(const event of events.filter(event=>event.event==='snapshot')) {
        for(const item of event.attachments || []) {
          const source=item.source;
          if(!source.startsWith('blob:') || savedBlobs.has(source) || pendingBlobs.has(source) || pendingBlobs.size>=2 || Date.now()-(blobRetry.get(source)||0)<30000)continue;
          const current=()=>enabled && cacheMedia && epoch===generation && location.href===route;
          pendingBlobs.add(source);
          // Downloads must not hold the DOM scan lock: new text/recalls keep flowing.
          void (async()=>{
            try {
              const data=await renderedBlob(source,location.origin,current);
              if(data && current()) {
                const result=await chrome.runtime.sendMessage({type:'MEDIA_INLINE',source,data});
                if(result?.ok && current())savedBlobs.add(source);
              }
            } catch { /* Revoked or streaming blobs remain explicitly uncached. */ }
            finally {
              pendingBlobs.delete(source);
              if(!savedBlobs.has(source))blobRetry.set(source,Date.now());
              while(blobRetry.size>1500)blobRetry.delete(blobRetry.keys().next().value);
            }
          })();
        }
      }
      while(savedBlobs.size>1500)savedBlobs.delete(savedBlobs.values().next().value);
    }
  } catch { /* A closed extension must not interrupt the conversation. */ }
  finally {scanning=false;}
}
chrome.runtime.onMessage.addListener(message=>{if(message?.type==='SETTINGS_CHANGED') void configure();});
document.addEventListener('click',event=>{
  if(!event.isTrusted)return;
  const action=messengerAccountAction(event.target);
  if(!action)return;
  enabled=false;
  generation++;
  seen.clear();
  history.reset();
  void chrome.runtime.sendMessage({type:'HEALTH',health:{loggedOut:action==='logout',accountChanging:action==='switch'}}).catch(()=>{});
},true);
let pending;
const observer = new MutationObserver(mutations=>{
  if(!enabled || pending) return;
  // Ignore unrelated page animations; only message media style changes matter.
  if(mutations.every(m=>m.type==='attributes' && ['style','class'].includes(m.attributeName) && !m.target.closest?.('[data-message-id]')))return;
  pending=setTimeout(()=>{pending=null;void scan();},150);
});
observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','data-message-id','src','srcset','poster','style','class']});
setInterval(()=>{if(enabled) void scan(); else void configure();},3000);
void configure();
startInlineViewer(()=>{
 const conversation=messengerConversation(location.href);if(!conversation||!enabled)return [];
 return [...document.querySelectorAll('[data-message-id]')].filter(n=>belongsToConversation(n,conversation)&&/đã (?:xóa|gỡ|thu hồi)|unsent|removed a message/i.test(n.innerText||'')).map(node=>({node,conversationId:conversation.conversationId,messageId:node.getAttribute('data-message-id'),messengerRow:true}));
});

}
