// 通知信的內容(主旨、內文、連結)—— 純函式,vitest 直接測(render.test.ts)。
//
// 🔴 內文是 HTML:餐廳名、供應商名、品項、金額都是使用者可以填的字,一律先跳脫再塞進模板,
//    不然 NOTIFY_LIVE 開放後,有人可以透過店名/品項名在平台寄出的信裡塞連結或按鈕。
//    主旨是純文字(Resend 的 subject 欄位),不跳脫。

import { escapeHtml } from "./gate.ts";

export type Audience = "supplier" | "restaurant" | "both";

export interface Rule {
  audience: Audience;
  subject: (ctx: Ctx) => string;
  /** 內文開頭那段;ctx 的每個欄位都已經跳脫過,audience 是這封信的收件對象 */
  lead: (ctx: Ctx, audience: "supplier" | "restaurant") => string;
  cta: string;
  /** 收件人該去哪個後台 */
  path: (audience: "supplier" | "restaurant") => string;
  /** 內文要附上事件的原因(退回重新報價、取消):notify 會用 event_id 讀事件的 note */
  needsReason?: boolean;
}

export interface Ctx {
  orderShort: string;
  restaurantName: string;
  supplierName: string;
  amount: string;
  items: string;
  /** 事件的原因(退回重新報價、取消);沒有就是空字串 */
  reason?: string;
}

export const RULES: Record<string, Rule> = {
  dispatched: {
    audience: "supplier",
    subject: (c) => `新訂單待接單 — ${c.restaurantName}`,
    lead: (c) => `${c.restaurantName} 有一張新的採購單指派給你,品項:${c.items}。<br>越快回覆成交機率越高,請盡快接單並報價。`,
    cta: "查看訂單",
    path: () => "/supplier/orders",
  },
  quoted: {
    audience: "restaurant",
    subject: (c) => `${c.supplierName} 已報價 — 訂單 ${c.orderShort}`,
    lead: (c) => `${c.supplierName} 已針對你的採購單報價${c.amount ? `,金額 ${c.amount}` : ""}。<br>請進後台確認訂單,確認後供應商才會安排出貨。`,
    cta: "確認訂單",
    path: () => "/restaurant/orders",
  },
  shipped: {
    audience: "restaurant",
    subject: (c) => `${c.supplierName} 已出貨 — 訂單 ${c.orderShort}`,
    lead: (c) => `${c.supplierName} 已安排出貨,品項:${c.items}。<br>收到貨之後記得回系統按「已收到貨」。`,
    cta: "查看進度",
    path: () => "/restaurant/orders",
  },
  delivered: {
    audience: "restaurant",
    subject: (c) => `請確認收貨 — 訂單 ${c.orderShort}`,
    lead: (c) => `${c.supplierName} 回報已送達。<br><strong>請清點後在系統按「已收到貨」</strong> —— 這是我們與供應商對帳的依據,也能順手用拍照對帳檢查有沒有短少。`,
    cta: "確認收貨",
    path: () => "/restaurant/orders",
  },
  received: {
    audience: "supplier",
    subject: (c) => `${c.restaurantName} 已確認收貨 — 訂單 ${c.orderShort}`,
    lead: (c) => `${c.restaurantName} 已確認收到這批貨${c.amount ? `,金額 ${c.amount}` : ""}。<br>這筆交易已計入你的成交紀錄。`,
    cta: "查看訂單",
    path: () => "/supplier/orders",
  },
  discrepancy: {
    audience: "both",
    subject: (c) => `⚠️ 收貨有差異 — 訂單 ${c.orderShort}`,
    lead: (c) => `${c.restaurantName} 在確認 ${c.supplierName} 的這批貨時回報了差異。<br>請雙方盡快確認明細,平台已同步收到通知。`,
    cta: "查看明細",
    path: (a) => (a === "supplier" ? "/supplier/orders" : "/restaurant/orders"),
  },
  disputed: {
    audience: "both",
    subject: (c) => `⚠️ 訂單進入爭議處理 — ${c.orderShort}`,
    lead: () => `這張訂單已進入爭議流程,iFoodmap 客服會介入協調,稍後與你聯繫。`,
    cta: "查看訂單",
    path: (a) => (a === "supplier" ? "/supplier/orders" : "/restaurant/orders"),
  },
};

/** 進行中(派發之後、送達之前)的狀態:從這些狀態取消才要通知對方 */
export const IN_FLIGHT_STATUSES = ["dispatched", "sent", "accepted", "quoted", "confirmed", "shipped", "in_transit"];

const reasonText = (c: Ctx) => (c.reason ? c.reason : "(沒有填寫)");

/** 餐廳退回重新報價(quoted → accepted):請供應商重新報價 */
export const REQUOTE_RULE: Rule = {
  audience: "supplier",
  subject: (c) => `${c.restaurantName} 退回報價,請重新報價 — 訂單 ${c.orderShort}`,
  lead: (c) => `${c.restaurantName} 看過你的報價後退回了,原因:${reasonText(c)}<br>這份報價已作廢,請調整後在後台重新報價。`,
  cta: "重新報價",
  path: () => "/supplier/orders",
  needsReason: true,
};

/** 平台(管理員/系統)取消進行中的單:通知供應商與餐廳 */
export const CANCELLED_BY_PLATFORM_RULE: Rule = {
  audience: "both",
  subject: (c) => `訂單已取消 — 訂單 ${c.orderShort}`,
  lead: (c, a) =>
    a === "supplier"
      ? `iFoodmap 平台已取消 ${c.restaurantName} 的這張訂單,原因:${reasonText(c)}<br>這張單不會再進行,<strong>請不要出貨</strong>;有問題請直接回覆這封信。`
      : `iFoodmap 平台已取消這張訂單(供應商:${c.supplierName}),原因:${reasonText(c)}<br>需要的話可以在後台重新叫貨。`,
  cta: "查看訂單",
  path: (a) => (a === "supplier" ? "/supplier/orders" : "/restaurant/orders"),
  needsReason: true,
};

/** 餐廳取消已經有供應商處理中的單(例如報價後不要了):通知供應商 */
export const CANCELLED_BY_RESTAURANT_RULE: Rule = {
  audience: "supplier",
  subject: (c) => `${c.restaurantName} 取消了訂單 ${c.orderShort}`,
  lead: (c) => `${c.restaurantName} 取消了這張訂單${c.reason ? `,原因:${c.reason}` : ""}。<br>這張單不會再進行,<strong>請不要出貨</strong>。`,
  cta: "查看訂單",
  path: () => "/supplier/orders",
  needsReason: true,
};

export interface EventInfo {
  toStatus: string;
  /** 20260929110000 起 trigger 會帶;舊的 trigger 沒有這兩個欄位 → 退回重新報價、取消不寄(跟以前一樣) */
  fromStatus?: string | null;
  actorRole?: string | null;
}

/** 這個事件要用哪一條通知規則;null = 不寄 */
export const resolveRule = (ev: EventInfo): Rule | null => {
  if (ev.toStatus === "accepted") return ev.fromStatus === "quoted" ? REQUOTE_RULE : null;
  if (ev.toStatus === "cancelled") {
    if (!ev.fromStatus || !IN_FLIGHT_STATUSES.includes(ev.fromStatus)) return null;
    return ev.actorRole === "restaurant" ? CANCELLED_BY_RESTAURANT_RULE : CANCELLED_BY_PLATFORM_RULE;
  }
  return RULES[ev.toStatus] ?? null;
};

export const money = (n: unknown) =>
  n == null || Number.isNaN(Number(n)) ? "" : `NT$ ${Number(n).toLocaleString("zh-TW")}`;

const html = (title: string, lead: string, cta: string, url: string) => `
<div style="font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0f172a">
  <div style="text-align:center;margin-bottom:28px">
    <div style="font-size:20px;font-weight:700;color:#059669">iFoodmap 食材地圖</div>
  </div>
  <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
  <p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 24px">${lead}</p>
  <p style="text-align:center;margin:0 0 24px">
    <a href="${url}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:15px">${cta}</a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0">
    這是 iFoodmap 的系統通知信。有問題請直接回覆這封信或聯絡你的窗口。
  </p>
</div>`;

export interface RenderedMail {
  subject: string;
  /** 已跳脫的 HTML 內文(不含閘門的轉寄說明) */
  body: string;
  url: string;
}

/** 組一封信:主旨用原始字(純文字),內文裡的每個變數都先跳脫 */
export const renderMail = (
  rule: Rule,
  ctx: Ctx,
  audience: "supplier" | "restaurant",
  siteUrl: string,
  orderId: string,
): RenderedMail => {
  const subject = rule.subject(ctx);
  const safe: Ctx = {
    orderShort: escapeHtml(ctx.orderShort),
    restaurantName: escapeHtml(ctx.restaurantName),
    supplierName: escapeHtml(ctx.supplierName),
    amount: escapeHtml(ctx.amount),
    items: escapeHtml(ctx.items),
    reason: escapeHtml(ctx.reason ?? ""),
  };
  // 供應商的連結多帶 ?order=:訂單頁會自動切到這張單所在的狀態分頁(路徑不變,舊連結照樣能開)
  const url = `${siteUrl}${rule.path(audience)}` +
    (audience === "supplier" ? `?order=${encodeURIComponent(orderId)}` : "");
  return { subject, body: html(escapeHtml(subject), rule.lead(safe, audience), rule.cta, url), url };
};
