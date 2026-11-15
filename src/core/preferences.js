import { deviceKey, base64, readDraftEnvelope, writeDraftEnvelope, clearDraftEnvelope } from "./vault.js";
const AAD = new TextEncoder().encode("fsub-feedback-draft-v1");
export function safePreferences(value = {}) {
  return {
    language: value.language === "en" ? "en" : "vi",
    type: ["all", "personal", "group"].includes(value.type)
      ? value.type
      : "all",
    who: ["all", "others", "self"].includes(value.who) ? value.who : "all",
    kind: ["all","text","media","image","video","gif","sticker","audio","file"].includes(value.kind) ? value.kind : "all",
    pinnedOnly: value.pinnedOnly === true,
  };
}
export function safeDraft(value = {}) {
  return {
    category: ["suggestion", "bug", "other"].includes(value.category)
      ? value.category
      : "suggestion",
    email: typeof value.email === "string" ? value.email.slice(0, 160) : "",
    message:
      typeof value.message === "string" ? value.message.slice(0, 3000) : "",
  };
}
export async function sealDraft(value, key, now = Date.now()) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    key,
    new TextEncoder().encode(
      JSON.stringify({ ...safeDraft(value), savedAt: now }),
    ),
  );
  return {
    version: 1,
    expiresAt: now + 30 * 86400000,
    iv: base64(iv),
    data: base64(new Uint8Array(data)),
  };
}
export async function openDraft(value, key, now = Date.now()) {
  if (!value) return safeDraft();
  if (value.version !== 1) throw Error("Unsupported draft");
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(value.iv), additionalData: AAD },
    key,
    bytes(value.data),
  );
  const draft = JSON.parse(new TextDecoder().decode(plain));
  return now - draft.savedAt > 30 * 86400000 ? safeDraft() : safeDraft(draft);
}
let queue = Promise.resolve();
export function preferencesMessage(message) {
  const next = queue.then(async () => {
    // Language remains available on the password screen without opening message data or drafts.
    if (message.type === "LANGUAGE_READ" || message.type === "LANGUAGE_WRITE") {
      const {uiPreferences} = await chrome.storage.local.get("uiPreferences");
      const preferences = safePreferences(uiPreferences);
      if (message.type === "LANGUAGE_WRITE") {
        preferences.language = message.language === "en" ? "en" : "vi";
        await chrome.storage.local.set({uiPreferences: preferences});
      }
      return {language: preferences.language};
    }
    if (message.type === "UI_READ" || message.type === "DRAFT_EXPIRE") {
      const data = await chrome.storage.local.get("uiPreferences");
      data.feedbackDraft = await readDraftEnvelope();
      if (data.feedbackDraft?.expiresAt <= Date.now()) {
        await clearDraftEnvelope();
        delete data.feedbackDraft;
      }
      return {
        preferences: safePreferences(data.uiPreferences),
        draft: await openDraft(data.feedbackDraft, await deviceKey()),
      };
    }
    if (message.type === "UI_WRITE") {
      await chrome.storage.local.set({
        uiPreferences: safePreferences(message.preferences),
      });
      return { ok: true };
    }
    if (message.type === "DRAFT_WRITE") {
      await writeDraftEnvelope(await sealDraft(message.draft, await deviceKey()));
      return { ok: true };
    }
    if (message.type === "DRAFT_CLEAR") {
      await clearDraftEnvelope();
      return { ok: true };
    }
  });
  queue = next.catch(() => {});
  return next;
}
