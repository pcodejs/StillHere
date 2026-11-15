import { str, avatarSource, zaloMessageId } from "./model.js";
import { resourceSource, normalizeAttachments } from "./resources.js";
// Shapes and numeric types verified against Zalo's public render bundle on 2026-11-11.
// This adapter has no dependency on Zalo's network transport or encryption keys.
export const CANDIDATES =
  '[id*="-mCntr_"], [data-qid], .undo-message, [data-component="bubble-message"]';
// Observed on Zalo Web's signed-in account control on 2026-11-15.
export const ACCOUNT_CONTROL = '#sidebarNav #main-tab .nav__tabs__zalo';
export function isMessage(m) {
  return (
    m &&
    typeof m === "object" &&
    (str(m.msgId) || str(m.cliMsgId)) &&
    str(m.toUid) &&
    ("message" in m || "UIContent" in m) &&
    "msgType" in m
  );
}
export function readModel(element) {
  let current = element;
  for (
    let level = 0;
    current && level < 7;
    level++, current = current.parentElement
  ) {
    const key = Object.keys(current).find(
      (k) =>
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$"),
    );
    let fiber = key && current[key];
    let found = null;
    let context = {};
    for (let hop = 0; fiber && hop < 16; hop++, fiber = fiber.return) {
      const p = fiber.memoizedProps;
      const message = [p?.data, p?.message].find(isMessage);
      if (message && !found) found = message;
      if (
        p?.conversation &&
        (!found ||
          !p.conversation.userId ||
          String(p.conversation.userId) === String(found.toUid))
      )
        context.conversation = p.conversation;
      if (typeof p?.isGroup === "boolean") context.isGroup = p.isGroup;
      if (p?.senderInfo) context.senderInfo = p.senderInfo;
      if (p?.sender) context.sender = p.sender;
    }
    if (found) return { message: found, props: context };
    const propsKey = Object.keys(current).find((k) =>
      k.startsWith("__reactProps$"),
    );
    const p = propsKey && current[propsKey];
    const message = [p?.data, p?.message].find(isMessage);
    if (message) return { message, props: p };
  }
  return null;
}
export function eventFromModel(m, props = {}, context = {}) {
  if (!isMessage(m)) return null;
  const type = Number(m.msgType);
  // Do not archive pending/failed decrypt, system notices or disappearing-message content.
  if (
    Number(m.ttl) > 0 ||
    type < 0 ||
    ![
      1, 2, 3, 4, 5, 6, 7, 11, 13, 17, 18, 19, 20, 23, 401, 402, 403, 404, 2502,
      2503,
    ].includes(type)
  )
    return null;
  const conv = props.conversation || props.conv || {};
  const convId = str(m.toUid);
  const convType = Number(conv.type ?? conv.conversationType);
  const isGroup =
    props.isGroup === true ||
    conv.isGroup === true ||
    [2, 4].includes(convType) ||
    /^g\d+$/.test(convId);
  const knownPersonal =
    [1, 3, 5, 6].includes(convType) ||
    props.isGroup === false ||
    conv.isGroup === false ||
    /^u\d+$/.test(convId);
  const videoFile =
    [19, 23].includes(type) &&
    /\.(mp4|webm|mov|m4v)$/i.test(str(m.message?.title, 500));
  const kind = type === 7
    ? "gif"
    : [2, 5, 11, 2503].includes(type)
    ? "image"
    : [4, 13, 401, 402, 403, 404, 2502].includes(type)
      ? "sticker"
      : type === 18 || videoFile
        ? "video"
        : type === 3
          ? "audio"
          : [19, 23].includes(type)
            ? "file"
            : type === 1
              ? "text"
              : "other";
  let text =
    typeof m.UIContent === "string"
      ? m.UIContent
      : typeof m.message === "string"
        ? m.message
        : "";
  if (!text && kind !== "text" && typeof m.message === "object")
    text = str(m.message?.title, 500);
  return {
    event: type === 20 ? "recall" : "snapshot",
    messageId: zaloMessageId(m.msgId),
    clientId: str(m.cliMsgId),
    conversationId: convId,
    conversationName: str(
      conv.displayName || conv.name || context.conversationName,
      100,
    ),
    conversationType: isGroup
      ? "group"
      : knownPersonal
        ? "personal"
        : "unknown",
    sender: str(m.fromUid) === "0" ? str(context.accountName, 100) || "Bạn" : str(m.dName, 100),
    isSelf: str(m.fromUid) === "0",
    senderAvatar: avatarSource(
      m.avatar ||
        props.senderInfo?.avatar ||
        props.sender?.avatar ||
        context.senderAvatar,
    ),
    conversationAvatar: avatarSource(
      conv.avatar || conv.fullAvt || context.conversationAvatar,
    ),
    text: type === 20 ? "" : text,
    kind,
    attachments: type === 20 ? [] : modelAttachments(m.message, kind),
    sentAt: Number(m.sendDttm),
    source: "render-model",
  };
}
// Inspect only props attached to rendered UI. Never traverse application stores or contacts.
export function readProfile(element, id) {
  let result = null;
  let current = element;
  for (
    let level = 0;
    current && level < 4;
    level++, current = current.parentElement
  ) {
    const key = Object.keys(current).find(
      (k) =>
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$"),
    );
    let fiber = key && current[key];
    for (let hop = 0; fiber && hop < 12; hop++, fiber = fiber.return) {
      const p = fiber.memoizedProps;
      const items = [
        p,
        p?.conversation,
        p?.conv,
        p?.user,
        p?.userInfo,
        p?.senderInfo,
        p?.contact,
        p?.group,
        p?.groupInfo,
        p?.info,
        p?.data,
      ];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const uid = str(item.userId || item.uid || item.groupId || item.id);
        if (uid !== id) continue;
        const name = str(item.displayName || item.dName || item.name, 100),
          avatar = avatarSource(item.avatar || item.fullAvt || item.avatarUrl);
        if (name || avatar) {
          result = {
            name: name || result?.name || "",
            avatar: avatar || result?.avatar || "",
            type: item.type ?? result?.type,
          };
          if (result.name && result.avatar) return result;
        }
      }
    }
  }
  return result;
}

function modelAttachments(value, kind) {
  if (!["image", "gif", "sticker", "video"].includes(kind)) return [];
  let content = value;
  if (typeof content === "string" && content.length < 200000) {
    try {
      content = JSON.parse(content);
    } catch {
      return [];
    }
  }
  const items = Array.isArray(content) ? content : [content];
  const refs = [];
  for (const item of items.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    let params = item.params;
    if (typeof params === "string") {
      try {
        params = JSON.parse(params);
      } catch {
        params = {};
      }
    }
    const sources =
      kind === "sticker"
        ? [item.stickerWebpUrl, item.stickerUrl, item.url, item.href]
        : kind === "video"
          ? [
              item.videoUrl,
              params?.videoUrl,
              params?.url,
              item.href,
              item.url,
              item.normalUrl,
            ]
          : [item.normalUrl, item.hdUrl, item.oriUrl, item.href, item.url];
    const source = sources.map((value) => resourceSource(value)).find(Boolean);
    const preview = resourceSource(item.thumbUrl || item.thumb);
    if (source) refs.push({ source, kind });
    else if (preview)
      refs.push({
        source: preview,
        kind: kind === "video" ? "image" : kind,
        previewOnly: true,
      });
  }
  return normalizeAttachments(refs);
}

export function renderedAttachments(element, message, kind) {
  if (!["image", "gif", "sticker", "video"].includes(kind)) return [];
  let current = element;
  for (
    let level = 0;
    current && level < 5;
    level++, current = current.parentElement
  ) {
    const model = readModel(current);
    if (!model || zaloMessageId(model.message.msgId) !== zaloMessageId(message.msgId)) break;
    const nodes = [
      ...current.querySelectorAll('video, img, [style*="background-image"]'),
    ];
    const refs = [];
    for (const node of nodes.slice(0, 24)) {
      if (node.closest('[class*="avatar"]')) continue;
      const isVideo = node.tagName === "VIDEO";
      if (kind === "video" && !isVideo) continue;
      const styleSource = node.style?.backgroundImage?.match(
        /^url\(["']?(.+?)["']?\)$/,
      )?.[1];
      const source = resourceSource(node.currentSrc || node.src || styleSource);
      if (source) refs.push({ source, kind: isVideo ? "video" : kind });
    }
    if (refs.length) return normalizeAttachments(refs);
  }
  return [];
}
export function renderedAvatar(element) {
  const img = element?.matches?.("img")
    ? element
    : element?.querySelector?.("img");
  if (!img) return "";
  const remote = avatarSource(img.currentSrc || img.src);
  if (!remote) return "";
  try {
    if (img.complete && img.naturalWidth) {
      const canvas = img.ownerDocument.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      canvas.getContext("2d").drawImage(img, 0, 0, 64, 64);
      const thumbnail = avatarSource(canvas.toDataURL("image/jpeg", 0.75));
      if (thumbnail) return thumbnail;
    }
  } catch {
    /* A cross-origin image can still be displayed by its allowed CDN URL. */
  }
  return remote;
}

// Read the signed-in identity only from explicit self/account props on rendered UI.
// Conversation and sender props are deliberately excluded.
export function readAccountIdentity(elements, title = "", accountControl = null) {
  // This control belongs to the signed-in account. Profile dialogs and chat
  // avatars can belong to other people, even when their display names match.
  if (accountControl?.matches?.(ACCOUNT_CONTROL)) {
    const name = str(accountControl.getAttribute("title"), 100).trim();
    const images = accountControl.querySelectorAll("img[data-ava-uid]");
    if (name && images.length === 1) {
      const id = str(images[0].getAttribute("data-ava-uid"), 160);
      if (/^[1-9]\d{0,30}$/.test(id)) {
        const avatar = avatarSource(images[0].currentSrc || images[0].src);
        return {name, id, ...(avatar ? {avatar} : {})};
      }
    }
  }
  let result = null;
  for (const element of elements.slice(0, 160)) {
    const key = Object.keys(element).find(
      (name) =>
        name.startsWith("__reactFiber$") ||
        name.startsWith("__reactInternalInstance$"),
    );
    let fiber = key && element[key];
    for (let hop = 0; fiber && hop < 12; hop++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const identities = [
        props?.currUser,
        props?.currentUser,
        props?.loggedInUser,
        props?.selfInfo,
        props?.me,
      ];
      if (props?.isSelf === true || props?.isMe === true)
        identities.push(props.user, props.userInfo);
      for (const identity of identities) {
        const name = identity?.displayName || identity?.dName || identity?.name;
        if (typeof name === "string" && name.trim())
          {
          const avatar = avatarSource(identity.avatar || identity.fullAvt || identity.avatarUrl);
          const candidate = { name: str(name.trim(), 100), id: str(identity.userId || identity.uid || identity.id, 160), ...(avatar ? {avatar} : {}) };
          if (!result) result = candidate;
          // Only merge separate rendered identity fragments using a stable ID.
          // Equal display names alone do not establish account ownership.
          else if (result.id && candidate.id === result.id && avatar)
            result = {...result, avatar};
          if (result.avatar) return result;
        }
      }
    }
  }
  if (result) return result;
  const account = String(title)
    .replace(/^\(\d+\)\s*/, "")
    .match(/^Zalo\s*-\s*(.+)$/i)?.[1]
    ?.trim();
  if (account && !/^(?:đăng nhập|login|sign in|zalo web)/i.test(account)) {
    return {name: str(account, 100), id: ""};
  }
  return {name: "", id: ""};
}

export function readAccountName(elements, title = "") {
  return readAccountIdentity(elements, title).name;
}

// The conversation list exposes only its most recent rendered preview. It is
// useful before opening a chat, but must never replace a complete bubble model.
export function readConversationPreview(element) {
  const key = Object.keys(element).find(
    (name) =>
      name.startsWith("__reactFiber$") ||
      name.startsWith("__reactInternalInstance$"),
  );
  let fiber = key && element[key];
  for (let hop = 0; fiber && hop < 12; hop++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    const preview = props?.previewMsg;
    const conversation = props?.conversation;
    if (!preview || !conversation) continue;
    if (preview.draft || preview.isSystemMsg || preview.isMissCall) return null;
    const text =
      typeof preview.message === "string" ? preview.message.trim() : "";
    const messageId = zaloMessageId(conversation.lastSmsLocalId);
    const conversationId = str(conversation.userId || props.userId);
    if (!text || !messageId || !conversationId || text.length > 12000)
      return null;
    const recalled =
      /^(?:tin nhắn (?:đã được thu hồi|đã thu hồi)|message (?:was recalled|has been recalled|deleted|unsent))\.?$/i.test(
        text,
      );
    // Image/video previews are descriptions without a file body or full model.
    if (!recalled && preview.icon) return null;
    return {
      event: recalled ? "recall" : "snapshot",
      messageId,
      clientId: "",
      conversationId,
      conversationName: str(
        props.displayName || conversation.displayName || conversation.name,
        100,
      ),
      conversationType:
        props.isGroup || conversation.isGroup ? "group" : "personal",
      sender: str(preview.dName, 100),
      isSelf: preview.dName === "Bạn" || preview.dName === "You",
      senderAvatar: "",
      conversationAvatar: avatarSource(props.avatar || conversation.avatar),
      text: recalled ? "" : text,
      kind: "text",
      attachments: [],
      sentAt: Number(preview.messageTime),
      source: "render-preview",
    };
  }
  return null;
}
