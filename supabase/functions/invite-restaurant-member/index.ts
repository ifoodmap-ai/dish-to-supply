// Edge Function: 餐廳老闆邀請新成員(老闆 / 店長 / 採購員)加入自己的餐廳。
// 邏輯全在 handler.ts(可注入、有 vitest);這裡只負責接上 Deno 的環境變數與 serve。
//
// 部署:用預設的 JWT 驗證(🔴 不要加 --no-verify-jwt)—— 呼叫者一定是已登入的老闆。
//   supabase functions deploy invite-restaurant-member --project-ref cwvpehqcvbfuynabpqop --use-api
//
// 依賴 migration:
//   20260928150000_restaurant_member_invites.sql  → restaurant_invite_email_status()
//   20260928160000_restaurant_invite_guards.sql   → claim_restaurant_invite_slot()
//   20260928170000_restaurant_member_acceptance.sql → accepted_at(邀請寫成待接受)、member_pending 狀態
import { createClient } from "npm:@supabase/supabase-js@2";
import { createInviteHandler, type AdminClient } from "./handler.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

Deno.serve(
  createInviteHandler({
    admin: admin as unknown as AdminClient,
    siteUrl: Deno.env.get("SITE_URL") ?? "https://dish-to-supply.vercel.app",
  }),
);
