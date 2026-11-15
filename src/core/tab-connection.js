import {platformFromUrl} from './platforms.js';
import {SITE_ORIGINS} from './platform-access.js';
export function createTabConnector(api, canConnect = async () => true) {
  const pending = new Map();
  async function connect(tab) {
    const platform = platformFromUrl(tab?.url);
    if (!platform || !Number.isInteger(tab.id) || tab.discarded) return;
    if (!await canConnect(platform)) return;
    if (pending.has(tab.id)) return pending.get(tab.id);
    const task = (async () => {
      try {
        const response = await api.tabs.sendMessage(tab.id, {type:'STILLHERE_PING'});
        if (response?.ready) return;
      } catch { /* Existing tabs may predate installation or extension reload. */ }
      const target = {tabId:tab.id, frameIds:[0]};
      if (platform === 'zalo') await api.scripting.executeScript({target, world:'MAIN', files:['page-observer.js']});
      await api.scripting.executeScript({target, world:'ISOLATED', files:[platform === 'zalo' ? 'content.js' : 'messenger-content.js']});
    })().catch(() => { /* Closed, discarded or permission-denied tabs retry on next event. */ });
    pending.set(tab.id, task);
    try { await task; } finally { pending.delete(tab.id); }
  }
  async function sweep() {
    const tabs = await api.tabs.query({url:Object.values(SITE_ORIGINS).flat()});
    await Promise.allSettled(tabs.map(connect));
  }
  return {connect,sweep};
}
