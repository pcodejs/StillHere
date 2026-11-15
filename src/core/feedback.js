function feedbackFields(value, version) {
  const category = ["suggestion", "bug", "other"].includes(value.category)
    ? value.category
    : "other";
  const message = String(value.message || "").trim();
  const email = String(value.email || "").trim();
  if (message.length < 10 || message.length > 3000) {
    throw Error("Góp ý cần từ 10 đến 3.000 ký tự.");
  }
  if (
    email.length > 160 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    throw Error("Email liên hệ chưa hợp lệ.");
  }
  return { category, message, email, version: String(version).slice(0, 24) };
}

export function feedbackPayload(value, version) {
  const payload = feedbackFields(value, version);
  if (value.consent !== true) {
    throw Error("Vui lòng đồng ý gửi nội dung góp ý.");
  }
  return payload;
}

function emailContent(payload, language) {
  const english = language === "en";
  const categories = english
    ? { suggestion: "Feature request", bug: "Bug report", other: "Other feedback" }
    : { suggestion: "Đề xuất tính năng", bug: "Báo lỗi", other: "Góp ý khác" };
  const subject = "[StillHere] " + categories[payload.category];
  const body = [
    payload.message,
    "",
    (english ? "Reply email: " : "Email phản hồi: ") +
      (payload.email || (english ? "(use sender email)" : "(dùng email gửi thư)")),
    (english ? "Version: " : "Phiên bản: ") + payload.version,
  ].join("\n");
  return { recipient: "contact.nguyenxuanphu@gmail.com", subject, body };
}

export function feedbackEmailUrl(value, version, language = "vi") {
  const content = emailContent(feedbackPayload(value, version), language);
  return "mailto:" + content.recipient + "?subject=" + encodeURIComponent(content.subject) + "&body=" + encodeURIComponent(content.body);
}

export function feedbackEmailText(value, version, language = "vi") {
  const content = emailContent(feedbackFields(value, version), language);
  return [
    (language === "en" ? "To: " : "Người nhận: ") + content.recipient,
    (language === "en" ? "Subject: " : "Chủ đề: ") + content.subject,
    "",
    content.body,
  ].join("\n");
}
