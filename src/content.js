import {startInlineViewer} from './core/inline-viewer.js';
import { createIngress } from "./core/ingress.js";
if (!globalThis.__stillhereReaderInstalled) {
globalThis.__stillhereReaderInstalled = true;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'STILLHERE_PING') reply({ready:true});
});
const token = crypto.randomUUID();
let allowed = false;
let cacheMedia = false;
const ingress = createIngress(message => chrome.runtime.sendMessage(message));
function control() {
  if (!chrome.runtime?.id) {
    allowed = false;
    return;
  }
  window.postMessage(
    { channel: "fsub-unsend-control-v2", token, enabled: allowed, cacheMedia },
    location.origin,
  );
}
async function configure() {
  const previouslyCaching = cacheMedia;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "CONTENT_SETTINGS",
    });
    allowed =
      response?.settings?.consent === true &&
      response.settings.enabled === true;
    cacheMedia = allowed && response.settings.cacheMedia === true;
  } catch {
    allowed = false;
  }
  if (!allowed || (previouslyCaching && !cacheMedia)) ingress.reset();
  control();
}
window.addEventListener("message", (e) => {
  if (
    !allowed ||
    e.source !== window ||
    e.origin !== "https://chat.zalo.me" ||
    e.data?.channel !== "fsub-unsend-page-v2" ||
    e.data.token !== token
  )
    return;
  // The page token routes the bridge. Same-origin scripts can observe it.
  // Treat every payload as untrusted and bound it before runtime serialization.
  try { ingress.accept(e.data, cacheMedia); } catch { /* Ignore malformed page data. */ }

});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SETTINGS_CHANGED") configure();
});
configure();
// Resolve document_start ordering between the isolated and main worlds.
document.addEventListener("DOMContentLoaded", control, { once: true });
setTimeout(control, 1000);

// Keep the page adapter lease tied to a live extension context.
setInterval(() => { if (allowed) control(); else void configure(); }, 5000);

startInlineViewer(()=>allowed?[...document.querySelectorAll('[data-stillhere-recalled]')].flatMap(node=>{try{const [conversationId,messageId]=JSON.parse(node.getAttribute('data-stillhere-recalled'));return [{node,conversationId,messageId}];}catch{return [];}}):[]);

}
