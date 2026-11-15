// A random partition token is not an identity or a decryption key. Persist it
// only for the exact browser-provided document ID so an extension reload does
// not turn the same anonymous document into a new archive partition.
const KEY = 'anonymousDocumentScopes';
const TTL = 30 * 86400000;
export async function documentScopeToken(storage, key, now = Date.now()) {
  const sessionKey = 'unknown:' + key;
  const session = await storage.session.get(sessionKey);
  const saved = (await storage.local.get(KEY))[KEY] || {};
  const entries = Object.entries(saved).filter(([,v]) => v && typeof v.token === 'string' && v.at > now - TTL);
  const scopes = Object.fromEntries(entries);
  const token = session[sessionKey] || scopes[key]?.token || crypto.randomUUID();
  if (scopes[key]?.token === token && scopes[key].at > now - 86400000) {
    if (!session[sessionKey]) await storage.session.set({[sessionKey]:token});
    return token;
  }
  scopes[key] = {token, at: now};
  const bounded = Object.fromEntries(Object.entries(scopes).sort((a,b)=>b[1].at-a[1].at).slice(0,512));
  await storage.local.set({[KEY]:bounded});
  await storage.session.set({[sessionKey]:token});
  return token;
}
export async function resetDocumentScope(storage, key) {
  const scopes = (await storage.local.get(KEY))[KEY] || {};
  delete scopes[key];
  await storage.local.set({[KEY]:scopes});
  await storage.session.remove('unknown:' + key);
}

export async function clearDocumentScopes(storage) {
  await storage.local.remove(KEY);
  const session = await storage.session.get(null);
  const keys = Object.keys(session).filter(key => key.startsWith('unknown:tab-account:'));
  if (keys.length) await storage.session.remove(keys);
}
