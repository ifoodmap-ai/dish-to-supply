// Edge Function: 訂單關鍵節點 email 通知
//
// 由 order_events 的 AFTER INSERT trigger 透過 pg_net 呼叫(見 migration
// 20260728_order_notifications.sql)。刻意不掛在前端 —— 系統事件(自動派發、
// cron 逾時)也要能通知,而且前端關掉分頁不該影響通知送出。
//
// 通知規則(只在「對方需要採取行動」時寄,避免變成噪音):
//   dispatched → 供應商:有新訂單等你接單
//   quoted     → 餐廳  :供應商報價了,請確認
//   shipped    → 餐廳  :已出貨
//   delivered  → 餐廳  :請確認收貨(這關係到 GMV 認列)
//   received   → 供應商:買家已確認收貨
//   discrepancy/disputed → 雙方 + 平台
//
// 寄不出去不會讓 trigger 失敗 —— 通知是加值,不該擋住交易。

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("NOTIFY_FROM") ?? "iFoodmap 食材地圖 <noreply@gathertaiwan.com>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://dish-to-supply.vercel.app";

// 這支是 --no-verify-jwt 部署的(DB trigger 沒有使用者 JWT 可用),
// 改用共享密鑰驗證。密鑰同時存在 Supabase secret 與 app_config,
// 刻意不把 service_role key 放進資料庫 —— 那把鑰匙權限太大。
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Audience = "supplier" | "restaurant" | "both";

interface Rule {
  audience: Audience;
  subject: (ctx: Ctx) => string;
  lead: (ctx: Ctx) => string;
  cta: string;
  /** 收件人該去哪個後台 */
  path: (audience: "supplier" | "restaurant") => string;
}

interface Ctx {
  orderShort: string;
  restaurantName: string;
  supplierName: string;
  amount: string;
  items: string;
}

const RULES: Record<string, Rule> = {
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

const sendMail = async (to: string, subject: string, body: string) => {
  if (!RESEND_KEY) return { ok: false, err: "RESEND_API_KEY 未設定" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: body })
    });
    if (!res.ok) return { ok: false, err: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, err: null as string | null };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : "unknown" };
  }
};

const money = (n: unknown) =>
  n == null || Number.isNaN(Number(n)) ? "" : `NT$ ${Number(n).toLocaleString("zh-TW")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  if (!NOTIFY_SECRET) return json({ message: "NOTIFY_SECRET 未設定" }, 503);
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${NOTIFY_SECRET}`) return json({ message: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null) as { order_id?: string; to_status?: string } | null;
  const orderId = body?.order_id;
  const toStatus = body?.to_status;
  if (!orderId || !toStatus) return json({ message: "order_id and to_status are required" }, 400);

  const rule = RULES[toStatus];
  // 不在規則裡的狀態(draft/submitted/accepted/confirmed/reviewed/closed…)不寄信,
  // 避免使用者信箱被系統噪音淹沒。
  if (!rule) return json({ data: { skipped: true, reason: `no rule for ${toStatus}` } });

  const { data: order } = await supabase
    .from("supplier_orders")
    .select("id, total_amount, ingredient_list, restaurant_id, supplier_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return json({ message: "order not found" }, 404);

  const [{ data: restaurant }, { data: supplier }] = await Promise.all([
    order.restaurant_id
      ? supabase.from("restaurants").select("name, contact_email:contact_name").eq("id", order.restaurant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.supplier_id
      ? supabase.from("suppliers").select("name, contact_email").eq("id", order.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // 餐廳沒有 contact_email 欄位 —— 收件人取該店 owner/manager 的登入信箱
  const restaurantEmails: string[] = [];
  if (order.restaurant_id) {
    const { data: accounts } = await supabase
      .from("restaurant_accounts")
      .select("user_id, role")
      .eq("restaurant_id", order.restaurant_id)
      .eq("is_active", true)
      .in("role", ["owner", "manager"]);
    for (const a of accounts ?? []) {
      const { data: u } = await supabase.auth.admin.getUserById(a.user_id);
      if (u?.user?.email) restaurantEmails.push(u.user.email);
    }
  }

  const items = Array.isArray(order.ingredient_list)
    ? (order.ingredient_list as { name?: string }[]).map((i) => i?.name).filter(Boolean).slice(0, 5).join("、")
    : "";

  const ctx: Ctx = {
    orderShort: `#${String(order.id).slice(-8).toUpperCase()}`,
    restaurantName: restaurant?.name ?? "買家",
    supplierName: supplier?.name ?? "供應商",
    amount: money(order.total_amount),
    items: items || "(見系統)",
  };

  const targets: { email: string; audience: "supplier" | "restaurant" }[] = [];
  if (rule.audience === "supplier" || rule.audience === "both") {
    if (supplier?.contact_email) targets.push({ email: supplier.contact_email, audience: "supplier" });
  }
  if (rule.audience === "restaurant" || rule.audience === "both") {
    for (const e of restaurantEmails) targets.push({ email: e, audience: "restaurant" });
  }

  if (targets.length === 0) {
    return json({ data: { skipped: true, reason: "no recipient email on file" } });
  }

  const subject = rule.subject(ctx);
  const results: { to: string; ok: boolean; err: string | null }[] = [];

  for (const t of targets) {
    const url = `${SITE_URL}${rule.path(t.audience)}`;
    const r = await sendMail(t.email, subject, html(subject, rule.lead(ctx), rule.cta, url));
    results.push({ to: t.email, ...r });

    // 留紀錄供 /admin/notifications 查
    await supabase.from("notifications").insert({
      recipient: t.email,
      channel: "email",
      title: subject,
      message: `訂單 ${ctx.orderShort} 狀態變更為 ${toStatus}`,
      status: r.ok ? "sent" : "failed",
      sent_at: r.ok ? new Date().toISOString() : null,
    });
  }

  return json({ data: { sent: results.filter((r) => r.ok).length, total: results.length, results } });
});
