import {translate} from './i18n.js';

const facebookLabels = {
  waiting: ['Chưa kết nối Facebook/Messenger', 'Facebook/Messenger is not connected'],
  live: ['Đang ghi nhận tin mới', 'Saving new messages'],
  connected: ['Đã kết nối Facebook/Messenger', 'Connected to Facebook/Messenger'],
  offline: ['Facebook/Messenger đang mất mạng', 'Facebook/Messenger is offline'],
  reconnecting: ['Chưa nhận tín hiệu từ Facebook/Messenger', 'Waiting for a Facebook/Messenger response'],
  background: ['Tab Facebook/Messenger đang ở nền', 'Facebook/Messenger tab is in the background'],
};
const facebookHints = {
  waiting: ['Mở Facebook hoặc Messenger và chọn một hội thoại để bắt đầu.', 'Open Facebook or Messenger and choose a chat to start.'],
  live: ['StillHere đang theo dõi hội thoại Facebook/Messenger đang mở.', 'StillHere is watching the open Facebook/Messenger conversation.'],
  connected: ['Mở một hội thoại để bắt đầu. StillHere chỉ ghi nhận nội dung trang đã tải.', 'Open a chat to begin. StillHere captures only content loaded by the page.'],
  offline: ['Facebook/Messenger đang báo mất mạng; nội dung đã lưu vẫn xem được.', 'Facebook/Messenger reports no connection; saved content remains available.'],
  reconnecting: ['Mở lại hội thoại hoặc bấm Kết nối lại tab đang mở.', 'Open the chat again or click Reconnect open tabs.'],
  background: ['Tab nền vẫn có thể lưu nội dung đã tải khi Chrome giữ tab hoạt động.', 'A background tab can still save loaded content while Chrome keeps it active.'],
};
export function platformStatusLabel(status, platform, language) {
  return platform === 'facebook' ? (facebookLabels[status]?.[language === 'en' ? 1 : 0] || translate(language, status)) : translate(language, status);
}
export function platformStatusHint(status, platform, language) {
  return platform === 'facebook' ? (facebookHints[status]?.[language === 'en' ? 1 : 0] || translate(language, status + 'Hint')) : translate(language, status + 'Hint');
}
