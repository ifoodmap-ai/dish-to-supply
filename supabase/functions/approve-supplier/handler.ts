// approve-supplier 的主要邏輯:平台管理員審核供應商入駐申請(核准 / 退件)。
//
// 依賴(admin client、寄信、設定、log)全部用注入的,不碰 Deno 全域 ——
// index.ts 負責接上 Deno.serve,vitest(handler.test.ts)用假的 client 測每一條分支。
//
// 為什麼退件也放在這支(action: "reject"),而不是讓前端直接改資料庫 + trigger 寄信:
//   - 這支本來就驗 admin JWT(gateway 的 verify_jwt + 這裡再查 app_metadata.role),
//     退件信只可能由管理員觸發;trigger 看到的是資料列,很難分辨是誰、從哪裡改的
//   - 管理員畫面要馬上知道「信到底有沒有寄出去」,pg_net 是非同步的,給不了這個答案
//   - 「給申請者的說明」跟 admin_notes 在這裡分開處理,退件信只拿得到前者
//
// 核准流程:
//   1. 查 email 是不是已經有帳號(supplier_approval_account(),直接查 auth.users)
//      - 已綁定別家供應商 → 409,什麼都不建(supplier_accounts.user_id 是唯一的)
//      - 已有帳號 → 沿用,**絕不改它的 app_metadata / role**(覆寫 role 會把平台管理員降級)
//      - 沒有帳號 → createUser(role=supplier、未驗證、不寄信);email 唯一索引保證併發時
//        只有一個請求建得起來,之後的 rollback 只會刪到「這次自己建的」帳號
//   2. 建 suppliers + supplier_accounts,標記 approved(每一步都檢查錯誤,失敗就 rollback)
//   3. 資料都寫好了才寄信:
//      - 新帳號 → Supabase Auth 的邀請信,連結回 /reset-password?type=invite(直接是「設定密碼」)
//        邀請信寄不出去時退回臨時密碼(僅顯示一次在管理員畫面上)
//      - 既有帳號 → 我們自己寄「申請已通過,請用原本的帳號登入」
import type { Db, DbError, LogFn } from "../_shared/db.ts";
import {
  type ApplicationRecord,
  approvedExistingAccountMail,
  isDeliverableEmail,
  type Mail,
  type MailConfig,
  rejectionMail,
  type SendMail,
} from "../_shared/supplier-mail.ts";

type AuthError = { message?: string; code?: string; status?: number } | null;

export interface AuthUser {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
}

type UserResult = { data: { user: AuthUser | null } | null; error: AuthError };

export interface AdminClient extends Db {
  auth: {
    getUser(jwt: string): PromiseLike<UserResult>;
    admin: {
      createUser(attrs: {
        email: string;
        email_confirm: boolean;
        app_metadata: Record<string, unknown>;
        user_metadata: Record<string, unknown>;
      }): PromiseLike<UserResult>;
      inviteUserByEmail(email: string, opts: { redirectTo: string; data: Record<string, unknown> }): PromiseLike<UserResult>;
      updateUserById(id: string, attrs: Record<string, unknown>): PromiseLike<UserResult>;
      deleteUser(id: string): PromiseLike<{ error: AuthError }>;
    };
  };
}

export interface ApproveDeps {
  admin: AdminClient;
  send: SendMail;
  config: MailConfig;
  log?: LogFn;
  /** 邀請信寄不出去時的臨時密碼(測試可注入固定值) */
  genPassword?: () => string;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** 給申請者的說明、內部備註的長度上限 */
export const APPLICANT_MESSAGE_MAX = 1000;
export const ADMIN_NOTES_MAX = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPLICATION_COLUMNS =
  "id, company_name, contact_name, contact_email, contact_phone, contact_line, categories, service_areas, description, status, admin_notes, applicant_message, created_at";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json({ code, message, ...extra }, status);

export const genTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => chars[n % chars.length]).join("");
};

const isEmailExists = (err: AuthError) =>
  !!err && (err.code === "email_exists" || err.status === 422 || /already (been )?registered/i.test(err.message ?? ""));

/** 選填文字欄位:去頭尾空白、空字串當 null;超過上限回 undefined 讓呼叫端回 400 */
const optionalText = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? undefined : t;
};

export interface ApproveResult {
  supplier_id: string;
  supplier_name: string;
  login_email: string;
  /** new = 這次新建的帳號;existing = 這個 email 原本就有帳號(沿用,不改 role) */
  account: "new" | "existing";
  /** 新帳號:邀請信是否寄出 */
  invited: boolean;
  /** 新帳號且邀請信寄不出去時的臨時密碼(僅此一次) */
  temp_password: string | null;
  /** 既有帳號:「請用原本的帳號登入」通知是否寄出 */
  notified: boolean;
  mail_error: string | null;
}

export const createApproveHandler = (deps: ApproveDeps) => {
  const { admin, send, config } = deps;
  const log: LogFn = deps.log ?? (() => {});
  const genPassword = deps.genPassword ?? genTempPassword;

  const nowIso = () => new Date().toISOString();

  /** 寄給申請者,並在 supplier_application_mails 記一筆(同一筆申請、同一種信只會有一筆 → 不會重複寄) */
  const sendLogged = async (
    applicationId: string,
    kind: "approved_existing_account" | "rejection",
    to: string,
    mail: Mail,
  ): Promise<{ sent: boolean; resend_id: string | null; error: string | null }> => {
    if (!isDeliverableEmail(to)) {
      return { sent: false, resend_id: null, error: "申請上的 Email 格式不正確，沒有寄出通知" };
    }
    const { data, error } = await admin
      .from("supplier_application_mails")
      .insert({ application_id: applicationId, kind, status: "sending", subject: mail.subject, body_text: mail.text })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { sent: false, resend_id: null, error: "這封通知之前已經寄過了，不會重複寄送" };
      log("error", { at: "approve-supplier.mail_log", application_id: applicationId, kind, error: error.message });
      return { sent: false, resend_id: null, error: `寄信紀錄寫入失敗，為避免重複寄送所以沒有寄出（${error.message}）` };
    }
    const mailId = (data as { id: number }).id;
    const r = await send({ from: config.applicantFrom, to: [to], subject: mail.subject, html: mail.html, text: mail.text, replyTo: config.replyTo });
    const { error: ue } = await admin
      .from("supplier_application_mails")
      .update({ status: r.ok ? "sent" : "failed", resend_id: r.id, error: r.error, updated_at: nowIso() })
      .eq("id", mailId);
    if (ue) log("error", { at: "approve-supplier.mail_log_update", mail_id: mailId, error: ue.message });
    log(r.ok ? "info" : "error", { at: "approve-supplier.send", application_id: applicationId, kind, ok: r.ok, resend_id: r.id, error: r.error });
    return { sent: r.ok, resend_id: r.id, error: r.error };
  };

  const lookupAccount = async (email: string) => {
    const { data, error } = await admin.rpc("supplier_approval_account", { p_email: email });
    if (error) return { error };
    const row = (Array.isArray(data) ? data[0] : data) as { user_id?: string; linked_supplier_id?: string | null } | undefined;
    return { error: null as DbError, account: row?.user_id ? { userId: row.user_id, linkedSupplierId: row.linked_supplier_id ?? null } : null };
  };

  /**
   * 收回這次建立的資料。回傳沒收回成功的項目(空陣列 = 全部復原),
   * 呼叫端要據實告訴管理員 —— 不能在刪除失敗時還說「已復原」,否則管理員重按核准會多一筆重複的供應商。
   */
  const rollback = async (
    applicationId: string,
    created: { userId?: string | null; supplierId?: string | null },
  ): Promise<string[]> => {
    const leftovers: string[] = [];
    if (created.supplierId) {
      // supplier_accounts 會跟著 cascade 刪掉(supplier_accounts_supplier_id_fkey ON DELETE CASCADE)
      let { error } = await admin.from("suppliers").delete().eq("id", created.supplierId);
      if (error) ({ error } = await admin.from("suppliers").delete().eq("id", created.supplierId));
      if (error) {
        log("error", { at: "approve-supplier.rollback_supplier", application_id: applicationId, supplier_id: created.supplierId, error: error.message });
        leftovers.push(`供應商 ${created.supplierId}`);
      }
    }
    if (created.userId) {
      let { error } = await admin.auth.admin.deleteUser(created.userId);
      if (error) ({ error } = await admin.auth.admin.deleteUser(created.userId));
      if (error) {
        log("error", { at: "approve-supplier.rollback_user", application_id: applicationId, user_id: created.userId, error: error.message });
        leftovers.push(`帳號 ${created.userId}`);
      }
    }
    return leftovers;
  };

  /** 失敗訊息後面接上復原結果 */
  const withRollbackNote = (message: string, leftovers: string[]) =>
    leftovers.length === 0
      ? `${message}，已復原這次建立的資料`
      : `${message}，而且自動復原沒有完成（${leftovers.join("、")} 還在），請先請工程師手動刪除再重試，否則會多出重複的供應商`;

  const approve = async (app: ApplicationRecord) => {
    if (app.status === "approved") return fail(409, "ALREADY_APPROVED", "這筆申請已經核准過了");
    // 只核准待審的申請:已退件的申請者已經收到退件信,不能再收到一封邀請信(兩封信互相矛盾)
    if (app.status !== "pending") return fail(409, "NOT_PENDING", "這筆申請已經退件，不能直接核准；請對方重新送出申請");
    const email = String(app.contact_email ?? "").trim().toLowerCase();
    if (!isDeliverableEmail(email)) return fail(400, "INVALID_EMAIL", "申請上的 Email 格式不正確，無法建立帳號");
    const displayName = String(app.contact_name ?? "").trim() || String(app.company_name ?? "").trim();

    const linkedMessage = "這個 Email 的帳號已經綁定其他供應商（一個帳號只能綁一家），沒有建立任何資料。請與申請者確認後改用其他 Email。";

    // 1) 既有帳號?
    let found = await lookupAccount(email);
    if (found.error) return fail(500, "LOOKUP_FAILED", "查詢既有帳號失敗", { details: found.error.message });
    if (found.account?.linkedSupplierId) return fail(409, "ACCOUNT_ALREADY_LINKED", linkedMessage);

    let userId: string;
    let createdUserId: string | null = null;
    if (found.account) {
      userId = found.account.userId;
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        app_metadata: { role: "supplier" },
        user_metadata: { display_name: displayName },
      });
      if (!created.error && created.data?.user) {
        userId = created.data.user.id;
        createdUserId = userId;
      } else if (isEmailExists(created.error)) {
        // 查完之後剛好有人用這個 email 註冊 → 當成既有帳號,一樣不動它
        found = await lookupAccount(email);
        if (found.error || !found.account) {
          return fail(500, "CREATE_USER_FAILED", "建立帳號失敗", { details: created.error?.message ?? null });
        }
        if (found.account.linkedSupplierId) return fail(409, "ACCOUNT_ALREADY_LINKED", linkedMessage);
        userId = found.account.userId;
      } else {
        return fail(500, "CREATE_USER_FAILED", "建立帳號失敗", { details: created.error?.message ?? null });
      }
    }

    // 2) 供應商資料 + 帳號綁定
    const { data: supplierData, error: se } = await admin
      .from("suppliers")
      .insert({
        name: app.company_name,
        description: app.description ?? null,
        contact_name: app.contact_name ?? null,
        contact_email: String(app.contact_email ?? "").trim(),
        phone: app.contact_phone ?? null,
        service_areas: app.service_areas ? String(app.service_areas).split(/[,、\s]+/).filter(Boolean) : [],
        is_active: true,
      })
      .select("id, name")
      .single();
    const supplier = supplierData as { id: string; name: string } | null;
    if (se || !supplier) {
      const leftovers = await rollback(app.id, { userId: createdUserId });
      return fail(500, "CREATE_SUPPLIER_FAILED", withRollbackNote("建立供應商資料失敗", leftovers), { details: se?.message ?? null });
    }

    const { error: le } = await admin.from("supplier_accounts").insert({ user_id: userId, supplier_id: supplier.id, is_active: true });
    if (le) {
      if (le.code === "23505") {
        // 這個帳號剛剛被別的請求綁走了(例如兩位管理員同時核准):帳號已經有人在用,
        // 只收回這次建的供應商資料,不能刪帳號(會連帶刪掉對方剛建好的綁定)
        const leftovers = await rollback(app.id, { supplierId: supplier.id });
        return fail(409, "ACCOUNT_ALREADY_LINKED", leftovers.length ? withRollbackNote(linkedMessage, leftovers) : linkedMessage);
      }
      const leftovers = await rollback(app.id, { userId: createdUserId, supplierId: supplier.id });
      return fail(500, "LINK_ACCOUNT_FAILED", withRollbackNote("綁定供應商帳號失敗", leftovers), { details: le.message });
    }

    // 3) 標記 approved —— 一定要檢查錯誤與實際更新的筆數;只從 pending 轉(別的管理員剛退件就不會蓋過去)
    const { data: marked, error: me } = await admin
      .from("supplier_applications")
      .update({ status: "approved", reviewed_at: nowIso() })
      .eq("id", app.id)
      .eq("status", "pending")
      .select("id");
    if (me || !Array.isArray(marked) || marked.length !== 1) {
      const leftovers = await rollback(app.id, { userId: createdUserId, supplierId: supplier.id });
      if (me) return fail(500, "MARK_APPROVED_FAILED", withRollbackNote("更新申請狀態失敗", leftovers), { details: me.message });
      return fail(409, "NOT_PENDING", withRollbackNote("這筆申請剛剛已經被另一位管理員處理了", leftovers));
    }

    const base = { supplier_id: supplier.id, supplier_name: supplier.name, login_email: email };

    // 4) 寄信(資料都寫好了才寄)
    if (!createdUserId) {
      const r = await sendLogged(app.id, "approved_existing_account", email, approvedExistingAccountMail({
        companyName: String(app.company_name ?? ""),
        email,
        siteUrl: config.siteUrl,
      }));
      log("info", { at: "approve-supplier.approved", application_id: app.id, account: "existing", notified: r.sent });
      const result: ApproveResult = { ...base, account: "existing", invited: false, temp_password: null, notified: r.sent, mail_error: r.error };
      return json({ data: result });
    }

    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${config.siteUrl}/reset-password?type=invite`,
      data: { display_name: displayName },
    });
    if (!invite.error) {
      log("info", { at: "approve-supplier.approved", application_id: app.id, account: "new", invited: true });
      const result: ApproveResult = { ...base, account: "new", invited: true, temp_password: null, notified: false, mail_error: null };
      return json({ data: result });
    }

    // 邀請信寄不出去(例如 SMTP 掛了)→ 退回臨時密碼,管理員畫面顯示一次,核准流程不會卡住
    const tempPassword = genPassword();
    const { error: pe } = await admin.auth.admin.updateUserById(createdUserId, { password: tempPassword, email_confirm: true });
    log("error", { at: "approve-supplier.invite_failed", application_id: app.id, error: invite.error.message ?? null, temp_password_set: !pe });
    const result: ApproveResult = {
      ...base,
      account: "new",
      invited: false,
      temp_password: pe ? null : tempPassword,
      notified: false,
      mail_error: invite.error.message ?? "邀請信寄送失敗",
    };
    return json({ data: result });
  };

  const reject = async (app: ApplicationRecord, body: Record<string, unknown>) => {
    if (app.status === "approved") return fail(409, "NOT_PENDING", "已核准的申請不能退件");
    if (app.status !== "pending") return fail(409, "NOT_PENDING", "這筆申請已經退件過了，不會重複寄信");

    const applicantMessage = optionalText(body.applicant_message, APPLICANT_MESSAGE_MAX);
    if (applicantMessage === undefined) {
      return fail(400, "INVALID_APPLICANT_MESSAGE", `給申請者的說明最多 ${APPLICANT_MESSAGE_MAX} 字`);
    }
    const adminNotes = optionalText(body.admin_notes, ADMIN_NOTES_MAX);
    if (adminNotes === undefined) return fail(400, "INVALID_ADMIN_NOTES", `內部備註最多 ${ADMIN_NOTES_MAX} 字`);

    const { data: marked, error } = await admin
      .from("supplier_applications")
      .update({ status: "rejected", reviewed_at: nowIso(), admin_notes: adminNotes, applicant_message: applicantMessage })
      .eq("id", app.id)
      .eq("status", "pending")
      .select("id");
    if (error) return fail(500, "MARK_REJECTED_FAILED", "更新申請狀態失敗", { details: error.message });
    if (!Array.isArray(marked) || marked.length !== 1) {
      return fail(409, "NOT_PENDING", "這筆申請剛剛已經被處理了（可能是另一位管理員），不會重複寄信");
    }

    // 退件信只拿得到「給申請者的說明」;admin_notes 根本不會傳進去
    const r = await sendLogged(app.id, "rejection", String(app.contact_email ?? "").trim(), rejectionMail({ applicantMessage }));
    log("info", { at: "approve-supplier.rejected", application_id: app.id, notified: r.sent });
    return json({ data: { status: "rejected", notified: r.sent, resend_id: r.resend_id, mail_error: r.error } });
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail(401, "UNAUTHENTICATED", "缺少登入憑證，請重新登入");
    const { data: who, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !who?.user) return fail(401, "UNAUTHENTICATED", "登入已過期，請重新登入");
    if ((who.user.app_metadata as { role?: string } | undefined)?.role !== "admin") {
      return fail(403, "FORBIDDEN", "只有平台管理員可以審核供應商申請");
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return fail(400, "INVALID_BODY", "請求格式不正確");
    const applicationId = typeof body.application_id === "string" ? body.application_id.trim() : "";
    if (!UUID_RE.test(applicationId)) return fail(400, "INVALID_APPLICATION_ID", "application_id 格式不正確");
    const action = body.action === undefined ? "approve" : body.action;
    if (action !== "approve" && action !== "reject") return fail(400, "INVALID_ACTION", "action 只能是 approve 或 reject");

    const { data, error } = await admin.from("supplier_applications").select(APPLICATION_COLUMNS).eq("id", applicationId).maybeSingle();
    if (error) return fail(500, "LOAD_FAILED", "讀取申請失敗", { details: error.message });
    const app = data as ApplicationRecord | null;
    if (!app) return fail(404, "NOT_FOUND", "找不到這筆申請");

    return action === "reject" ? reject(app, body) : approve(app);
  };
};
