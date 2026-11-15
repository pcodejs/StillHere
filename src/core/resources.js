export const RESOURCE_ORIGINS_BY_PLATFORM = Object.freeze({
  zalo:Object.freeze(['https://*.zadn.vn/*', 'https://*.zdn.vn/*', 'https://*.dlfl.vn/*', 'https://*.flchat.vn/*', 'https://api.zalo.me/*']),
  facebook:Object.freeze(['https://*.fbcdn.net/*','https://cdn.fbsbx.com/*']),
});
export const RESOURCE_ORIGINS = Object.values(RESOURCE_ORIGINS_BY_PLATFORM).flat();
export async function resourcePermissions(contains) {
  const details=await resourcePermissionDetails(contains);
  return Object.fromEntries(Object.entries(details).map(([platform,value])=>[platform,value.available]));
}
export async function resourcePermissionDetails(contains) {
  const entries=await Promise.all(Object.entries(RESOURCE_ORIGINS_BY_PLATFORM).map(async([platform,origins])=>{
    const grants=await Promise.all(origins.map(origin=>contains({origins:[origin]})));
    return [platform,{available:grants.some(Boolean),complete:grants.every(Boolean)}];
  }));
  return Object.fromEntries(entries);
}
export const MAX_RESOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_CACHE_BYTES = 100 * 1024 * 1024;

export function resourceSource(value, allowBlob = true, platform) {
  if (typeof value !== 'string' || value.length > 4096) return '';
  if (allowBlob && /^blob:https:\/\/(?:chat\.zalo\.me|(?:www\.)?messenger\.com|(?:(?:www|web)\.)?facebook\.com)\/[a-zA-Z0-9-]+$/.test(value)) {
    const facebook = !value.startsWith('blob:https://chat.zalo.me/');
    return !platform || platform === (facebook ? 'facebook' : 'zalo') ? value : '';
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return '';
    const cdn = /^(?:[a-z0-9-]+\.)*(?:zadn|zdn|dlfl)\.vn$/.test(url.hostname) ||
      /^file-stal-\d+(?:-[a-z0-9]+)*\.flchat\.vn$/.test(url.hostname);
    const sticker = url.hostname === 'api.zalo.me' && url.pathname === '/api/emoticon/sticker/webpc';
    const facebook = /^(?:[a-z0-9-]+\.)+fbcdn\.net$/.test(url.hostname) ||
      (url.hostname==='cdn.fbsbx.com' && /^\/v\/t\d+(?:\.\d+)?-\d+\//.test(url.pathname));
    return (platform !== 'facebook' && (cdn || sticker)) || (platform !== 'zalo' && facebook) ? url.href : '';
  } catch { return ''; }
}

export function normalizeAttachments(value, platform = 'zalo') {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, 12).flatMap(item => {
    const source = resourceSource(item?.source, true, platform);
    if (!source || seen.has(source) || !['image', 'gif', 'sticker', 'video'].includes(item.kind)) return [];
    seen.add(source);
    return [{source, kind:item.kind, previewOnly:item.previewOnly === true}];
  });
}

export async function resourceId(source) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Accept passive image/video containers. Reject encrypted bytes, HTML and SVG.
export function sniffResource(bytes) {
  const b = bytes;
  const ascii = (start, end) => String.fromCharCode(...b.subarray(start, end));
  if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length > 8 && ascii(1,4) === 'PNG' && b[0] === 137) return 'image/png';
  if (ascii(0,6) === 'GIF87a' || ascii(0,6) === 'GIF89a') return 'image/gif';
  if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  if (ascii(4,8) === 'ftyp') return 'video/mp4';
  if (b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163) return 'video/webm';
  return '';
}
