import { normalizeEvent, ADAPTER_VERSION } from './model.js';
import { resourceSource, MAX_RESOURCE_BYTES } from './resources.js';

const MAX_BASE64 = Math.ceil(MAX_RESOURCE_BYTES / 3) * 4;
// Bound both retained messages and bytes while a slow background worker drains.
const MAX_PENDING = 128;
const MAX_PENDING_BYTES = 128 * 1024 * 1024;

export function createIngress(send, now = () => Date.now()) {
  const pending = [];
  let pendingBytes = 0;
  let running = false;
  let generation = 0;
  let windowAt = now();
  let eventsLeft = 6000;
  let mediaLeft = 100 * 1024 * 1024;
  let healthAt = -Infinity;
  let healthLeft = 120;
  let lastIdentity = "";

  function reset() {
    generation++;
    pending.length = 0;
    pendingBytes = 0;
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending.length) {
        const item = pending.shift();
        try { await send(item.message); } catch { /* A closed worker must not break Zalo. */ }
        if (item.generation === generation) pendingBytes -= item.bytes;
      }
    } finally { running = false; }
  }

  function accept(data, cacheMedia) {
    if (pending.length >= MAX_PENDING) return false;
    const time = now();
    if (time - windowAt >= 60000) {
      windowAt = time;
      eventsLeft = 6000;
      healthLeft = 120;
      mediaLeft = 100 * 1024 * 1024;
    }
    let message;
    let eventCost = 0;
    let mediaCost = 0;
    if (data?.type === 'events' && Array.isArray(data.payload)) {
      if (!eventsLeft || !healthLeft) return false;
      // Construct fresh scalar-only records before Chrome serializes page data.
      const events = data.payload.slice(0, Math.min(300, eventsLeft))
        .map(value => {
          const normalized = normalizeEvent(value, time);
          if (normalized) normalized.accountId = typeof value.accountId === 'string' ? value.accountId.slice(0, 160) : '';
          return normalized;
        }).filter(Boolean);
      if (!events.length) return false;
      eventCost = events.length;
      message = { type: 'CAPTURE', events };
    } else if (data?.type === 'health') {
      if (!healthLeft) return false;
      const value = data.payload;
      const identity = JSON.stringify([
        typeof value?.accountId === 'string' ? value.accountId.slice(0, 160) : '',
        typeof value?.accountName === 'string' ? value.accountName.slice(0, 100) : '',
        value?.loggedOut === true,
      ]);
      // Identity changes must reach the background before that scan's captures.
      if (time - healthAt < 1000 && identity === lastIdentity) return false;
      lastIdentity = identity;
      const count = number => Number.isFinite(number) ? Math.max(0, Math.min(100000, Math.floor(number))) : 0;
      message = { type: 'HEALTH', health: {
        matched: count(value?.matched), candidates: count(value?.candidates),
        online: value?.online === true,
        loggedOut: value?.loggedOut === true,
        accountName: typeof value?.accountName === 'string' ? value.accountName.slice(0, 100) : '',
        accountId: typeof value?.accountId === 'string' ? value.accountId.slice(0, 160) : '',
        adapter: ADAPTER_VERSION,
      }};
    } else if (data?.type === 'asset' && cacheMedia) {
      const value = data.payload;
      const source = resourceSource(value?.source);
      if (!source.startsWith('blob:') || typeof value?.data !== 'string' ||
          !value.data.length || value.data.length > MAX_BASE64 ||
          value.data.length % 4 !== 0) return false;
      const padding = value.data.endsWith('==') ? 2 : value.data.endsWith('=') ? 1 : 0;
      mediaCost = value.data.length * 3 / 4 - padding;
      if (mediaCost > MAX_RESOURCE_BYTES) return false;
      if (mediaCost > mediaLeft || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) return false;
      message = { type: 'MEDIA_INLINE', source, data: value.data };
    } else return false;
    const bytes = JSON.stringify(message).length * 2;
    if (pending.length >= MAX_PENDING || pendingBytes + bytes > MAX_PENDING_BYTES) return false;
    eventsLeft -= eventCost;
    mediaLeft -= mediaCost;
    if (message.type === 'HEALTH') { healthAt = time; healthLeft--; }
    pendingBytes += bytes;
    pending.push({ message, bytes, generation });
    void drain();
    return true;
  }
  return { accept, reset };
}
