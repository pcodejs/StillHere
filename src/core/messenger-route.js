import {platformFromUrl} from './platforms.js';

// Derive identity only from a selected conversation, never from inbox previews.
export function messengerConversation(value) {
  if (platformFromUrl(value) !== 'facebook') return null;
  const url = new URL(value);
  const route = ['www.facebook.com','facebook.com','web.facebook.com'].includes(url.hostname)
    ? /^\/messages\/(e2ee\/)?t\/([0-9]+)\/?$/
    : /^\/(e2ee\/)?t\/([0-9]+)\/?$/;
  const match = route.exec(url.pathname);
  if (!match || match[2].length > 160) return null;
  return {platform:'facebook', conversationId:match[2], encryptedRoute:!!match[1]};
}
