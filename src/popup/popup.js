import VideoPlayer from './VideoPlayer.jsx';
import SettingsIndex from './SettingsIndex.jsx';
import {SITE_ORIGINS,selectedOrigins} from '../core/platform-access.js';
import UpdateNotice from './UpdateNotice.jsx';
import IconPin from '@tabler/icons-react/dist/esm/icons/IconPin.mjs';
import IconNotes from '@tabler/icons-react/dist/esm/icons/IconNotes.mjs';
import IconHistory from '@tabler/icons-react/dist/esm/icons/IconHistory.mjs';
import {conversationExport} from '../core/conversation-export.js';
import {BACKUP_CHUNK_SIZE} from '../core/backup-transfer.js';
import {PLATFORMS, platformRecords} from '../core/platforms.js';
import React, { useState, useEffect, useMemo, useRef } from "react";
import IconArchive from "@tabler/icons-react/dist/esm/icons/IconArchive.mjs";
import IconMessageCircle from "@tabler/icons-react/dist/esm/icons/IconMessageCircle.mjs";
import IconInfoCircle from "@tabler/icons-react/dist/esm/icons/IconInfoCircle.mjs";
import IconSettings from "@tabler/icons-react/dist/esm/icons/IconSettings.mjs";
import IconAdjustmentsHorizontal from "@tabler/icons-react/dist/esm/icons/IconAdjustmentsHorizontal.mjs";
import IconSearch from "@tabler/icons-react/dist/esm/icons/IconSearch.mjs";
import IconHeart from "@tabler/icons-react/dist/esm/icons/IconHeart.mjs";
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs";
import IconDownload from "@tabler/icons-react/dist/esm/icons/IconDownload.mjs";
import IconCopy from "@tabler/icons-react/dist/esm/icons/IconCopy.mjs";
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs";
import IconMail from "@tabler/icons-react/dist/esm/icons/IconMail.mjs";
import IconWorld from "@tabler/icons-react/dist/esm/icons/IconWorld.mjs";
import IconBrandFacebook from "@tabler/icons-react/dist/esm/icons/IconBrandFacebook.mjs";
import IconShieldLock from "@tabler/icons-react/dist/esm/icons/IconShieldLock.mjs";
import IconArrowLeft from "@tabler/icons-react/dist/esm/icons/IconArrowLeft.mjs";
import IconPhoto from "@tabler/icons-react/dist/esm/icons/IconPhoto.mjs";
import IconSticker from "@tabler/icons-react/dist/esm/icons/IconSticker.mjs";
import IconVideo from "@tabler/icons-react/dist/esm/icons/IconVideo.mjs";
import IconClock from "@tabler/icons-react/dist/esm/icons/IconClock.mjs";
import IconGif from "@tabler/icons-react/dist/esm/icons/IconGif.mjs";
import IconFileDescription from "@tabler/icons-react/dist/esm/icons/IconFileDescription.mjs";
import IconVolume from "@tabler/icons-react/dist/esm/icons/IconVolume.mjs";
import { createRoot } from "react-dom/client";
import {
  MantineProvider,
  Menu,
  MultiSelect,
  Modal,
  Skeleton,
  Button,
  SegmentedControl,
  Switch,
  TextInput,
  PasswordInput,
  Textarea,
  Select,
  Checkbox,
  Badge,
  Avatar,
  Alert,
  Progress,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "./popup.css";
import { filterRecords } from "../core/model.js";
import { demoState } from "./demo.js";
import { feedbackEmailUrl, feedbackEmailText } from "../core/feedback.js";
import { RESOURCE_ORIGINS_BY_PLATFORM } from "../core/resources.js";
import { translate } from "./i18n.js";
import { captureStatus } from "./status.js";
import VaultGate from "./VaultGate.jsx";
import {PlatformLogo, WelcomeArt} from "./BrandMarks.jsx";
import {platformStatusLabel, platformStatusHint} from './status-label.js';
const params = new URLSearchParams(location.search),
  demo = params.get("demo") === "1";
if (params.has("popup")) document.documentElement.classList.add("action-popup");
const blankDraft = { category: "suggestion", email: "", message: "" };
async function request(message) {
  const r = await chrome.runtime.sendMessage(message);
  if (r?.error || !r) throw Error(r?.error || "Unavailable");
  return r;
}
function useAsset(record, role, index) {
  const item = role === "attachment" ? record?.attachments?.[index] : null;
  const source =
    role === "sender"
      ? record?.senderAvatar
      : role === "conversation"
        ? record?.conversationAvatar
        : role === "conversation-part" ? record?.conversationAvatars?.[index] || "" : item?.source || "";
  const cached =
    role === "attachment"
      ? item?.cached
      : role === "conversation-part" ? record?.conversationAvatarsCached?.[index] : record?.[
          role === "sender" ? "senderAvatarCached" : "conversationAvatarCached"
        ];
  const fallback = role === "attachment" || record?.platform === "facebook" ? "" : source || "";
  const [url, setUrl] = useState(fallback);
  useEffect(() => {
    let active = true,
      objectUrl;
    setUrl(fallback);
    if (cached && !demo)
      request({ type: "ASSET", recordId: record.id, role, index })
        .then((r) => {
          if (!active || !r.asset) return;
          const bytes = Uint8Array.from(atob(r.asset.data), (c) =>
            c.charCodeAt(0),
          );
          objectUrl = URL.createObjectURL(
            new Blob([bytes], { type: r.asset.mime }),
          );
          setUrl(objectUrl);
        })
        .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record?.id, role, index, source, cached]);
  return url;
}
function CompositeFace({record,size}) {
  const first=useAsset(record,'conversation-part',0),second=useAsset(record,'conversation-part',1);
  return <span className="group-collage" style={{width:size,height:size}} aria-hidden="true">
    <Avatar src={first||null} size={Math.round(size*.72)} radius="xl" color="blue" imageProps={{alt:''}} />
    <Avatar src={second||null} size={Math.round(size*.72)} radius="xl" color="blue" imageProps={{alt:''}} />
  </span>;
}
function Face({ record, role = "sender", size = 40 }) {
  const name = role === "sender" ? record.sender : record.conversationName;
  const url = useAsset(record, role);
  if(role==='conversation' && record.conversationAvatars?.length===2)return <CompositeFace record={record} size={size} />;
  return (
    <Avatar
      src={url || null}
      size={size}
      radius="xl"
      color="blue"
      imageProps={{ referrerPolicy: "no-referrer", alt: "" }}
      className={role === "conversation" ? "group-avatar" : ""}
    >
      {(name || "?")
        .split(/\s+/)
        .slice(-2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}
    </Avatar>
  );
}
function BrandLogo() {
  return (
    <span className="fsub-logo">
      <img src="assets/fsub-logo-transparent.png" alt="FSUB.vn - Digital Marketing Solutions" />
    </span>
  );
}
function messageAvailability(record) {
  if (!record.hasOriginal) return {label: 'originalUnavailable', available: false};
  if (['audio', 'file'].includes(record.kind)) return {label: 'fileMetadata', available: false};
  if (!['image', 'video', 'gif', 'sticker'].includes(record.kind))
    return {label: 'originalAvailable', available: true};
  const saved = (record.attachments || []).filter(item => item.cached);
  if (saved.some(item => !item.previewOnly)) return {label: 'fileSaved', available: true};
  return saved.length
    ? {label: 'preview', available: false}
    : {label: 'fileMissing', available: false};
}
function Media({ record, index, t, canRetry }) {
  const item = record.attachments[index],
    url = useAsset(record, "attachment", index);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retrying,setRetrying]=useState(false);
  const [retryError,setRetryError]=useState(false);
  useEffect(() => { setError(false); setExpanded(false); }, [url]);
  // GIFs can be delivered as video files; use the cached container type.
  const renderAs=item.mime ? (item.mime.startsWith("video/")?"video":item.mime.startsWith("audio/")?"audio":"image") : item.kind;
  return (
    <div
      className={
        "media-preview " + (item.kind === "sticker" ? "sticker-preview" : "")
      }
    >
      {item.cached ? (
        <>
          {renderAs === "video" ? (
            <VideoPlayer url={url} t={t} onError={()=>setError(true)} onReady={()=>setError(false)}
              onExpand={()=>setExpanded(true)}/>
          ) : renderAs === "audio" ? (
            <audio
              src={url || undefined}
              controls
              onError={() => setError(true)}
            />
          ) : (
            <>
              <button type="button" className="media-expand" disabled={!url || error}
                aria-label={t("expandImage")} onClick={() => setExpanded(true)}>
                <img src={url || undefined} alt={t(item.kind)} onError={() => setError(true)} />
              </button>
              <Modal opened={expanded} onClose={() => setExpanded(false)} title={t(item.kind)}
                closeButtonProps={{"aria-label": t("closeImage")}} size="xl" centered>
                <img className="expanded-image" src={url || undefined} alt={t(item.kind)} />
              </Modal>
            </>
          )}
          {renderAs === 'video' && url && <Modal opened={expanded} onClose={()=>setExpanded(false)} title={t('video')}
            closeButtonProps={{'aria-label':t('closeVideo')}} size="xl" centered>
            {expanded&&<VideoPlayer url={url} t={t} expanded onError={()=>setError(true)} onReady={()=>setError(false)}/>}
          </Modal>}
          <p className="muted media-note">
            {t(error ? "mediaError" : item.previewOnly ? "preview" : "cached")}
          </p>
          {url&&<a className="media-download" href={url} download={'StillHere-'+record.messageId+'-'+(index+1)+'.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','audio/mpeg':'mp3','audio/ogg':'ogg'}[item.mime]||'bin')}><IconDownload size={14} aria-hidden="true"/>{t('downloadSavedFile')}</a>}
        </>
      ) : (
        <div className="media-unavailable">
          <p className="muted media-note" role="status">{t(item.pending ? "filePending" : "noFile")}</p>
          {!item.pending&&canRetry&&/^https:\/\//.test(item.source||'')&&<Button size="xs" variant="default" loading={retrying} onClick={async()=>{setRetrying(true);setRetryError(false);try{const result=await request({type:'MEDIA_RETRY'});if(!result.ok)throw Error('retry denied');}catch{setRetryError(true);}finally{setRetrying(false);}}}>{t('retryMedia')}</Button>}
          {retryError&&<p role="alert">{t('error')}</p>}
        </div>
      )}
    </div>
  );
}
function App() {
  useEffect(() => {
    // Chrome closes action popups on Escape unless the key is cancelled.
    // Leave propagation intact so Mantine can close its active overlay and
    // restore focus before Chrome handles the popup's native Escape action.
    let overlayEscape = false;
    const containOverlayEscape = (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      // A modal may unmount on keydown. Still cancel the matching keyup so
      // Chrome does not dismiss its action popup after closing that modal.
      if (event.type === 'keyup' && overlayEscape) {
        overlayEscape = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const openOverlay = Array.from(document.querySelectorAll('[role="dialog"], [role="listbox"], [aria-haspopup="listbox"][aria-expanded="true"]'))
        .some(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
      if (openOverlay) { event.preventDefault(); overlayEscape = event.type === 'keydown'; }
    };
    window.addEventListener('keydown', containOverlayEscape, true);
    window.addEventListener('keyup', containOverlayEscape, true);
    return () => {
      window.removeEventListener('keydown', containOverlayEscape, true);
      window.removeEventListener('keyup', containOverlayEscape, true);
    };
  }, []);
  const [moreOpened, setMoreOpened] = useState(false);
  const moreTarget = useRef(null);
  useEffect(() => {
    if (!moreOpened) return;
    const dismissMenu = (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setMoreOpened(false);
      moreTarget.current?.focus();
    };
    window.addEventListener('keydown', dismissMenu, true);
    return () => window.removeEventListener('keydown', dismissMenu, true);
  }, [moreOpened]);
  const [diagnostics,setDiagnostics]=useState(null);
  const [diagnosticError,setDiagnosticError]=useState(false);
  const [senderFilter,setSenderFilter]=useState('');
  const [accountFilter,setAccountFilter]=useState('all');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [pinnedOnly,setPinnedOnly]=useState(false);
  const [noteDraft,setNoteDraft]=useState('');
  const [noteOpen,setNoteOpen]=useState(false);
  const [annotationBusy,setAnnotationBusy]=useState(false);
  const [platformChoice,setPlatformChoice]=useState('both');

  const [platform, setPlatform] = useState(params.get("platform") === "facebook" ? "facebook" : "zalo");
  const [state, setState] = useState(null),
    [language, setLanguage] = useState(
      params.get("lang") === "en" ? "en" : "vi",
    ),
    [type, setType] = useState("all"),
    [who, setWho] = useState("all"),
    [kind, setKind] = useState("all"),
    [query, setQuery] = useState("");
  const [view, setView] = useState(
      ["settings", "feedback", "about", "support", "diagnostics"].includes(params.get("view"))
        ? params.get("view")
        : params.has("settings")
          ? "settings"
          : params.has("feedback")
            ? "feedback"
            : "archive",
    ),
    [selected, setSelected] = useState(null),
    [mobileDetail, setMobileDetail] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [ready, setReady] = useState(false),
    [clear, setClear] = useState(false);
  const [draft, setDraft] = useState(blankDraft),
    [draftStatus, setDraftStatus] = useState(""),
    [feedbackConsent, setFeedbackConsent] = useState(false),
    [feedbackResult, setFeedbackResult] = useState(""),
    [copied, setCopied] = useState(false);
  const draftEpoch = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const settingsPending = useRef(false),
    settingsEpoch = useRef(0);
  const t = (key) => {
    if (platform === "facebook" && key === "accountUnknown") return language === "en"
      ? "Connected to Messenger. Only messages rendered in the open conversation can be saved."
      : "Đã kết nối Messenger. Chỉ lưu được tin nhắn đã hiển thị trong hội thoại đang mở.";
    const value = translate(language, key);
    const scoped = ["waiting", "connected", "offline", "reconnecting", "liveHint", "connectedHint", "waitingHint", "reconnectingHint", "offlineHint", "emptyCopy", "startCopy"];
    return platform === "facebook" && scoped.includes(key) ? value.replaceAll("Zalo Web", "Messenger").replaceAll("chat.zalo.me", "messenger.com") : value;
  },
    locale = language === "en" ? "en-GB" : "vi-VN";
  function receive(incoming) {
    setState((previous) => ({
      ...incoming,
      records:
        previous &&
        JSON.stringify(previous.records) === JSON.stringify(incoming.records)
          ? previous.records
          : incoming.records,
    }));
  }
  async function refresh(force = false) {
    if (!force && viewRef.current !== "archive") return;
    if (!force && Array.from(document.querySelectorAll('[role="listbox"], [aria-haspopup="listbox"][aria-expanded="true"]')).some(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')) return;
    if (settingsPending.current && !force) return;
    const epoch = settingsEpoch.current;
    try {
      const incoming = demo ? demoState() : await request({ type: "STATE" });
      if (
        epoch === settingsEpoch.current &&
        (!settingsPending.current || force)
      )
        receive(incoming);
    } catch {
      setError("error");
    }
  }
  useEffect(() => {
    let disposed = false;
    Promise.all([
      demo
        ? Promise.resolve({
            preferences: {
              language: params.get("lang") === "en" ? "en" : "vi",
              type: "all",
              who: "all",
            },
            draft: blankDraft,
          })
        : request({ type: "UI_READ" }),
      demo ? Promise.resolve(demoState()) : request({ type: "STATE" }),
    ])
      .then(([ui, data]) => {
        if (disposed) return;
        setLanguage(ui.preferences.language);
        setType(ui.preferences.type);
        setWho(ui.preferences.who);
        setKind(ui.preferences.kind || "all");
        setPinnedOnly(ui.preferences.pinnedOnly === true);
        setDraft(ui.draft);
        if (ui.draft.message) setDraftStatus("draftSaved");
        receive(data);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) {
          setReady(true);
          setError("error");
        }
      });
    const timer = demo ? null : setInterval(refresh, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (demo) return;
    const refreshAccess = () => { void refresh(true); };
    const refreshVisible = () => {
      if (!document.hidden) refreshAccess();
    };
    chrome.permissions.onAdded.addListener(refreshAccess);
    chrome.permissions.onRemoved.addListener(refreshAccess);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      chrome.permissions.onAdded.removeListener(refreshAccess);
      chrome.permissions.onRemoved.removeListener(refreshAccess);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("app");
  }, [language]);
  useEffect(() => {
    if (ready && !demo)
      request({ type: "UI_WRITE", preferences: { language, type, who, kind, pinnedOnly } }).catch(
        () => setError("error"),
      );
  }, [language, type, who, kind, pinnedOnly, ready]);
  const records = useMemo(
    () => filterRecords(platformRecords(state?.records || [], platform), { query, type, who, kind, pinnedOnly, sender:senderFilter, account:accountFilter, from:dateFrom, to:dateTo }),
    [state?.records, query, type, who, kind, pinnedOnly, platform, senderFilter, accountFilter, dateFrom, dateTo],
  );
  const recalledTotal = platformRecords(state?.records || [], platform)
    .filter(record => record.recalledAt).length;
  const activeFilters = [
    query && {label:query,clear:()=>setQuery('')},
    type!=='all' && {label:t(type),clear:()=>setType('all')},
    who!=='all' && {label:t(who),clear:()=>setWho('all')},
    kind!=='all' && {label:t(kind),clear:()=>setKind('all')},
    pinnedOnly && {label:t('pinnedOnly'),clear:()=>setPinnedOnly(false)},
    senderFilter && {label:senderFilter,clear:()=>setSenderFilter('')},
    accountFilter!=='all' && {label:accountFilter==='legacy'?t('legacyAccount'):(state?.records.find(r=>r.accountScope===accountFilter)?.accountName||t('unknownAccount')),clear:()=>setAccountFilter('all')},
    dateFrom && {label:t('recalledFrom')+': '+dateFrom,clear:()=>setDateFrom('')},
    dateTo && {label:t('recalledTo')+': '+dateTo,clear:()=>setDateTo('')}
  ].filter(Boolean);
  useEffect(() => {
    setSelected((previous) =>
      records.some((r) => r.id === previous)
        ? previous
        : records[0]?.id || null,
    );
  }, [records]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const archiveReady = view === "archive" && !!state?.settings.consent;
  useEffect(() => {
    if (!archiveReady) return;
    const frame = requestAnimationFrame(() => document.getElementById("search")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [archiveReady, platform]);
  const current = records.find((r) => r.id === selected) || records[0];
  useEffect(()=>{setNoteDraft(current?.note||'');setNoteOpen(false);},[current?.id,current?.note]);
  async function annotate(patch){
    if(!current||demo)return;
    setAnnotationBusy(true);
    try{const result=await request({type:'ANNOTATE',recordId:current.id,...patch});if(result.ok!==true)throw Error('Annotation was not accepted');const incoming=await request({type:'STATE'});const saved=incoming.records?.find(r=>r.id===current.id);if(!saved||Object.entries(patch).some(([key,value])=>saved[key]!==value))throw Error('Annotation not confirmed');receive(incoming);setError('');setNotice(patch.note!==undefined?'noteSaved':patch.pinned?'pinSaved':'pinRemoved');}
    catch{setError('annotationUnconfirmed');}finally{setAnnotationBusy(false);}
  }
  const [exportConversation,setExportConversation]=useState(false);
  function downloadConversation(format){
    if(!current)return;
    const file=conversationExport(state.records,platform,current.conversationId,format,language,current.accountScope||'');
    const url=URL.createObjectURL(new Blob([file.content],{type:file.mime}));
    const a=document.createElement('a');a.href=url;a.download='stillhere-conversation.'+file.extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportConversation(false);
  }
  const [backupMode,setBackupMode]=useState(null);
  const [backupPassword,setBackupPassword]=useState('');
  const [backupConfirm,setBackupConfirm]=useState('');
  const [backupFile,setBackupFile]=useState(null);
  const [backupBusy,setBackupBusy]=useState(false);
  const [backupError,setBackupError]=useState('');
  function closeBackup(){if(backupBusy)return;setBackupMode(null);setBackupPassword('');setBackupConfirm('');setBackupFile(null);setBackupError('');}
  function exportBackup(){if(!demo){setBackupError('');setBackupMode('export');}}
  async function importBackup(event){
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file||demo)return;
    setBackupError('');setBackupMode('import');
    try{if(file.size>200*1024*1024)throw Error();setBackupFile({name:file.name,data:JSON.parse(await file.text())});}
    catch{setBackupFile(null);setBackupError('backupInvalid');}
  }
  async function submitBackup(event){
    event.preventDefault();setBackupError('');
    if(!(backupMode==='import'&&backupFile?.data?.format==='stillhere-conversation')&&(backupPassword.length<6||backupPassword.length>256)){setBackupError('vaultPasswordLength');return;}
    if(backupMode==='export'&&backupPassword!==backupConfirm){setBackupError('vaultMismatch');return;}
    setBackupBusy(true);
    try{
      if(backupMode==='export'){
        const {token,size}=await request({type:'BACKUP_EXPORT_MEDIA',password:backupPassword});
        const parts=[];
        try{
          for(let offset=0;offset<size;offset+=BACKUP_CHUNK_SIZE){
            const {part}=await request({type:'BACKUP_TRANSFER_READ',token,offset});
            if(typeof part!=='string'||part.length!==Math.min(BACKUP_CHUNK_SIZE,size-offset))throw Error('Incomplete backup');
            parts.push(part);
          }
        }finally{await request({type:'BACKUP_TRANSFER_CANCEL',token}).catch(()=>{});}
        const url=URL.createObjectURL(new Blob(parts,{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='stillhere-encrypted-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('backupExported');
      }else{
        if(backupFile.data.format==='stillhere-conversation')await request({type:'BACKUP_IMPORT',backup:backupFile.data,password:backupPassword});
        else {
          const serialized=JSON.stringify(backupFile.data);
          const {token}=await request({type:'BACKUP_TRANSFER_BEGIN',size:serialized.length});
          try{
            for(let offset=0,index=0;offset<serialized.length;offset+=BACKUP_CHUNK_SIZE,index++)await request({type:'BACKUP_TRANSFER_CHUNK',token,index,part:serialized.slice(offset,offset+BACKUP_CHUNK_SIZE)});
            await request({type:'BACKUP_TRANSFER_COMMIT',token,password:backupPassword});
          }finally{await request({type:'BACKUP_TRANSFER_CANCEL',token}).catch(()=>{});}
        }
        await refresh(true);setNotice('backupImported');setSelected(null);
      }
      setBackupMode(null);setBackupPassword('');setBackupConfirm('');setBackupFile(null);
    }catch{setBackupError('backupFailed');}finally{setBackupBusy(false);}
  }

  async function saveRules(rules){
    if(demo)return;
    setBusy(true);try{const result=await request({type:'CONVERSATION_RULES',rules});if(result.ok!==true)throw Error('Rules not saved');await refresh(true);setNotice('annotationSaved');}catch{setError('error');}finally{setBusy(false);}
  }
  async function settings(values) {
    settingsEpoch.current++;
    settingsPending.current = true;
    const previousSettings = state.settings;
    setState((previous) => ({
      ...previous,
      settings: { ...previous.settings, ...values },
    }));
    setBusy(true);
    try {
      const result = await request({ type: "SETTINGS", ...state.settings, ...values });
      if (result.ok !== true) throw Error("Settings rejected");
      const confirmed = await request({type:"STATE"});
      if (!confirmed.settings || Object.entries(values).some(([key,value]) => JSON.stringify(confirmed.settings[key]) !== JSON.stringify(value))) throw Error("Settings not confirmed");
      receive(confirmed);
      setError("");
      if (typeof values.enabled === "boolean") setNotice(values.enabled ? "captureEnabled" : "capturePaused");
    } catch {
      setState((previous) => ({ ...previous, settings: previousSettings }));
      setError("error");
    } finally {
      settingsPending.current = false;
      setBusy(false);
    }
  }
  async function choosePlatforms(value){
    if(demo)return;const platforms=value==='both'?['zalo','facebook']:[value];
    try{const granted=await chrome.permissions.request({origins:selectedOrigins(platforms,state.settings.cacheMedia)});if(!granted){setError('platformPermissionDenied');return;}await settings({platforms});}catch{setError('permission');}
  }
  async function resources() {
    try {
      if (await chrome.permissions.request({ origins: selectedOrigins([platform]) }))
        await settings({ cacheMedia: true });
      else setError("permission");
    } catch {
      setError("error");
    }
  }
  async function openPlatform(selectedPlatform) {
    try {
      const result = await request({ type: "OPEN_PLATFORM_TAB", platform: selectedPlatform });
      if (!result.ok) setError("chatTabUnavailable");
    } catch {
      setError("chatTabUnavailable");
    }
  }
  function changeDraft(values) {
    const next = { ...draft, ...values };
    setDraft(next);
    setFeedbackResult("");
    if (!demo) {
      setDraftStatus("draftSaving");
      const epoch = ++draftEpoch.current;
      request({ type: "DRAFT_WRITE", draft: next })
        .then(result => {
          if (result.ok !== true) throw Error("Draft not confirmed");
          if (epoch === draftEpoch.current) setDraftStatus("draftSaved");
        })
        .catch(() => {
          if (epoch === draftEpoch.current) setDraftStatus("draftSaveFailed");
        });
    }
  }
  async function clearDraft() {
    try {
      if (!demo) {
        const result = await request({ type: "DRAFT_CLEAR" });
        if (result.ok !== true) throw Error("Draft deletion not confirmed");
      }
    } catch {
      setError("error");
      return;
    }
    ++draftEpoch.current;
    setDraft(blankDraft);
    setFeedbackConsent(false);
    setDraftStatus("");
    setFeedbackResult("");
  }
  async function sendFeedback(e) {
    e.preventDefault();
    if (demo || !feedbackConsent) return;
    try {
      const url = feedbackEmailUrl(
        { ...draft, consent: feedbackConsent },
        chrome.runtime.getManifest().version,
        language,
      );
      await chrome.tabs.create({ url });
      setFeedbackResult("openedEmail");
    } catch {
      setFeedbackResult("emailComposeError");
    }
  }
  async function copyFeedback() {
    if (demo) return;
    try {
      const text = feedbackEmailText(draft, chrome.runtime.getManifest().version, language);
      await navigator.clipboard.writeText(text);
      setFeedbackResult("feedbackCopied");
    } catch {
      setFeedbackResult("feedbackCopyError");
    }
  }
  useEffect(() => { document.getElementById("main-content")?.scrollTo({top:0,behavior:"instant"}); }, [view]);
  const go = (next) => {
    // Archive polling stops on other views. Refresh access and heartbeat when
    // opening a surface that displays them instead of retaining the old state.
    viewRef.current = next;
    if (["archive", "settings", "diagnostics"].includes(next)) void refresh(true);
    setView(next);
    setError("");
    setMobileDetail(false);
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.delete("settings");
    url.searchParams.delete("feedback");
    url.searchParams.delete("view");
    if (next !== "archive") url.searchParams.set("view", next);
    history.replaceState(null, "", url);
    requestAnimationFrame(() =>
      document
        .getElementById("main-content")
        ?.scrollTo({ top: 0, behavior: "auto" }),
    );
  };
  useEffect(()=>{const allowed=state?.settings.platforms;if(allowed?.length&&!allowed.includes(platform))setPlatform(allowed[0]);},[state?.settings.platforms,platform]);
  const active = state?.settings.consent && state?.settings.enabled;
  const platformHealth = (state?.health || []).filter(entry => (entry.platform || "zalo") === platform);
  const status = captureStatus(state && {...state, siteAccess:state.sitePermissions?.[platform], health:platformHealth, tabs:state.tabsByPlatform?.[platform] || 0}, demo);
  const accounts = [
    ...new Set(
      platformHealth
        .filter((entry) => entry.online && entry.accountName)
        .map((entry) => entry.accountName),
    ),
  ];
  useEffect(()=>{
    if(view!=='diagnostics')return;
    let live=true;
    const poll=async()=>{try{const result=demo?{tabs:[],saving:false,mediaEnabled:false}:await request({type:'DIAGNOSTICS'});if(!Array.isArray(result?.tabs))throw Error('Invalid diagnostics response');if(live){setDiagnostics({...result,tabs:result.tabs.filter(tab=>tab&&PLATFORMS[tab.platform])});setDiagnosticError(false);}}catch{if(live)setDiagnosticError(true);}};
    void poll();const timer=setInterval(poll,5000);return ()=>{live=false;clearInterval(timer);};
  },[view]);
  const nav = [
    ["archive", t("archive"), IconArchive],
    ["feedback", t("feedback"), IconMessageCircle],
    ["about", t("about"), IconInfoCircle],
    ["diagnostics", t("diagnostics"), IconShieldLock],
    ["settings", t("settings"), IconSettings],
  ];
  return (
    <div className="app-shell">
      <Modal opened={exportConversation} onClose={()=>setExportConversation(false)} title={t('conversationExport')} centered>
        <p>{current?.conversationName}</p><Alert color="orange">{t('conversationExportWarning')}</Alert>
        <Button mt="md" mr="sm" onClick={()=>downloadConversation('json')}>JSON</Button>
        <Button mt="md" variant="light" onClick={()=>downloadConversation('html')}>HTML</Button>
      </Modal>
      <Modal opened={!!backupMode} onClose={closeBackup} closeOnClickOutside={!backupBusy} closeOnEscape={!backupBusy} title={t(backupMode==='export'?'backupExport':'backupImport')} centered>
        <form onSubmit={submitBackup}>
          <p>{t(backupMode==='import'&&backupFile?.data?.format==='stillhere-conversation'?'plainImportScope':'backupScope')}</p>
          {backupMode==='import'&&<p>{backupFile?.name}<br/>{t('backupMerge')}</p>}
          {!(backupMode==='import'&&backupFile?.data?.format==='stillhere-conversation')&&<PasswordInput data-autofocus label={t('vaultPassword')} value={backupPassword} onChange={e=>setBackupPassword(e.currentTarget.value)} minLength={6} maxLength={256} required disabled={backupBusy} autoComplete="off"/>}
          {backupMode==='export'&&<PasswordInput mt="sm" label={t('vaultConfirm')} value={backupConfirm} onChange={e=>setBackupConfirm(e.currentTarget.value)} required disabled={backupBusy} autoComplete="off"/>}
          {backupError&&<Alert mt="sm" color="red" role="alert">{t(backupError)}</Alert>}
          <Button mt="md" type="submit" loading={backupBusy} disabled={backupMode==='import'&&!backupFile}>{t(backupMode==='export'?'backupExport':'backupImport')}</Button>
        </form>
      </Modal>
      {notice && <div className="action-notice" role="status">{t(notice)}</div>}
      <header>
        <div className="product">
          <h1 className="product-wordmark">
            <img src="assets/stillhere-logo-transparent.png" alt="StillHere – Unsend Message Viewer" width="1960" height="532" />
          </h1>
          <span className="product-description">Unsend Message Viewer</span>
        </div>
        <nav className="primary-nav" aria-label={language==='en'?'Main navigation':'Điều hướng chính'}>
          {nav.filter(([key])=>['archive','diagnostics','settings'].includes(key)).map(([key,label,NavIcon])=><button id={key+'-button'} key={key} className={'nav-button '+(view===key?'selected':'')} aria-current={view===key?'page':undefined} aria-pressed={view===key} onClick={()=>go(key)}><NavIcon size={15} aria-hidden="true"/>{key==='archive'?(language==='en'?'Messages':'Tin nhắn'):key==='diagnostics'?(language==='en'?'Connection':'Kết nối'):label}</button>)}
        </nav>
        <div className="header-actions">
          <SegmentedControl
            aria-label="Language / Ngôn ngữ"
            value={language}
            onChange={setLanguage}
            data={[
              { label: "VI", value: "vi" },
              { label: "EN", value: "en" },
            ]}
            size="xs"
          />
          <Menu position="bottom-end" withinPortal opened={moreOpened} onChange={setMoreOpened}>
            <Menu.Target><Button ref={moreTarget} variant="subtle" className="more-menu" aria-label={language==='en'?'More options':'Tuỳ chọn khác'}>{language==='en'?'More':'Thêm'}</Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item id="feedback-button" leftSection={<IconMessageCircle size={16}/>} onClick={()=>go('feedback')}>{t('feedback')}</Menu.Item>
              <Menu.Item id="about-button" leftSection={<IconInfoCircle size={16}/>} onClick={()=>go('about')}>{t('about')}</Menu.Item>
              <Menu.Item component="a" href={language==='en'?'privacy-en.html':'privacy.html'} target="_blank" rel="noreferrer" leftSection={<IconShieldLock size={16}/>} >{t('privacy')}</Menu.Item>
              <Menu.Item component="a" href={language==='en'?'changelog-en.html':'changelog.html'} target="_blank" rel="noreferrer" leftSection={<IconHistory size={16}/>}>{language==='en'?'Version history':'Lịch sử phiên bản'}</Menu.Item><Menu.Divider/><Menu.Label>StillHere {chrome.runtime.getManifest().version}</Menu.Label>
            </Menu.Dropdown>
          </Menu>
        </div>
      </header>
      <div className="workspace">
        <main
          id="main-content"
          className={view === "archive" ? "archive-main" : "page-main"}
        >
          {!demo&&<UpdateNotice language={language}/>}
          {error && (
            <Alert
              color="red"
              className="error"
              withCloseButton
              onClose={() => setError("")}
              role="alert"
            >
              {t(error)}
            </Alert>
          )}
          {!state ? (
            <div className="loading">
              <Skeleton height={18} width="65%" animate={!ready} />
              <Skeleton height={12} mt={12} animate={!ready} />
              <Skeleton height={12} mt={8} width="85%" animate={!ready} />
              <p>{ready ? t("error") : "FSUB.vn"}</p>
              <Button variant="light" onClick={() => location.reload()}>
                {language === "en" ? "Reload" : "Tải lại"}
              </Button>
            </div>
          ) : (
            <>
              {demo && (
                <div id="demo-bar" className="demo-bar">
                  {t("demo")}
                  <button
                    id="exit-demo"
                    onClick={() => (location.href = "popup.html")}
                  >
                    {t("exit")}
                  </button>
                </div>
              )}
              {view === "archive" &&
                (!state.settings.consent && !demo ? (
                  <section id="onboarding" className="onboarding view-enter">
                    <div className="onboarding-copy">
                    <div className="platform-pair" aria-label="Zalo, Facebook">
                      <span><PlatformLogo platform="zalo" />Zalo</span>
                      <span><PlatformLogo platform="facebook" />Facebook</span>
                    </div>
                    <h2>{t("start")}</h2>
                    <p>{t("startCopy")}</p>
                    <Select label={language==='en'?'Which platforms do you use?':'Bạn muốn dùng nền tảng nào?'} value={platformChoice} onChange={setPlatformChoice} allowDeselect={false} data={[{value:'both',label:language==='en'?'Zalo and Facebook':'Zalo và Facebook'},{value:'zalo',label:'Zalo'},{value:'facebook',label:'Facebook / Messenger'}]} mb="md" />
                    <p>{language==='en'?'Continue to grant attachment access for your selected platforms. Saved text can also appear beside an unsent message while unlocked.':'Tiếp tục để cấp quyền lưu tệp cho nền tảng đã chọn. Nội dung đã lưu cũng hiện cạnh tin bị gỡ khi tiện ích đang mở khoá.'}</p>
                    <div className="consent">
                      <Checkbox
                        id="consent"
                        label={t("consent")}
                        checked={consent}
                        onChange={(e) => setConsent(e.currentTarget.checked)}
                      />
                      <a
                        href={
                          language === "en" ? "privacy-en.html" : "privacy.html"
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("privacy")}
                      </a>
                    </div>
                    <p className="setup-permission-copy">{language==='en'?'Chrome will ask for access only to your selected platforms and their file servers. Existing tabs connect automatically after you allow access.':'Chrome sẽ hỏi quyền truy cập đúng nền tảng bạn chọn và máy chủ tải tệp của nền tảng đó. Tab đang mở sẽ tự kết nối sau khi bạn cho phép.'}</p>
                    <div className="row">
                      <Button
                        id="enable"
                        disabled={!consent || busy}
                        onClick={async () => {
                          const platforms=platformChoice==='both'?['zalo','facebook']:[platformChoice];
                          const origins=selectedOrigins(platforms);
                          const granted=await chrome.permissions.request({origins}).catch(()=>false);
                          if (!granted) {
                            setError('setupPermissionDenied');
                            return;
                          }
                          await settings({consent:true,enabled:true,retentionDays:30,platforms,cacheMedia:true});
                        }}
                      >
                        {t("enable")}
                      </Button>
                    </div>
                    <p className="local-note"><IconShieldLock size={16} aria-hidden="true" />{t("local")}</p>
                    </div>
                    <WelcomeArt />
                  </section>
                ) : (
                  <section
                    id="archive"
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && mobileDetail && innerWidth <= 700 && !event.target.closest?.('[role="dialog"]')) {
                        event.preventDefault();
                        setMobileDetail(false);
                        requestAnimationFrame(() => document.querySelector(".message.current")?.focus());
                      }
                    }}
                    className={"archive " + (mobileDetail ? "show-detail" : "")}
                  >
                    <div className="archive-connection"><div className="platform-bar">
            <div className="platform-picker" role="group" aria-label={t("platformLabel")}>
              {(state?.settings.platforms || ["zalo", "facebook"]).map((next) => <button key={next}
                id={next === "facebook" ? "facebook-button" : "zalo-button"}
                className={"platform-option " + (platform === next ? "selected" : "")}
                aria-pressed={platform === next}
                onClick={() => {
                  setPlatform(next); setSelected(null); setQuery(""); setSenderFilter(''); go("archive");
                  const url = new URL(location.href); url.searchParams.set("platform", next); history.replaceState(null, "", url);
                }}>
                <PlatformLogo platform={next} /><span>{next === "zalo" ? "Zalo" : "Facebook"}</span>
              </button>)}
            </div>
<div className="capture-control">                        <Switch
                          id="capture-toggle"
                          label={t("capture")}
                          checked={!!active}
                          disabled={demo || busy}
                          onChange={(e) =>
                            settings({ enabled: e.currentTarget.checked })
                          }
                          size="sm"
                        />
</div></div>
                    <div
                      className={"archive-status status-" + status} hidden={demo}
                      role="status"
                    >
                      <span className="connection-platform"><PlatformLogo platform={platform} /></span>
                      <span className="status-dot" aria-hidden="true" />
                      <div className="status-copy">
                        <strong id="status">
                          {platformStatusLabel(status, platform, language)}
                          {accounts.length > 0 &&
                            ["live", "connected", "background"].includes(status) && (
                              <span className="account-label">
                                {" "}
                                · {accounts.join(", ")}
                              </span>
                            )}
                        </strong>
                        <span title={platformStatusHint(status, platform, language)}>
                          {["live", "connected"].includes(status) && !accounts.length
                            ? t("accountUnknown")
                            : platformStatusHint(status, platform, language)}
                        </span>
                      </div>
                      {status==='permissionMissing'&&<Button size="xs" variant="default" onClick={()=>go('settings')}>{language==='en'?'Grant access':'Cấp quyền'}</Button>}
                      {["waiting", "offline", "reconnecting", "connected", "background"].includes(status) && (
                        <Button
                          onClick={()=>openPlatform(platform)}
                          leftSection={<PlatformLogo platform={platform} />}
                          variant="default"
                          size="xs"
                        >
                          {platform === "facebook" ? (language === "en" ? "Open Messenger" : "Mở Messenger") : t("openZalo")}
                        </Button>
                      )}
                    </div>
                    </div>
                    <div className="archive-tools">
                      <div className="search-row">
                        <TextInput
                          leftSection={
                            <IconSearch size={14} aria-hidden="true" />
                          }
                          id="search"
                          aria-label={t("search")}
                          placeholder={t("search")}
                          value={query}
                          onChange={(e) => setQuery(e.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              document.querySelector(".message")?.click();
                            }
                          }}
                          size="xs"
                        />
                      </div>
                      <Button className="filter-toggle" variant="subtle" size="xs"
                        leftSection={<IconAdjustmentsHorizontal size={16} aria-hidden="true" />}
                        aria-expanded={filtersOpen} aria-controls="archive-filters"
                        onClick={() => setFiltersOpen(value => !value)}>
                        {t("filters")}{(type !== "all" || who !== "all" || kind !== "all" || pinnedOnly || accountFilter!=='all' || senderFilter || dateFrom || dateTo) ? ` · ${Number(type !== "all") + Number(who !== "all") + Number(kind !== "all") + Number(pinnedOnly) + Number(accountFilter!=='all') + Number(!!senderFilter) + Number(!!dateFrom) + Number(!!dateTo)}` : ""}
                      </Button>
                      {!!activeFilters.length&&<div className="active-filters" aria-label={t('filters')}>
                        {activeFilters.map((filter,index)=><button key={index} onClick={filter.clear} aria-label={(language==='en'?'Remove filter: ':'Bỏ bộ lọc: ')+filter.label}>{filter.label}<span aria-hidden="true"> ×</span></button>)}
                        <button className="clear-filters" onClick={()=>activeFilters.forEach(filter=>filter.clear())}>{t('resetFilters')}</button>
                      </div>}
                      <div id="archive-filters" className={"filter-row" + (filtersOpen ? " filters-open" : "")}>
                        <Select id="account-filter" label={t('savedAccount')} value={accountFilter} onChange={value=>setAccountFilter(value||'all')} data={[{value:'all',label:t('allAccounts')},...[...new Map(platformRecords(state?.records||[],platform).map(r=>[r.accountScope||'legacy',{value:r.accountScope||'legacy',label:r.accountScope?(r.accountName||t('unknownAccount'))+' · '+r.accountScope.slice(0,6):t('legacyAccount')}])).values()]]} size="xs"/>
                        <Select id="sender-filter" label={t('specificSender')} searchable clearable value={senderFilter||null} onChange={value=>setSenderFilter(value||'')} data={[...new Set(platformRecords(state?.records||[],platform).map(r=>r.sender).filter(Boolean))].sort()} size="xs"/>
                        <TextInput id="date-from" type="date" label={t('recalledFrom')} value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.currentTarget.value)} size="xs"/>
                        <TextInput id="date-to" type="date" label={t('recalledTo')} value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.currentTarget.value)} size="xs"/>
                        <Button variant="subtle" size="xs" onClick={()=>{setType('all');setWho('all');setKind('all');setPinnedOnly(false);setAccountFilter('all');setSenderFilter('');setDateFrom('');setDateTo('');setQuery('');}}>{t('resetFilters')}</Button>
                      <Checkbox label={t('pinnedOnly')} checked={pinnedOnly} onChange={e=>setPinnedOnly(e.currentTarget.checked)}/>
                        <SegmentedControl
                          aria-label={t("conversation")}
                          size="xs"
                          value={type}
                          onChange={setType}
                          data={["all", "personal", "group"].map((v) => ({
                            label: t(v),
                            value: v,
                          }))}
                        />
                        <Select
                          allowDeselect={false}
                          id="kind"
                          aria-label={t("contentType")}
                          value={kind}
                          onChange={(value) => setKind(value || "all")}
                          data={["all", "text", "media", "image", "video", "gif", "sticker", "audio", "file"].map((v) => ({
                            label: t(v === "all" ? "contentType" : v), value: v,
                          }))}
                          size="xs"
                        />
                        <Select
                          allowDeselect={false}
                          comboboxProps={{
                            transitionProps: {
                              transition: "fade",
                              duration: 140,
                            },
                          }}
                          id="who"
                          aria-label={t("who")}
                          value={who}
                          onChange={(value) => setWho(value || "all")}
                          data={["all", "others", "self"].map((v) => ({
                            label: v === "all" ? t("who") + ": " + t(v) : t(v),
                            value: v,
                          }))}
                          size="xs"
                        />
                      </div>
                    </div>
                    <div className="archive-panes">
                      <div
                        id="messages"
                        className="message-list"
                        aria-label={t("archive")}
                      >
                        <div className="list-heading"><span>{t("archive")}</span><span>{language==='en'?'Showing ':'Hiển thị '}{records.length} / {recalledTotal}</span></div>
                        {records.length ? (
                          records.map((r) => {
                            const availability = messageAvailability(r);
                            return (
                            <button
                              key={r.id}
                              className={
                                "message " +
                                (current?.id === r.id ? "current" : "")
                              }
                              data-record-id={r.messageId}
                              aria-pressed={current?.id === r.id}
                              onClick={() => {
                                setSelected(r.id);
                                setMobileDetail(true);
                                if (innerWidth <= 700)
                                  requestAnimationFrame(() =>
                                    document
                                      .querySelector(".detail-header h2")
                                      ?.focus(),
                                  );
                              }}
                            >
                              <Face record={r} role={r.conversationType === "group" ? "conversation" : "sender"} size={34} />
                              <div className="message-info">
                                <div className="sender-line">
                                  <strong>{r.pinned&&<IconPin size={13} aria-label={language==='en'?'Important':'Quan trọng'}/>} {r.sender}</strong>
                                  <time>
                                    {new Date(r.recalledAt).toLocaleTimeString(
                                      locale,
                                      { hour: "2-digit", minute: "2-digit" },
                                    )}
                                  </time>
                                </div>
                                {(r.conversationType === "group" || r.conversationName !== r.sender) && <div className="conversation">
                                  {r.conversationType === "group"
                                    ? t("group") + " — "
                                    : ""}
                                  {r.conversationName}
                                </div>}
                                <span className={"original-state "+(availability.available?"available":"unavailable")}>{t(availability.label)}</span>
                                <p className={r.kind==='text'?'message-preview':'message-type'}>
                                  {r.hasOriginal
                                    ? r.kind === "text"
                                      ? r.text
                                      : t(r.kind)
                                    : t("missingPreview")}
                                </p>
                              </div>
                            </button>
                            );
                          })
                        ) : (
                          <div id="empty" className="empty">
                            <span className="empty-visual"><PlatformLogo platform={platform} /></span>
                            <h3 id="empty-title">
                              {t(
                                activeFilters.length > 0
                                  ? "noMatch"
                                  : "empty",
                              )}
                            </h3>
                            <p>
                              {t(
                                activeFilters.length > 0
                                  ? "tryFilter"
                                  : "emptyCopy",
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="message-detail">
                        {current ? (
                          <article key={current.id} className="detail-content">
                            <Button
                              className="mobile-back"
                              leftSection={
                                <IconArrowLeft size={14} aria-hidden="true" />
                              }
                              variant="subtle"
                              size="xs"
                              onClick={() => {
                                setMobileDetail(false);
                                requestAnimationFrame(() =>
                                  document
                                    .querySelector(".message.current")
                                    ?.focus(),
                                );
                              }}
                            >
                              {t("back")}
                            </Button>
                            <div className="detail-header">
                              <Face record={current} size={30} />
                              <div className="detail-identity">
                                <h2 tabIndex={-1}>{current.sender}</h2>

                              </div>
                            <div className="detail-context">
                              {current.conversationType === "group" && (
                                <Face
                                  record={current}
                                  role="conversation"
                                  size={20}
                                />
                              )}
                              <span>
                                {t(
                                  current.conversationType === "group"
                                    ? "group"
                                    : current.conversationType === "personal"
                                      ? "personal"
                                      : "conversation",
                                )}{" "}
                                — {current.conversationName}
                              </span>
                            </div>
                            </div>
                            <div className="detail-meta">
                            {current.hasOriginal && current.kind !== 'text' && <span className="media-label">
                              {current.kind==='video'?<IconVideo size={14} aria-hidden="true"/>:current.kind==='sticker'?<IconSticker size={14} aria-hidden="true"/>:current.kind==='gif'?<IconGif size={14} aria-hidden="true"/>:current.kind==='audio'?<IconVolume size={14} aria-hidden="true"/>:current.kind==='file'?<IconFileDescription size={14} aria-hidden="true"/>:<IconPhoto size={14} aria-hidden="true"/>}
                              {t(current.kind)}
                            </span>}
                            <div className="detail-time">
                              <IconClock size={14} aria-hidden="true"/>
                              <span>{t("time")}</span>
                              <time dateTime={new Date(current.recalledAt).toISOString()}>
                                {new Date(current.recalledAt).toLocaleString(
                                  locale,
                                )}
                              </time>
                            </div>
                            </div>
                            <div className="original-message">
                            {(!current.hasOriginal||current.kind==='text')&&<div className="content-label">{t(current.hasOriginal ? "original" : "missingTitle")}</div>}
                            {!current.hasOriginal ? (
                              <p className="message-body missing">
                                {t("missing")}
                              </p>
                            ) : current.kind === "text" && !current.attachments?.length ? (
                              <p className="message-body">{current.text}</p>
                            ) : (
                              <>
                                {current.attachments?.length ? (
                                  current.attachments.map((a, index) => (
                                    <Media
                                      record={current}
                                      index={index}
                                      key={index}
                                      t={t}
                                      canRetry={!demo&&active&&state.settings.cacheMedia}
                                    />
                                  ))
                                ) : (
                                  <p className="muted media-note">
                                    {t(
                                      state.settings.cacheMedia
                                        ? "noFile"
                                        : "enableFile",
                                    )}
                                  </p>
                                )}
                                {current.text && (
                                  <p className="message-body">{current.text}</p>
                                )}
                              </>
                            )}
                            </div>
                            <div className="detail-actions">
                              <Button variant="subtle" size="xs" leftSection={<IconPin size={14}/>} aria-pressed={!!current.pinned} disabled={demo||annotationBusy} onClick={()=>annotate({pinned:!current.pinned})}>{t(current.pinned?'unpinMessage':'pinMessage')}</Button>
                              <Button variant="subtle" size="xs" leftSection={<IconNotes size={14}/>} aria-expanded={noteOpen} onClick={()=>setNoteOpen(!noteOpen)}>{language==='en'?(current.note?'Edit note':'Add note'):(current.note?'Sửa ghi chú':'Thêm ghi chú')}</Button>
                              <Button variant="subtle" size="xs" leftSection={<IconDownload size={14}/>} onClick={()=>setExportConversation(true)}>{t('conversationExport')}</Button>
                            </div>
                            <p className="action-help">{language==='en'?'Mark as important to find this message with the “Important messages only” filter. Notes are private and never sent to the chat.':'Đánh dấu quan trọng để tìm nhanh bằng bộ lọc “Chỉ tin quan trọng”. Ghi chú chỉ lưu riêng, không gửi vào cuộc trò chuyện.'}</p>
                            {!noteOpen&&current.note&&<p className="note-preview">{current.note}</p>}
                            {noteOpen&&<div className="message-annotations">
                              <Textarea label={t('privateNote')} description={t('privateNoteHint')} value={noteDraft} onChange={e=>setNoteDraft(e.currentTarget.value)} maxLength={2000} autosize minRows={2} maxRows={5} disabled={demo||annotationBusy}/>
                              <Button mt="xs" size="xs" disabled={demo||annotationBusy||noteDraft===(current.note||'')} onClick={()=>annotate({note:noteDraft})}>{t('saveNote')}</Button>
                            </div>}
                          </article>
                        ) : (
                          <div className="empty detail-empty">
                            <span className="empty-visual"><IconArchive size={32} stroke={1.5} aria-hidden="true" /></span>
                            <h3>{t("select")}</h3>
                            <p>{t("selectCopy")}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                ))}
              {view === "feedback" && (
                <section
                  id="feedback"
                  className="page feedback-page view-enter"
                >
                  <div className="section-heading">
                    <span className="section-icon"><IconMessageCircle size={24} stroke={1.7} aria-hidden="true" /></span>
                    <div><h2 className="icon-heading"><IconMessageCircle size={19} aria-hidden="true"/>{t("feedbackTitle")}</h2><p>{t("feedbackIntro")}</p></div>
                  </div>
                  <div className="feedback-layout">
                    <form id="feedback-form" onSubmit={sendFeedback}>
                      <Textarea
                        id="feedback-message"
                        label={t("message")}
                        placeholder={t("placeholder")}
                        value={draft.message}
                        maxLength={3000}
                        onChange={(e) =>
                          changeDraft({ message: e.currentTarget.value })
                        }
                        minRows={3}
                        maxRows={6}
                        autosize
                        size="xs"
                      />
                      <div className="feedback-fields">
                        <TextInput
                          id="feedback-email"
                          type="email"
                          label={t("email")}
                          value={draft.email}
                          maxLength={160}
                          onChange={(e) =>
                            changeDraft({ email: e.currentTarget.value })
                          }
                          size="xs"
                        />
                        <Select
                          allowDeselect={false}
                          comboboxProps={{
                            transitionProps: {
                              transition: "fade",
                              duration: 140,
                            },
                          }}
                          id="feedback-category"
                          label={t("category")}
                          value={draft.category}
                          onChange={(value) =>
                            changeDraft({ category: value || "other" })
                          }
                          data={[
                            { value: "suggestion", label: t("suggestion") },
                            { value: "bug", label: t("bug") },
                            { value: "other", label: t("misc") },
                          ]}
                          size="xs"
                        />
                      </div>
                      <div className="draft-row">
                        <span aria-live="polite">{t(draftStatus)}</span>
                        <span id="feedback-count">
                          {draft.message.length}/3000
                        </span>
                      </div>
                      <Checkbox
                        id="feedback-consent"
                        label={t("feedbackConsent")}
                        description={t("feedbackConsentDetail")}
                        checked={feedbackConsent}
                        onChange={(e) =>
                          setFeedbackConsent(e.currentTarget.checked)
                        }
                        size="sm"
                      />
                      <div className="feedback-actions">
                        <Button
                          leftSection={
                            <IconMail size={14} aria-hidden="true" />
                          }
                          id="feedback-submit"
                          type="submit"
                          size="xs"
                          disabled={
                            demo ||
                            draft.message.trim().length < 10 ||
                            !feedbackConsent
                          }
                        >
                          {t("submit")}
                        </Button>
                        <Button
                          id="feedback-copy"
                          type="button"
                          variant="default"
                          size="xs"
                          leftSection={<IconCopy size={14} aria-hidden="true" />}
                          onClick={copyFeedback}
                          disabled={demo || draft.message.trim().length < 10}
                        >
                          {t("feedbackCopy")}
                        </Button>
                        <Button
                          leftSection={
                            <IconTrash size={14} aria-hidden="true" />
                          }
                          variant="subtle"
                          size="xs"
                          onClick={clearDraft}
                          disabled={demo}
                        >
                          {t("draftClear")}
                        </Button>
                      </div>
                      <div
                        id="feedback-state"
                        role="status"
                        className={
                          feedbackResult === "feedbackCopied" ? "success" : ""
                        }
                      >
                        {feedbackResult
                          ? t(feedbackResult)
                          : demo
                            ? t("demoNoSend")
                            : ""}
                      </div>
                    </form>
                    <aside className="feedback-aside">
                      <IconMail size={28} stroke={1.6} aria-hidden="true" />
                      <h3>{t("feedbackPrivacy")}</h3>
                      <p>{t("feedbackSafe")}</p>
                      <p>{t("noSecrets")}</p>
                      <span className="email-address">
                        contact.nguyenxuanphu@gmail.com
                      </span>
                    </aside>
                  </div>
                </section>
              )}
              {view === 'diagnostics' && <section id="diagnostics" className="page settings-page">
                <h2 className="icon-heading"><IconShieldLock size={19} aria-hidden="true"/>{language==='en'?'Connection & capture':'Kết nối và lưu tin'}</h2><p>{language==='en'?'Check whether your chat tabs are connected and StillHere can save new messages. Use this page when a recalled message is missing.':'Kiểm tra tab chat đã kết nối chưa và StillHere có thể lưu tin mới hay không. Xem mục này khi bạn không tìm thấy tin đã thu hồi.'}</p>
                <div className="activity-platforms">{(state.settings.platforms||['zalo','facebook']).map(p=><div className="activity-platform" key={p}><div className="row"><PlatformLogo platform={p}/><strong>{PLATFORMS[p].label}</strong></div><p>{language==='en'?'Chat access: ':'Quyền đọc hội thoại: '}{t(state.sitePermissions?.[p]?'accessGranted':'accessMissing')}</p><Button size="xs" variant="default" onClick={()=>go('settings')}>{language==='en'?'Manage access':'Quản lý quyền'}</Button> <Button size="xs" variant="subtle" onClick={()=>openPlatform(p)}>{language==='en'?'Open chat':'Mở chat'}</Button></div>)}</div>
                <Button id="reconnect-tabs" size="xs" variant="light" disabled={demo||busy} onClick={async()=>{setBusy(true);try{const result=await request({type:'RECONNECT_TABS'});if(!result.ok)throw Error('Reconnect unavailable');const next=await request({type:'DIAGNOSTICS'});if(!Array.isArray(next.tabs))throw Error('Status unavailable');setDiagnostics({...next,tabs:next.tabs.filter(tab=>tab&&PLATFORMS[tab.platform])});setDiagnosticError(false);await refresh(true);}catch{setDiagnosticError(true);}finally{setBusy(false);}}}>{language==='en'?'Reconnect open tabs':'Kết nối lại tab đang mở'}</Button>
                {diagnosticError&&<Alert color="red" role="alert">{t('diagnosticsUnavailable')}</Alert>}
                {!diagnostics&&!diagnosticError&&<p role="status">{t('vaultLoading')}</p>}
                {diagnostics&&<>
                  <p>{t('capture')}: <strong>{t(diagnostics.saving?'captureEnabled':'capturePaused')}</strong></p>
                  <div className="settings-row">
                    <div><h3>{t('mediaQueue')}</h3><p>{t('queueWaiting')}: {diagnostics.mediaQueue?.queued||0} · {t('queueActive')}: {(diagnostics.mediaQueue?.active||0)+(diagnostics.mediaQueue?.locked||0)} · {t('queueFailed')}: {diagnostics.mediaQueue?.failed||0}</p><p>{t('retryMediaHint')}</p></div>
                    <Button size="xs" disabled={demo||busy||!diagnostics.saving||!diagnostics.mediaEnabled} onClick={async()=>{setBusy(true);try{await request({type:'MEDIA_RETRY'});const result=await request({type:'DIAGNOSTICS'});if(!Array.isArray(result?.tabs))throw Error('Invalid diagnostics response');setDiagnostics({...result,tabs:result.tabs.filter(tab=>tab&&PLATFORMS[tab.platform])});}catch{setDiagnosticError(true);}finally{setBusy(false);}}}>{t('retryMedia')}</Button>
                  </div>
                  {diagnostics.accountTransitions?.length>0&&<details className="activity-guide"><summary>{language==='en'?'Last account protection event':'Lần bảo vệ tài khoản gần nhất'}</summary>{diagnostics.accountTransitions.map(item=><p key={item.platform}>{item.platform==='zalo'?'Zalo':'Facebook'} · {({ 'signed-out':language==='en'?'Sign-out signal':'Trang báo đăng xuất', switching:language==='en'?'Account switch signal':'Trang báo chuyển tài khoản', 'id-changed':language==='en'?'Account identifier changed':'Mã tài khoản thay đổi', 'name-changed':language==='en'?'Account name changed without a comparable identifier':'Tên tài khoản thay đổi khi chưa đối chiếu được mã' })[item.reason]||'—'}{item.navigation?(language==='en'?' · After page navigation':' · Sau khi tải trang'):''}</p>)}</details>}
                  {!diagnostics.tabs.length&&<Alert>{t('noChatTabs')}</Alert>}
                  {diagnostics.tabs.map(tab=><div className="settings-row" key={tab.tabId}>
                    <div><h3>{tab.host || PLATFORMS[tab.platform].label} · {t('tabLabel')} {tab.tabId}</h3>
                      {tab.accountName&&<p>{tab.accountName}</p>}
                      <p><strong>{t('diag_'+tab.status)}</strong>{tab.background?' · '+t('backgroundTab'):''}</p>
                      <p>{t('lastSignal')}: {tab.lastSeen?new Date(tab.lastSeen).toLocaleString(locale):t('notReceived')}</p>
                    </div><Button onClick={async()=>{try{const result=await request({type:'FOCUS_CHAT_TAB',tabId:tab.tabId,platform:tab.platform});if(!result.ok)setError('chatTabUnavailable');}catch{setError('chatTabUnavailable');}}} variant="default" size="xs">{language==='en'?'Go to this tab':'Đến tab này'}</Button>
                  </div>)}
                </>}
<details className="activity-guide"><summary>{language==='en'?'How to read the status':'Cách đọc trạng thái'}</summary><p>{language==='en'?'Connected: the tab is responding. Capturing: messages loaded on the page are being detected. Paused: capture is turned off.':'Đã kết nối: tab đang phản hồi. Đang ghi nhận: đã phát hiện nội dung tin trên trang. Tạm dừng: bạn đang tắt lưu tin.'}</p><small>{t('diagnosticsHint')}</small></details>
              </section>}
              {view === "settings" && (
                <section
                  id="settings"
                  className="page settings-page view-enter"
                >
                  <div className="section-heading">
                    <span className="section-icon"><IconSettings size={24} stroke={1.7} aria-hidden="true" /></span>
                    <div><h2 className="icon-heading"><IconSettings size={18} aria-hidden="true"/>{t("settings")}</h2><p>{t("settingsIntro")}</p></div>
                  </div>
                  <SettingsIndex language={language} />
                  <h3 id="settings-platforms" className="settings-group-title">{language==='en'?'Platforms & access':'Nền tảng và quyền truy cập'}</h3>
                  <p className="section-help">{language==='en'?'Choose where StillHere may capture messages. Adding a platform asks Chrome for its access; deselected platforms stop capturing. Existing grants can be removed in Chrome’s extension settings.':'Chọn nơi StillHere được phép lưu tin. Khi thêm nền tảng, Chrome sẽ hỏi quyền tương ứng; nền tảng bỏ chọn sẽ ngừng ghi nhận. Bạn có thể thu hồi quyền đã cấp trong cài đặt tiện ích của Chrome.'}</p>
                  <Select mb="lg" label={language==='en'?'Platforms':'Nền tảng sử dụng'} value={(state.settings.platforms||['zalo','facebook']).length===2?'both':state.settings.platforms[0]} onChange={value=>choosePlatforms(value)} allowDeselect={false} data={[{value:'both',label:language==='en'?'Zalo and Facebook':'Zalo và Facebook'},{value:'zalo',label:'Zalo'},{value:'facebook',label:'Facebook / Messenger'}]} />
                  <div className="platform-access-list">{(state.settings.platforms||['zalo','facebook']).map(p=><div className="platform-access-row" key={p}><PlatformLogo platform={p}/><div><strong>{PLATFORMS[p].label}</strong><p>{language==='en'?'Read chat: ':'Đọc hội thoại: '}{t(state.sitePermissions?.[p]?'accessGranted':'accessMissing')} · {language==='en'?'Files: ':'Tệp: '}{t(state.resourcePermissionsComplete?.[p]?'accessGranted':'accessMissing')}</p></div><Button size="xs" variant="default" disabled={demo||busy||(state.sitePermissions?.[p]&&state.resourcePermissionsComplete?.[p])} onClick={async()=>{const granted=await chrome.permissions.request({origins:selectedOrigins([p])}).catch(()=>false);if(granted)await settings({cacheMedia:true});else setError('platformPermissionDenied');}}>{language==='en'?'Grant access':'Cấp quyền'}</Button></div>)}</div>
                  <h3 id="settings-storage" className="settings-group-title">{language==='en'?'Message and file storage':'Lưu tin và tệp'}</h3>
                  <p className="section-help">{language==='en'?'Text stays on this device. Files are available later only if downloaded before recall. Capture continues in background tabs while the browser keeps them running.':'Văn bản được lưu trên thiết bị. Tệp chỉ xem lại được nếu đã tải trước khi thu hồi. Tiện ích tiếp tục lưu ở tab nền khi trình duyệt vẫn cho tab hoạt động.'}</p>
                  <div className="settings-row"><div><h3>{t('capture')}</h3><p>{language==='en'?'Save content loaded in your selected chat tabs, including while StillHere is locked after secure capture is set up.':'Lưu nội dung đã tải trong tab chat được chọn, kể cả khi StillHere đang khoá nếu đã thiết lập lưu an toàn.'}</p><strong className="setting-value">{t(state.settings.enabled?'captureEnabled':'capturePaused')}</strong></div><Switch id="settings-capture-toggle" aria-label={t('capture')} checked={!!state.settings.enabled} disabled={demo||busy} onChange={e=>settings({enabled:e.currentTarget.checked})}/></div>
                  <div className="settings-row">
                    <div>
                      <h3 className="icon-heading"><IconPhoto size={18} aria-hidden="true"/>{t("resourceTitle")}</h3>
                      <p>{t("resourceCopy")}</p>
                      <span id="resource-usage" className="muted">
                        {state.cacheCount || 0} {t("files")} ·{" "}
                        {((state.cacheBytes || 0) / 1048576).toFixed(2)} / 100
                        MB
                      </span>
                      <Progress className="storage-progress" value={Math.min(100,(state.cacheBytes || 0)/1048576)} size="sm" aria-label={t("storageUsage")} />
                    </div>
                    <Switch
                      id="resource-toggle"
                      aria-label={t("resourceTitle")}
                      checked={!!state.settings.cacheMedia}
                      disabled={demo || busy}
                      onChange={(e) =>
                        e.currentTarget.checked
                          ? resources()
                          : settings({ cacheMedia: false })
                      }
                    />
                  </div>
                  <div
                    id="resource-optin"
                    hidden={
                      demo ||
                      (state.settings.cacheMedia && state.resourcePermissionsComplete?.[platform])
                    }
                  >
                    <Button
                      id="enable-resources"
                      leftSection={<PlatformLogo platform={platform} />}
                      variant="light"
                      size="xs"
                      onClick={resources}
                    >
                      {t("enableResources")} · {PLATFORMS[platform].label}
                    </Button>
                  </div>
                  <div className="settings-row retention-row">
                    <Select
                      allowDeselect={false}
                      comboboxProps={{
                        transitionProps: { transition: "fade", duration: 140 },
                      }}
                      id="retention"
                      label={t("retention")}
                      value={String(state.settings.retentionDays)}
                      onChange={(value) =>
                        settings({ retentionDays: Number(value) })
                      }
                      disabled={demo || busy}
                      data={[
                        { value: "7", label: "7 " + t("days") },
                        { value: "30", label: "30 " + t("days") },
                      ]}
                      size="xs"
                    />
                    <p>{t("retentionHint")}</p>
                  </div>
                  <div className="conversation-rules">
                    <h3>{t('conversationRules')}</h3><p>{t('conversationRulesHint')}</p>
                    <Select label={t('ruleMode')} value={state.settings.conversationRules?.mode||'all'} disabled={demo||busy} allowDeselect={false} onChange={mode=>saveRules({mode,entries:state.settings.conversationRules?.entries||[]})} data={['all','include','exclude'].map(value=>({value,label:t('rule_'+value)}))}/>
                    <MultiSelect mt="sm" label={t('ruleConversations')} searchable disabled={demo||busy} value={(state.settings.conversationRules?.entries||[]).map(e=>JSON.stringify([e.platform,e.conversationId,e.accountScope||'']))} onChange={values=>saveRules({mode:state.settings.conversationRules?.mode||'all',entries:values.map(value=>{const [platform,conversationId,accountScope]=JSON.parse(value);return {platform,conversationId,accountScope};})})} data={[...new Map([...(state.records||[]).map(r=>[JSON.stringify([r.platform||'zalo',r.conversationId,r.accountScope||'']),{value:JSON.stringify([r.platform||'zalo',r.conversationId,r.accountScope||'']),label:(PLATFORMS[r.platform||'zalo']?.label||'')+' · '+r.conversationName+' · '+(r.accountScope?(r.accountName||t('unknownAccount'))+' · '+r.accountScope.slice(0,6):t('legacyAccount'))}]),...(state.settings.conversationRules?.entries||[]).filter(e=>!(state.records||[]).some(r=>(r.platform||'zalo')===e.platform&&r.conversationId===e.conversationId&&(r.accountScope||'')===(e.accountScope||''))).map(e=>[JSON.stringify([e.platform,e.conversationId,e.accountScope||'']),{value:JSON.stringify([e.platform,e.conversationId,e.accountScope||'']),label:PLATFORMS[e.platform].label+' · '+e.conversationId}])]).values()]}/>
                  </div>
                  <section id="settings-security" className="security-settings"><h3 className="settings-group-title">{language==='en'?'Security':'Bảo mật'}</h3><p>{t('vaultSession')}</p><p>{t('vaultEncrypted')}</p><p>{t('vaultPaused')}</p><a href={language==='en'?'privacy-en.html':'privacy.html'} target="_blank" rel="noreferrer">{t('privacy')}</a></section>
                  <div id="settings-backup" className="settings-row backup-row">
                    <div><h3 className="icon-heading"><IconDownload size={18} aria-hidden="true"/>{t("backupTitle")}</h3><p>{t("backupCopy")}</p></div>
                    <div className="backup-actions">
                      <Button variant="light" size="xs" leftSection={<IconDownload size={14}/>} onClick={exportBackup}>{t("backupExport")}</Button>
                      <Button component="label" variant="subtle" size="xs">{t("backupImport")}<input type="file" accept="application/json" hidden onChange={importBackup}/></Button>
                    </div>
                  </div>
                  <div className="automation-note"><IconShieldLock size={20} stroke={1.6} aria-hidden="true" /><div><h3>{t("automation")}</h3><p>{t("autoCopy")}</p></div></div>
                  <div id="settings-delete" className="danger-zone">
                    <div>
                      <h3 className="icon-heading"><IconTrash size={18} aria-hidden="true"/>{t("clear")}</h3>
                      <p>{t("clearCopy")}</p>
                    </div>
                    {!clear ? (
                      <Button
                        leftSection={<IconTrash size={14} aria-hidden="true" />}
                        id="clear"
                        variant="light"
                        color="red"
                        size="xs"
                        disabled={demo || busy}
                        onClick={() => {
                          setClear(true);
                          requestAnimationFrame(() =>
                            document.getElementById("cancel-clear")?.focus(),
                          );
                        }}
                      >
                        {t("clear")}
                      </Button>
                    ) : (
                      <div id="clear-confirm" className="row">
                        <Button
                          id="confirm-clear"
                          color="red"
                          size="xs"
                          loading={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const result = await request({ type: "CLEAR" });
                              if (result.ok !== true) throw Error("Deletion rejected");
                              const confirmed = await request({ type: "STATE" });
                              if (confirmed.records.length || confirmed.settings.enabled)
                                throw Error("Deletion not confirmed");
                              receive(confirmed);
                              setError("");
                              setClear(false);
                              setNotice("messagesCleared");
                              requestAnimationFrame(() =>
                                document.getElementById("clear")?.focus(),
                              );
                            } catch {
                              setError("clearUnconfirmed");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {t("confirmClear")}
                        </Button>
                        <Button
                          id="cancel-clear"
                          variant="default"
                          size="xs"
                          disabled={busy}
                          onClick={() => {
                            setClear(false);
                            requestAnimationFrame(() =>
                              document.getElementById("clear")?.focus(),
                            );
                          }}
                        >
                          {t("cancel")}
                        </Button>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {view === "about" && (
                <section id="about" className="page about-page view-enter">
                  <div className="about-hero"><div><h2 className="icon-heading"><IconInfoCircle size={19} aria-hidden="true"/>{t("aboutTitle")}</h2><p>{t("tagline")}</p></div><WelcomeArt scene="about" /></div>
                  <p className="about-copy">{t("aboutCopy")}</p>
                  <section className="developer-services">
                    <div className="about-brand"><BrandLogo /><h3>FSUB.vn - Digital Marketing Solutions</h3></div>
                    <p>{language==='en'?'FSUB.vn manages and develops StillHere and provides social-media services across Facebook, Instagram, TikTok and YouTube.':'FSUB.vn là đơn vị quản lý và phát triển StillHere, cung cấp dịch vụ truyền thông mạng xã hội trên Facebook, Instagram, TikTok và YouTube.'}</p>
                    <div className="about-actions"><Button component="a" href="https://fsub.vn/" target="_blank" rel="noreferrer" size="xs" leftSection={<IconWorld size={14}/>}>{language==='en'?'Explore FSUB services':'Khám phá dịch vụ FSUB'}</Button><Button component="a" href="mailto:contact.nguyenxuanphu@gmail.com" variant="default" size="xs" leftSection={<IconMail size={14}/>}>{language==='en'?'Contact the team':'Liên hệ tư vấn'}</Button></div>
                  </section>
                  <section className="about-contact"><h3>{language==='en'?'Community & support':'Cộng đồng và hỗ trợ'}</h3>
                    <div className="about-links"><Button leftSection={<IconBrandFacebook size={14}/>} component="a" href="https://www.facebook.com/profile.php?id=61596131866684" target="_blank" rel="noreferrer" variant="default" size="xs">{t("community")}</Button><Button leftSection={<IconBrandFacebook size={14}/>} component="a" href="https://www.facebook.com/fsub.vn/" target="_blank" rel="noreferrer" variant="default" size="xs">FSUB · Facebook</Button></div>
                    <a className="support-email" href="mailto:contact.nguyenxuanphu@gmail.com"><IconMail size={15} aria-hidden="true"/><span>contact.nguyenxuanphu@gmail.com</span></a>
                  </section>
                  <div className="independent">
                    <h3>{t("independent")}</h3>
                    <p>{t("removal")}</p>
                    <a
                      href={
                        language === "en" ? "privacy-en.html" : "privacy.html"
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("privacy")}
                    </a>
                  </div>
                </section>
              )}
              {view === "support" && (
                <section id="support" className="page support-page view-enter">
                  <div className="section-heading">
                    <span className="section-icon support-icon"><IconHeart size={24} stroke={1.7} aria-hidden="true" /></span>
                    <div><h2 className="icon-heading"><IconHeart size={19} aria-hidden="true"/>{t("supportTitle")}</h2><p>{t("supportIntro")}</p></div>
                  </div>
                  <p id="support-disclosure" className="voluntary">{t("voluntary")}</p>
                  <div className="support-layout">
                    <div className="qr-card">
                      <img
                        id="support-qr"
                        src="assets/support-qr.png"
                        width="216"
                        height="216"
                        alt="VietQR MB Bank 192198, NGUYEN XUAN PHU"
                      />
                      <div className="payment-brands"><img src="assets/vietqr.svg" alt="VietQR" /><span aria-hidden="true" /><img src="assets/mb-bank.png" alt="MB Bank" /></div>
                    </div>
                    <div className="support-copy">
                      <p>{t("supportCopy")}</p>
                      <dl>
                        <div>
                          <dt>{t("account")} · MB Bank</dt>
                          <dd>192198</dd>
                        </div>
                        <div>
                          <dt>{t("holder")}</dt>
                          <dd className="holder">NGUYEN XUAN PHU</dd>
                        </div>
                        <div>
                          <dt>{t("memo")}</dt>
                          <dd className="memo">UNG HO StillHere</dd>
                        </div>
                      </dl>
                      <div className="support-actions"><Button
                        leftSection={
                          copied ? (
                            <IconCheck size={14} aria-hidden="true" />
                          ) : (
                            <IconCopy size={14} aria-hidden="true" />
                          )
                        }
                        variant="default"
                        size="xs"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText("192198");
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2500);
                          } catch {
                            setError("error");
                          }
                        }}
                      >
                        {t(copied ? "copied" : "copyAccount")}
                      </Button>
                      <Button
                        leftSection={<IconDownload size={14} aria-hidden="true" />}
                        component="a"
                        href="assets/support-qr.png"
                        download="FSUB-MB-192198.png"
                        size="xs"
                        variant="light"
                      >{t("download")}</Button></div>
                      <p className="amount-note">{t("amount")}</p>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      <footer>
        <div id="storage-label">
          {demo
            ? t("local")
            : state
              ? `${PLATFORMS[platform].label} · ${recalledTotal.toLocaleString(locale)} ${t(recalledTotal === 1 ? "recalledCountOne" : "recalledCount")} · ${t("keep")} ${state.settings.retentionDays} ${t("days")}`
              : t("local")}
        </div>
        <div className="footer-actions">
          <button id="support-button" className="support-shortcut" onClick={()=>go('support')}><IconHeart size={14} aria-hidden="true"/>{t('support')}</button>
          <a
            href={language === "en" ? "privacy-en.html" : "privacy.html"}
            target="_blank"
            rel="noreferrer"
          >
            <IconShieldLock size={12} aria-hidden="true" />
            {t("privacy")}
          </a>

        </div>
      </footer>
    </div>
  );
}
const theme = {
  fontFamily: "Be Vietnam Pro, system-ui, sans-serif",
  primaryColor: "blue",
  primaryShade: 6,
  defaultRadius: "md",
  fontSizes: { xs: "13px", sm: "14px", md: "15px", lg: "17px", xl: "20px" },
  headings: {
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif",
    fontWeight: "600",
  },
  respectReducedMotion: true,
  colors: {
    blue: [
      "#edf3ff",
      "#dce7ff",
      "#c0d4ff",
      "#97b7ff",
      "#6a95fa",
      "#386ce8",
      "#0643d7",
      "#0537b5",
      "#062d91",
      "#08276f",
    ],
  },
};
class PopupErrorBoundary extends React.Component {
  state = {failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    const english=document.documentElement.lang==='en';
    return <main className="vault-shell"><section className="vault-panel" role="alert">
      <h2>{english?'Unable to display StillHere':'Chưa thể hiển thị StillHere'}</h2>
      <p>{english?'Your saved data has not been deleted. Reopen the interface to try again.':'Dữ liệu đã lưu chưa bị xoá. Mở lại giao diện để thử lại.'}</p>
      <Button onClick={()=>location.reload()}>{english?'Reopen interface':'Mở lại giao diện'}</Button>
      <p>{english?'If this continues after an update, reload StillHere at chrome://extensions. Do not remove the extension.':'Nếu vẫn lỗi sau khi cập nhật, bấm Tải lại StillHere tại chrome://extensions. Không gỡ tiện ích.'}</p>
    </section></main>;
  }
}
createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PopupErrorBoundary><VaultGate enabled={!demo}><App /></VaultGate></PopupErrorBoundary>
  </MantineProvider>,
);
