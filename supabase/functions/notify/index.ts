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
//
// 🔴 寄信閘門(gate.ts):NOTIFY_LIVE 不是 "true" 時,所有收件人換成 ifoodmaptw@gmail.com、
//    主旨加「[測試轉寄]」、內文開頭列出原收件人。業主同意前不要設 NOTIFY_LIVE。
//
// 部署(verify_jwt=false,見 supabase/config.toml):
//   supabase functions deploy notify --project-ref cwvpehqcvbfuynabpqop --use-api --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { isLive, planDeliveries, type Recipient } from "./gate.ts";
import { money, renderMail, RULES, type Ctx } from "./render.ts";
// 訂單編號與三個後台同一支函式(src/lib/order-number.ts 沒有任何 import,Deno 可以直接載入;
// --use-api 部署時 CLI 會把它一起上傳)
import { formatOrderNo } from "../../../src/lib/order-number.ts";

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


const sendMail = async (
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; err: string | null; id: string | null }> => {
  if (!RESEND_KEY) return { ok: false, err: "RESEND_API_KEY 未設定", id: null };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: body })
    });
    if (!res.ok) return { ok: false, err: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`, id: null };
    const sent = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, err: null, id: sent?.id ?? null };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : "unknown", id: null };
  }
};

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

  // 餐廳沒有 contact_email 欄位 —— 收件人取該店 owner/manager 的登入信箱。
  // 還沒按「接受」的受邀者(accepted_at = null)不是成員,不能收到這家店的訂單內容
  // (不然有人可以邀請任意 email 當店長,讓平台替他寄訂單信給陌生人)。
  const restaurantEmails: string[] = [];
  if (order.restaurant_id) {
    const { data: accounts } = await supabase
      .from("restaurant_accounts")
      .select("user_id, role")
      .eq("restaurant_id", order.restaurant_id)
      .eq("is_active", true)
      .not("accepted_at", "is", null)
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
    orderShort: formatOrderNo(order.id),
    restaurantName: restaurant?.name ?? "買家",
    supplierName: supplier?.name ?? "供應商",
    amount: money(order.total_amount),
    items: items || "(見系統)",
  };

  const targets: Recipient[] = [];
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
  // 閘門:NOTIFY_LIVE 不是 "true" 就只寄內部測試信箱(每次請求都重讀,不快取)
  const live = isLive(Deno.env.get("NOTIFY_LIVE"));
  const deliveries = planDeliveries(targets, subject, live);
  const results: {
    to: string;
    subject: string;
    original_count: number;
    ok: boolean;
    err: string | null;
    id: string | null;
  }[] = [];

  for (const d of deliveries) {
    // 內文裡的店名、品項等都在 renderMail 裡跳脫過(主旨是純文字不跳脫)
    const mail = renderMail(rule, ctx, d.audience, SITE_URL, String(order.id));
    const mailBody = (d.forwardNote ?? "") + mail.body;
    const r = await sendMail(d.to, d.subject, mailBody);
    results.push({ to: d.to, subject: d.subject, original_count: d.originalRecipients.length, ...r });

    // 留紀錄供 /admin/notifications 查(recipient 記實際寄出的信箱)
    await supabase.from("notifications").insert({
      recipient: d.to,
      channel: "email",
      title: d.subject,
      message:
        `訂單 ${ctx.orderShort} 狀態變更為 ${toStatus}` +
        (d.forwardNote ? `(測試轉寄,原收件人:${d.originalRecipients.join("、")})` : ""),
      status: r.ok ? "sent" : "failed",
      sent_at: r.ok ? new Date().toISOString() : null,
    });
  }

  return json({ data: { live, sent: results.filter((r) => r.ok).length, total: results.length, results } });
});
