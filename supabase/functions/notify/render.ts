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
  lead: (ctx: Ctx) => string;
  cta: string;
  /** 收件人該去哪個後台 */
  path: (audience: "supplier" | "restaurant") => string;
}

export interface Ctx {
  orderShort: string;
  restaurantName: string;
  supplierName: string;
  amount: string;
  items: string;
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
  };
  // 供應商的連結多帶 ?order=:訂單頁會自動切到這張單所在的狀態分頁(路徑不變,舊連結照樣能開)
  const url = `${siteUrl}${rule.path(audience)}` +
    (audience === "supplier" ? `?order=${encodeURIComponent(orderId)}` : "");
  return { subject, body: html(escapeHtml(subject), rule.lead(safe), rule.cta, url), url };
};
