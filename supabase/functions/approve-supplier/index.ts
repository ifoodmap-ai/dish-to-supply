// Edge Function:平台管理員審核供應商入駐申請(核准 / 退件)。
// 邏輯全在 handler.ts(可注入、有 vitest);這裡只負責接上 Deno 的環境變數與 serve。
//
// 部署:用預設的 JWT 驗證(🔴 不要加 --no-verify-jwt)—— 呼叫者一定是已登入的平台管理員。
//   supabase functions deploy approve-supplier --project-ref cwvpehqcvbfuynabpqop --use-api
//
// 依賴 migration:20260928180000_supplier_application_mail.sql
//   → supplier_approval_account()、supplier_application_mails、supplier_applications.applicant_message
import { createClient } from "npm:@supabase/supabase-js@2";
import { defaultLog } from "../_shared/db.ts";
import { createResendSender, mailConfigFromEnv } from "../_shared/supplier-mail.ts";
import { type AdminClient, createApproveHandler } from "./handler.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const config = mailConfigFromEnv((k) => Deno.env.get(k));

Deno.serve(
  createApproveHandler({
    admin: admin as unknown as AdminClient,
    send: createResendSender(config.resendKey),
    config,
    log: defaultLog,
  }),
);
