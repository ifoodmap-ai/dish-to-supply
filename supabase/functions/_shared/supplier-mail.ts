// 供應商入駐申請相關的信件:內容(純函式,可測)+ 用 Resend 寄出。
//
// 給 notify-lead(新申請 → 業主通知、申請者確認信)與 approve-supplier(核准通知、退件信)共用。
// 這支不碰 Deno 全域,環境變數由呼叫端用 mailConfigFromEnv(Deno.env.get) 傳進來,
// 所以 vitest 可以直接 import(見 supplier-mail.test.ts)。
//
// 寄件人一律讀環境變數(之後網域換成 ifoodmap.ai 只要改 secret,不用改程式):
//   NOTIFY_FROM       寄給申請者的信(跟 notify 那支共用同一個對外寄件人)
//   LEAD_NOTIFY_FROM  寄給業主的內部通知(跟官網表單通知共用)
//   LEAD_NOTIFY_TO    業主信箱,逗號分隔
//   SUPPLIER_MAIL_REPLY_TO  申請者按「回覆」會寄到哪(沒設就用 LEAD_NOTIFY_TO 的第一個)

export const DEFAULT_APPLICANT_FROM = "iFoodmap 食材地圖 <noreply@gathertaiwan.com>";
export const DEFAULT_OWNER_FROM = "iFoodmap 表單通知 <noreply@gathertaiwan.com>";
export const DEFAULT_OWNER_TO = "ifoodmaptw@gmail.com";
export const DEFAULT_SITE_URL = "https://dish-to-supply.vercel.app";
export const DEFAULT_ADMIN_SITE_URL = "https://ifoodmap-admin.vercel.app";

/** 確認信裡告訴申請者「大約多久」 */
export const REVIEW_TIME_TEXT = "3 個工作天";

/**
 * 只寄給「一般的 email」:英數與 . _ % + ' - 的帳號、正常的網域、英文或 punycode(xn--)頂級網域。
 * 跟資料庫的匿名送件 policy(migration 20260928180100 / 20260928180200)是同一條規則 —— 那裡擋不住的
 * (例如管理員手動補的資料)在寄信前再擋一次。`文字<信箱>`、`x@gmail.com.` 這類字串一律不寄,
 * 避免被當成「顯示名稱 + 地址」塞廣告,或拿不同寫法繞過「同一個 email」的頻率限制。
 */
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.([A-Za-z]{2,}|xn--[A-Za-z0-9-]+)$/;

export const isDeliverableEmail = (email: unknown): email is string =>
  typeof email === "string" && email.length <= 254 && EMAIL_PATTERN.test(email);

export interface MailConfig {
  resendKey: string;
  applicantFrom: string;
  ownerFrom: string;
  ownerTo: string[];
  replyTo: string | null;
  siteUrl: string;
  adminSiteUrl: string;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export const mailConfigFromEnv = (get: (key: string) => string | undefined): MailConfig => {
  const val = (key: string) => (get(key) ?? "").trim();
  const ownerTo = (val("LEAD_NOTIFY_TO") || DEFAULT_OWNER_TO)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    resendKey: val("RESEND_API_KEY"),
    applicantFrom: val("NOTIFY_FROM") || DEFAULT_APPLICANT_FROM,
    ownerFrom: val("LEAD_NOTIFY_FROM") || DEFAULT_OWNER_FROM,
    ownerTo,
    replyTo: val("SUPPLIER_MAIL_REPLY_TO") || ownerTo[0] || null,
    siteUrl: trimSlash(val("SITE_URL") || DEFAULT_SITE_URL),
    adminSiteUrl: trimSlash(val("ADMIN_SITE_URL") || DEFAULT_ADMIN_SITE_URL),
  };
};

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

/** 申請內容是公開網路上任何人送進來的 —— 放進 HTML 一定要跳脫 */
export const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escMultiline = (v: unknown) => esc(v).replace(/\r?\n/g, "<br>");

/** 台北時間,方便對照後台 */
export const taipeiTime = (iso: unknown) => {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  return (
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + "（台北時間）"
  );
};

/** 申請編號:UUID 前 8 碼,信裡與後台都好對照 */
export const applicationRef = (id: unknown) => String(id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();

const shell = (inner: string) => `
<div style="font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0f172a">
  <div style="margin-bottom:24px">
    <div style="font-size:20px;font-weight:700;color:#059669">iFoodmap 食材地圖</div>
    <div style="font-size:13px;color:#64748b;margin-top:2px">AI 食材媒合平台</div>
  </div>
  ${inner}
</div>`;

const p = (html: string) => `<p style="font-size:15px;line-height:1.75;color:#334155;margin:0 0 16px">${html}</p>`;
const small = (html: string) => `<p style="font-size:12px;color:#94a3b8;line-height:1.7;margin:0">${html}</p>`;
const hr = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px">`;
const button = (href: string, label: string) =>
  `<p style="margin:8px 0 24px"><a href="${esc(href)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">${esc(label)}</a></p>`;

// ---------------------------------------------------------------------
// 1) 新申請 → 業主
// ---------------------------------------------------------------------

export interface ApplicationRecord {
  id: string;
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_line?: string | null;
  categories?: string | null;
  service_areas?: string | null;
  description?: string | null;
  status?: string | null;
  admin_notes?: string | null;
  applicant_message?: string | null;
  created_at?: string | null;
}

/** 申請者確認信這次的狀態,寫進業主通知裡 */
export type ConfirmationNote =
  | "sent"
  | "failed"
  | "skipped:email_24h"
  | "skipped:hourly_cap"
  | "skipped:invalid_email"
  | "skipped"
  | "unknown";

const confirmationNoteText: Record<ConfirmationNote, string> = {
  sent: "已寄出",
  failed: "寄送失敗（申請已存進後台，不影響審核）",
  "skipped:email_24h": "未寄（同一個 Email 24 小時內已寄過一封）",
  "skipped:hourly_cap": "未寄（全站每小時確認信已達上限，可能有人在大量送件）",
  "skipped:invalid_email": "未寄（Email 格式不正確）",
  skipped: "未寄",
  unknown: "—",
};

const OWNER_FIELDS: [keyof ApplicationRecord, string][] = [
  ["company_name", "公司名稱"],
  ["contact_name", "聯絡人"],
  ["contact_email", "Email"],
  ["contact_phone", "電話"],
  ["contact_line", "LINE"],
  ["categories", "供應品類"],
  ["service_areas", "服務區域"],
  ["description", "公司簡介"],
];

export const ownerNewApplicationMail = (
  app: ApplicationRecord,
  opts: { adminSiteUrl: string; confirmation: ConfirmationNote },
): Mail => {
  // 主旨是單行:申請者填的換行、Tab 一律壓成空白(不讓使用者輸入影響信件標頭)
  const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
  const company = oneLine(app.company_name) || "（未填公司名）";
  const who = oneLine(app.contact_name);
  const subject = `【供應商申請】${company}${who ? ` — ${who}` : ""}`;
  const reviewUrl = `${opts.adminSiteUrl}/admin/applications`;

  const filled = OWNER_FIELDS.filter(([k]) => String(app[k] ?? "").trim() !== "");
  const rows = filled
    .map(
      ([k, label]) => `<tr>
        <td style="padding:9px 14px 9px 0;vertical-align:top;color:#64748b;font-size:13px;white-space:nowrap">${esc(label)}</td>
        <td style="padding:9px 0;vertical-align:top;color:#0f172a;font-size:14px;line-height:1.65">${escMultiline(app[k])}</td>
      </tr>`,
    )
    .join("");

  const html = shell(`
  ${p("有新的供應商入駐申請，請到後台審核。")}
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">${rows}</table>
  ${button(reviewUrl, "前往審核")}
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:3px 14px 3px 0;color:#94a3b8;font-size:12px;white-space:nowrap">申請編號</td>
        <td style="padding:3px 0;color:#64748b;font-size:12px;font-family:ui-monospace,monospace">${esc(applicationRef(app.id))}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#94a3b8;font-size:12px;white-space:nowrap">送出時間</td>
        <td style="padding:3px 0;color:#64748b;font-size:12px">${esc(taipeiTime(app.created_at))}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#94a3b8;font-size:12px;white-space:nowrap">申請者確認信</td>
        <td style="padding:3px 0;color:#64748b;font-size:12px">${esc(confirmationNoteText[opts.confirmation])}</td></tr>
  </table>
  ${hr}
  ${small("這是系統通知信。直接按「回覆」會寄給申請者填的 Email。")}`);

  const text = [
    "有新的供應商入駐申請，請到後台審核。",
    "",
    ...filled.map(([k, label]) => `${label}：${String(app[k])}`),
    "",
    `前往審核：${reviewUrl}`,
    `申請編號：${applicationRef(app.id)}`,
    `送出時間：${taipeiTime(app.created_at)}`,
    `申請者確認信：${confirmationNoteText[opts.confirmation]}`,
  ].join("\n");

  return { subject, html, text };
};

// ---------------------------------------------------------------------
// 2) 新申請 → 申請者「已收到」
//    刻意不回顯申請者填的任何文字(公司名、簡介…):匿名表單的自動回信如果會照抄使用者輸入,
//    就能被拿來替別人的信箱送垃圾內容。只放系統產生的申請編號與時間。
// ---------------------------------------------------------------------

export const applicantConfirmationMail = (app: Pick<ApplicationRecord, "id" | "created_at">): Mail => {
  const subject = "已收到你的 iFoodmap 供應商入駐申請";
  const ref = applicationRef(app.id);
  const when = taipeiTime(app.created_at);

  const html = shell(`
  <h1 style="font-size:19px;margin:0 0 12px">我們已收到你的供應商入駐申請</h1>
  ${p(`感謝你申請成為 iFoodmap 合作供應商。我們會在 <strong>${esc(REVIEW_TIME_TEXT)}內</strong>完成審核，結果會以 Email 寄到這個信箱。`)}
  ${p("審核通過後，信裡會說明怎麼登入供應商後台；這段時間不需要重新送出申請。")}
  <table style="border-collapse:collapse;margin:0 0 20px">
    <tr><td style="padding:3px 14px 3px 0;color:#64748b;font-size:13px">申請編號</td>
        <td style="padding:3px 0;font-size:13px;font-family:ui-monospace,monospace">${esc(ref)}</td></tr>
    <tr><td style="padding:3px 14px 3px 0;color:#64748b;font-size:13px">送出時間</td>
        <td style="padding:3px 0;font-size:13px">${esc(when)}</td></tr>
  </table>
  ${p("有任何問題，直接回覆這封信即可。")}
  ${hr}
  ${small("如果你沒有申請過 iFoodmap 供應商，可能是有人填錯了信箱，請直接忽略這封信。")}`);

  const text = [
    "我們已收到你的供應商入駐申請",
    "",
    `感謝你申請成為 iFoodmap 合作供應商。我們會在${REVIEW_TIME_TEXT}內完成審核，結果會以 Email 寄到這個信箱。`,
    "審核通過後，信裡會說明怎麼登入供應商後台；這段時間不需要重新送出申請。",
    "",
    `申請編號：${ref}`,
    `送出時間：${when}`,
    "",
    "有任何問題，直接回覆這封信即可。",
    "如果你沒有申請過 iFoodmap 供應商，可能是有人填錯了信箱，請直接忽略這封信。",
  ].join("\n");

  return { subject, html, text };
};

// ---------------------------------------------------------------------
// 3) 核准,但 email 原本就有帳號 → 請用原本的帳號登入
//    (新帳號走 Supabase Auth 的邀請信,不在這裡)
// ---------------------------------------------------------------------

export const approvedExistingAccountMail = (opts: { companyName: string; email: string; siteUrl: string }): Mail => {
  const subject = "你的 iFoodmap 供應商申請已通過";
  const loginUrl = `${opts.siteUrl}/`;
  const resetUrl = `${opts.siteUrl}/reset-password`;
  const company = String(opts.companyName ?? "").trim();

  const html = shell(`
  <h1 style="font-size:19px;margin:0 0 12px">供應商申請已通過</h1>
  ${p(`${company ? `「${esc(company)}」的` : "你的"}供應商入駐申請已經通過審核。`)}
  ${p(`這個 Email（${esc(opts.email)}）原本就有 iFoodmap 帳號，所以不會再寄設定密碼的信 —— 請直接用<strong>原本的帳號</strong>登入，就會看到供應商後台。`)}
  ${button(loginUrl, "登入 iFoodmap")}
  ${p(`忘記密碼、或從來沒有設定過密碼的話，請到 <a href="${esc(resetUrl)}" style="color:#059669">${esc(resetUrl)}</a> 用這個 Email 重新設定。`)}
  ${hr}
  ${small("有任何問題，直接回覆這封信即可。")}`);

  const text = [
    "供應商申請已通過",
    "",
    `${company ? `「${company}」的` : "你的"}供應商入駐申請已經通過審核。`,
    `這個 Email（${opts.email}）原本就有 iFoodmap 帳號，所以不會再寄設定密碼的信 —— 請直接用原本的帳號登入，就會看到供應商後台。`,
    "",
    `登入：${loginUrl}`,
    `忘記密碼、或從來沒有設定過密碼的話，請到 ${resetUrl} 用這個 Email 重新設定。`,
    "",
    "有任何問題，直接回覆這封信即可。",
  ].join("\n");

  return { subject, html, text };
};

// ---------------------------------------------------------------------
// 4) 退件 → 申請者
//    只收「給申請者的說明」這一個參數 —— admin_notes 是內部備註,連傳都傳不進來。
// ---------------------------------------------------------------------

export const rejectionMail = (opts: { applicantMessage?: string | null }): Mail => {
  const subject = "關於你的 iFoodmap 供應商入駐申請";
  const message = String(opts.applicantMessage ?? "").trim();

  const note = message
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:0 0 20px">
         <div style="font-size:12px;color:#64748b;margin-bottom:6px">審核說明</div>
         <div style="font-size:14px;line-height:1.75;color:#0f172a">${escMultiline(message)}</div>
       </div>`
    : "";

  const html = shell(`
  <h1 style="font-size:19px;margin:0 0 12px">關於你的供應商入駐申請</h1>
  ${p("感謝你申請成為 iFoodmap 合作供應商。經過審核，這次的申請暫時無法通過。")}
  ${note}
  ${p("之後情況有變，歡迎再次提出申請；有任何問題，直接回覆這封信即可。")}`);

  const text = [
    "關於你的供應商入駐申請",
    "",
    "感謝你申請成為 iFoodmap 合作供應商。經過審核，這次的申請暫時無法通過。",
    ...(message ? ["", "審核說明：", message] : []),
    "",
    "之後情況有變，歡迎再次提出申請；有任何問題，直接回覆這封信即可。",
  ].join("\n");

  return { subject, html, text };
};

// ---------------------------------------------------------------------
// 寄信(Resend)
// ---------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  id: string | null;
  error: string | null;
}

export type SendMail = (msg: { from: string; to: string[]; subject: string; html: string; text: string; replyTo?: string | null }) => Promise<SendResult>;

export const createResendSender = (apiKey: string, fetchImpl: typeof fetch = fetch): SendMail => async (msg) => {
  if (!apiKey) return { ok: false, id: null, error: "RESEND_API_KEY 未設定" };
  const payload: Record<string, unknown> = {
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };
  if (msg.replyTo) payload.reply_to = msg.replyTo;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, id: null, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    let id: string | null = null;
    try {
      id = (JSON.parse(body) as { id?: string }).id ?? null;
    } catch {
      /* 回應不是 JSON 也算寄出 */
    }
    return { ok: true, id, error: null };
  } catch (e) {
    return { ok: false, id: null, error: e instanceof Error ? e.message : "unknown error" };
  }
};
