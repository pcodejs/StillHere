// Platform boundaries shared by capture, storage and navigation.
export const PLATFORMS = Object.freeze({
  zalo: {label: 'Zalo', home: 'https://chat.zalo.me/'},
  facebook: {label: 'Facebook', home: 'https://www.messenger.com/'},
});

export function platformFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'chat.zalo.me') return 'zalo';
    if (url.hostname === 'www.messenger.com' || url.hostname === 'messenger.com') return 'facebook';
    if (['www.facebook.com','facebook.com','web.facebook.com'].includes(url.hostname)) return 'facebook';
    return null;
  } catch {
    return null;
  }
}

// Existing archives predate multi-platform support and contain Zalo records.
export function recordPlatform(record) {
  if (record.platform === undefined) return 'zalo';
  return Object.hasOwn(PLATFORMS, record.platform) ? record.platform : null;
}

export function platformRecords(records, platform) {
  if (!Object.hasOwn(PLATFORMS, platform)) return [];
  return records.filter(record => recordPlatform(record) === platform);
}
