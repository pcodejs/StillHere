import {
  CANDIDATES,
  ACCOUNT_CONTROL,
  readModel,
  eventFromModel,
  readProfile,
  renderedAvatar,
  renderedAttachments,
  readAccountIdentity,
  readConversationPreview,
} from "./core/adapter.js";
import { createZaloAuthState } from "./core/zalo-auth-state.js";
import { createCaptureScope } from "./core/capture-scope.js";
import { MAX_RESOURCE_BYTES, resourceSource } from "./core/resources.js";
(() => {
  if (location.origin !== "https://chat.zalo.me") return;
  // Legacy v2 cannot be disposed safely; never start a second reader beside it.
  // That one-time upgrade needs a page reload; v3 replacements clean up in place.
  if (window[Symbol.for("fsub-unsend-observer-v2")] === true) return;
  const marker = Symbol.for("fsub-unsend-observer-v3");
  window[marker]?.dispose?.();
  const lifetime = new AbortController();
  let disposed = false;
  let accountReady = false;
  const captureScope = createCaptureScope();
  const authState = createZaloAuthState();
  Object.defineProperty(window, marker, { configurable: true, value: { dispose() {
    disposed = true;
    captureScope.update(null);
    enabled = false;
    clients.clear();
    observer?.disconnect();
    clearTimeout(timer);
    clearInterval(healthTimer);
    lifetime.abort();
    if (HTMLAnchorElement.prototype.click === wrappedAnchorClick)
      HTMLAnchorElement.prototype.click = anchorClick;
  } } });
  const clients = new Map();
  let enabled = false,
    cacheMedia = false,
    observer,
    timer,
    healthTimer;
  const inlineSent = new Set();
  let openedVideo = null;
  const sent = new Map();
  const send = (type, payload) => {
    if (disposed) return;
    for (const [token, client] of clients) {
      if (type === "asset" && !client.cacheMedia) continue;
      window.postMessage(
        { channel: "fsub-unsend-page-v2", token, type, payload },
        location.origin,
      );
    }
  };
  function scan() {
    if (disposed) return;
    for (const [token, client] of clients) {
      if (Date.now() - client.at > 16000) clients.delete(token);
    }
    enabled = clients.size > 0;
    cacheMedia = [...clients.values()].some((client) => client.cacheMedia);
    if (!enabled) {
      captureScope.update(null);
      observer?.disconnect();
      clearInterval(healthTimer);
      sent.clear();
      return;
    }
    let matched = 0;
    const events = [];
    const visibleSnapshots = new Set();
    const nodes = document.querySelectorAll(CANDIDATES);
    const profiles = [
      ...document.querySelectorAll(
        '[class*="header"], [id*="header"], [id*="Header"], [class*="avatar"], [data-component*="avatar"], [class*="Avatar"], [aria-label*="tài khoản"]',
      ),
    ].slice(0, 160);
    const account = readAccountIdentity(
      profiles, document.title, document.querySelector(ACCOUNT_CONTROL),
    );
    const auth = authState({title: document.title, account});
    accountReady = auth.capture;
    captureScope.update(auth.capture ? JSON.stringify([account.id || '', account.name || '']) : null);
    if (!auth.capture) {
      openedVideo = null;
      send("health", {matched: 0, candidates: 0, online: navigator.onLine,
        accountName: "", accountId: "", loggedOut: auth.loggedOut, at: Date.now()});
      return;
    }
    const profileCache = new Map();
    const profileFor = (id) => {
      if (profileCache.has(id)) return profileCache.get(id);
      let result = null;
      if (profileCache.size < 40)
        for (const item of profiles) {
          const p = readProfile(item, id);
          if (p) {
            result = {
              name: p.name || result?.name || "",
              type: p.type ?? result?.type,
              avatar: p.avatar || renderedAvatar(item) || result?.avatar || "",
            };
            if (result.name && result.avatar) break;
          }
        }
      profileCache.set(id, result);
      return result;
    };
    for (const el of [...nodes].slice(-600)) {
      try {
        const model = readModel(el);
        if (!model) continue;
        const e = eventFromModel(model.message, model.props, { accountName: account.name });
        if (!e) continue;
        if(e.event==='recall')el.setAttribute('data-stillhere-recalled',JSON.stringify([e.conversationId,e.messageId]));
        else el.removeAttribute('data-stillhere-recalled');
        if (!e.conversationName || !e.conversationAvatar) {
          const conv = profileFor(e.conversationId);
          if (conv) {
            e.conversationName ||= conv.name;
            e.conversationAvatar ||= conv.avatar;
            if ([2, 4].includes(Number(conv.type)))
              e.conversationType = "group";
          }
        }
        if (!e.senderAvatar)
          e.senderAvatar =
            (e.isSelf ? account.avatar || (account.id ? profileFor(account.id)?.avatar : "") : profileFor(String(model.message.fromUid))?.avatar) || "";
        const rendered = renderedAttachments(el, model.message, e.kind);
        if (
          rendered.some((item) => item.source.startsWith("blob:")) ||
          !e.attachments.length
        )
          e.attachments = rendered;
        if (e.event === "snapshot")
          visibleSnapshots.add(JSON.stringify([e.conversationId, e.messageId]));
        matched++;
        const key = JSON.stringify([e.conversationId, e.messageId, e.clientId]);
        const value = JSON.stringify(e);
        if (sent.get(key) === value) continue;
        sent.set(key, value);
        events.push(e);
      } catch {
        /* A changed UI must never break the host page. */
      }
    }
    for (const element of [...document.querySelectorAll(".conv-item")].slice(
      0,
      100,
    )) {
      const event = readConversationPreview(element);
      if (!event) continue;
      // Conversation previews can briefly retain the previous recall label
      // while their latest message ID already belongs to a new visible message.
      if (
        event.event === "recall" &&
        visibleSnapshots.has(JSON.stringify([event.conversationId, event.messageId]))
      ) continue;
      const key =
        "preview:" + JSON.stringify([event.conversationId, event.messageId]);
      const value = JSON.stringify(event);
      if (sent.get(key) === value) continue;
      sent.set(key, value);
      events.push(event);
    }
    if (sent.size > 2500) sent.clear();
    send("health", {
      matched,
      candidates: nodes.length,
      online: navigator.onLine,
      accountName: account.name,
      accountId: account.id,
      loggedOut: auth.loggedOut,
      at: Date.now(),
    });
    // Every deduplicated event must be delivered. The bridge accepts 300 per
    // message, but one rendered viewport can contain more than one batch.
    for (let offset = 0; offset < events.length; offset += 300)
      send("events", events.slice(offset, offset + 300));
    if (cacheMedia)
      for (const event of events) {
        if (event.event !== "snapshot") continue;
        for (const item of event.attachments)
          if (item.source.startsWith("blob:")) captureBlob(item.source);
      }

  }
  async function captureBlob(source) {
    if (!accountReady || !enabled || !cacheMedia) return;
    if (inlineSent.has(source) || inlineSent.size >= 100) return;
    inlineSent.add(source);
    const ticket = captureScope.ticket();
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(15000),
      });
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_RESOURCE_BYTES) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let encoded = "";
      for (let offset = 0; offset < bytes.length; offset += 8192)
        encoded += String.fromCharCode(
          ...bytes.subarray(offset, offset + 8192),
        );
      if (captureScope.accepts(ticket) && accountReady && enabled && cacheMedia)
        send("asset", { source, data: btoa(encoded) });
      else inlineSent.delete(source);
    } catch {
      inlineSent.delete(source);
    }
  }
  function captureOpenedVideo(node) {
    if (
      !accountReady ||
      !enabled ||
      !cacheMedia ||
      !openedVideo ||
      !captureScope.accepts(openedVideo.ticket) ||
      Date.now() - openedVideo.at > 20000 ||
      node.nodeType !== 1
    )
      return;
    const mediaNodes = node.matches("video, a[download]")
      ? [node]
      : [...node.querySelectorAll("video, a[download]")].slice(0, 8);
    for (const media of mediaNodes) {
      if (media.tagName === "A" && media.download !== openedVideo.fileName)
        continue;
      const source = resourceSource(
        media.currentSrc || media.src || media.href,
      );
      if (!source.startsWith("blob:")) continue;
      if (openedVideo.sources.has(source)) continue;
      openedVideo.sources.add(source);
      send("events", [
        {
          ...openedVideo.event,
          attachments: [{ source, kind: "video", previewOnly: false }],
        },
      ]);
      captureBlob(source);
    }
  }
  // Downloads may click a detached anchor, which MutationObserver cannot see.
  // Retain only a blob tied to the user's recent video click and exact filename.
  const anchorClick = HTMLAnchorElement.prototype.click;
  const wrappedAnchorClick = function (...args) {
    captureOpenedVideo(this);
    return anchorClick.apply(this, args);
  };
  HTMLAnchorElement.prototype.click = wrappedAnchorClick;
  document.addEventListener(
    "click",
    (event) => {
      if (!accountReady || !enabled || !cacheMedia) return;
      const target =
        event.target?.nodeType === 1
          ? event.target
          : event.target?.parentElement;
      const model = target && readModel(target);
      if (!model) return;
      const message = eventFromModel(model.message, model.props);
      if (message?.event === "snapshot" && message.kind === "video") {
        openedVideo = {
          ticket: captureScope.ticket(),
          event: message,
          fileName: String(model.message?.message?.title || ""),
          at: Date.now(),
          sources: new Set(),
        };
      }
    },
    {capture: true, signal: lifetime.signal},
  );
  function start() {
    observer?.disconnect();
    clearInterval(healthTimer);
    if (!enabled || !document.documentElement) return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations.slice(0, 100)) {
        captureOpenedVideo(mutation.target);
        for (const node of [...mutation.addedNodes].slice(0, 20))
          captureOpenedVideo(node);
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        scan();
      }, 120);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["src", "href"],
    });
    healthTimer = setInterval(scan, 5000);
    scan();
  }
  window.addEventListener("message", (e) => {
    if (
      e.source !== window ||
      e.origin !== location.origin ||
      e.data?.channel !== "fsub-unsend-control-v2"
    )
      return;
    const { token } = e.data;
    if (typeof token !== "string" || token.length !== 36) return;
    const previous = clients.get(token);
    if (e.data.enabled === true) {
      if (!previous && clients.size >= 10) return;
      const next = { cacheMedia: e.data.cacheMedia === true, at: Date.now() };
      if (!previous || previous.cacheMedia !== next.cacheMedia) {
        sent.clear();
        inlineSent.clear();
      }
      clients.set(token, next);
    } else {
      clients.delete(token);
    }
    enabled = clients.size > 0;
    cacheMedia = [...clients.values()].some((client) => client.cacheMedia);
    if (!enabled || !cacheMedia) {
      captureScope.update(null);
      openedVideo = null;
    }
    if (!enabled) {
      sent.clear();
      inlineSent.clear();
      openedVideo = null;
    }
    start();
  }, {signal: lifetime.signal});

  // No storage, credentials, network hooks, application changes or remote code.
})();
