export function captureStatus(state, demo = false) {
  if (demo) return "demo";
  if (!state?.settings?.consent) return "off";
  if (state.siteAccess === false) return "permissionMissing";
  if (!state.settings.enabled) return "paused";

  const entries=state.health || [];
  const health = entries.filter(entry=>entry.fresh!==false && !entry.unavailable);
  // Background timer delivery can cross the freshness boundary repeatedly.
  // Keep the tab-position label stable; do not infer foreground capture from
  // a periodic heartbeat delivered by a background tab.
  if (health.some((entry) => entry.online && entry.matched > 0 && !entry.background)) return "live";
  if (health.some((entry) => entry.online && entry.background)) return "background";
  if (health.some((entry) => entry.online)) return "connected";
  if (health.length) return "offline";
  if(entries.some(entry=>entry.online && entry.background && !entry.unavailable)) return "background";
  if (state.tabs) return "reconnecting";
  return "waiting";
}
