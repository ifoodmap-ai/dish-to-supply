// 寄信閘門(2026-09-29,後台精簡 Q1-A):訂單流程接通後,每一步都會自動寄信給真實的餐廳與供應商。
// 業主同意正式開放之前,環境變數 NOTIFY_LIVE 不是 "true" 就一律只寄到內部測試信箱:
//   - 收件人全部換成 TEST_INBOX(同一種收件對象合併成一封,原收件人列在內文最前面)
//   - 主旨前面加「[測試轉寄]」
// 🔴 不要自己設定 NOTIFY_LIVE —— 要等業主點頭。開放方式:
//   supabase secrets set NOTIFY_LIVE=true --project-ref cwvpehqcvbfuynabpqop
//
// 這支檔案沒有任何 Deno / npm 相依,vitest 直接測(gate.test.ts)。

export const TEST_INBOX = "ifoodmaptw@gmail.com";
export const TEST_SUBJECT_PREFIX = "[測試轉寄]";

export type Audience = "supplier" | "restaurant";

export interface Recipient {
  email: string;
  audience: Audience;
}

export interface Delivery {
  /** 實際寄到哪裡 */
  to: string;
  audience: Audience;
  subject: string;
  /** 這封信原本要寄給誰(閘門開放時就是 [to]) */
  originalRecipients: string[];
  /** 轉寄時插在內文最前面的說明(HTML);閘門開放時為 null */
  forwardNote: string | null;
}

/** 只有剛好是字串 "true" 才算正式開放;沒設、空字串、"TRUE"、"1" 都當成關閉 */
export const isLive = (flag: string | null | undefined): boolean => flag === "true";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const AUDIENCE_LABEL: Record<Audience, string> = { supplier: "供應商", restaurant: "餐廳" };

export const forwardNoteHtml = (emails: string[], audience: Audience): string =>
  `<div style="font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;max-width:520px;margin:0 auto 8px;` +
  `padding:12px 16px;border:1px dashed #f59e0b;background:#fffbeb;color:#92400e;font-size:13px;line-height:1.6">` +
  `${TEST_SUBJECT_PREFIX} 原本的收件人(${AUDIENCE_LABEL[audience]}):${emails.map(escapeHtml).join("、")}<br>` +
  `正式寄信尚未開放(NOTIFY_LIVE 未開啟),這封信只寄到內部測試信箱,原收件人沒有收到。` +
  `</div>`;

/**
 * 決定這次通知實際要寄哪幾封。
 * - live:每位收件人各一封(原本的行為)
 * - 非 live:同一種收件對象合併成一封寄到 TEST_INBOX(內文連結依對象不同,所以不跨對象合併)
 */
export const planDeliveries = (recipients: Recipient[], subject: string, live: boolean): Delivery[] => {
  if (live) {
    return recipients.map((r) => ({
      to: r.email,
      audience: r.audience,
      subject,
      originalRecipients: [r.email],
      forwardNote: null,
    }));
  }

  const grouped = new Map<Audience, string[]>();
  for (const r of recipients) {
    const list = grouped.get(r.audience) ?? [];
    if (!list.includes(r.email)) list.push(r.email);
    grouped.set(r.audience, list);
  }

  return [...grouped].map(([audience, emails]) => ({
    to: TEST_INBOX,
    audience,
    subject: `${TEST_SUBJECT_PREFIX} ${subject}`,
    originalRecipients: emails,
    forwardNote: forwardNoteHtml(emails, audience),
  }));
};
