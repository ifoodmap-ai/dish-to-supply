// invite-restaurant-member 的主要邏輯:餐廳老闆邀請新成員(老闆 / 店長 / 採購員)。
//
// 依賴(admin client、網站網址、log)全部用注入的,不碰 Deno 全域 ——
// index.ts 負責接上 Deno.serve,vitest(handler.test.ts)用假的 client 測每一條分支。
//
// 流程:
//   1. 驗 JWT → 必須是「啟用中的老闆」(一律查 restaurant_accounts,不信前端)
//   2. 伺服器端驗證輸入(validate.ts)、確認餐廳與分店
//   3. 佔頻率限制名額(資料庫裡原子化,併發也不會超量;409 也算一次)
//   4. 這個 email 已經有帳號 → 一律 409,不綁、不改既有帳號
//   5. createUser 建帳號 —— email 唯一索引保證併發時只有一個請求建得起來,
//      所以之後的 rollback 只會刪到「這個請求自己建的」帳號
//   6. 寫 restaurant_accounts(寫失敗就刪帳號,這時還沒寄任何信)
//   7. inviteUserByEmail 寄邀請信(寄失敗就刪帳號,成員資料跟著 cascade 刪掉)
import { parseInviteInput, type InviteField } from "./validate.ts";

type ApiError = { message?: string; code?: string; status?: number } | null;
type Result<T> = { data: T; error: ApiError };

interface AuthUser {
  id: string;
  created_at?: string;
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown>;
}

export interface QueryBuilder<T = unknown> extends PromiseLike<Result<T>> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  insert(values: Record<string, unknown>): QueryBuilder<T>;
  maybeSingle(): PromiseLike<Result<T>>;
  single(): PromiseLike<Result<T>>;
}

/** 只描述用得到的 supabase-js 介面(真正的 SupabaseClient 在 index.ts 轉型後傳進來) */
export interface AdminClient {
  auth: {
    getUser(jwt: string): PromiseLike<Result<{ user: AuthUser | null } | null>>;
    admin: {
      createUser(attrs: {
        email: string;
        email_confirm: boolean;
        user_metadata: Record<string, unknown>;
        app_metadata: Record<string, unknown>;
      }): PromiseLike<Result<{ user: AuthUser | null } | null>>;
      inviteUserByEmail(
        email: string,
        opts: { redirectTo: string; data: Record<string, unknown> },
      ): PromiseLike<Result<{ user: AuthUser | null } | null>>;
      getUserById(id: string): PromiseLike<Result<{ user: AuthUser | null } | null>>;
      deleteUser(id: string): PromiseLike<{ error: ApiError }>;
    };
  };
  from(table: string): QueryBuilder;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
}

export type LogFn = (level: "info" | "error", entry: Record<string, unknown>) => void;

export interface InviteDeps {
  admin: AdminClient;
  /** 邀請信連結要回到的網站,例如 https://dish-to-supply.vercel.app */
  siteUrl: string;
  /** 每家店每小時最多嘗試幾次(預設 HOURLY_INVITE_LIMIT) */
  hourlyLimit?: number;
  log?: LogFn;
}

/** 每家店每小時最多「新增成員」嘗試次數 —— 防止有人註冊空殼餐廳拿這支當寄信機或探測器 */
export const HOURLY_INVITE_LIMIT = 20;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MEMBER_COLUMNS = "id, user_id, restaurant_id, branch_id, role, is_active, created_at";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const fail = (status: number, code: string, message: string, field?: InviteField) =>
  json({ code, message, ...(field ? { field } : {}) }, status);

const EMAIL_TAKEN_MESSAGE =
  "這個 Email 已經註冊過 iFoodmap 帳號,無法直接加入。請改用其他 Email,或聯絡平台客服協助";

/** 只取 status / code —— GoTrue 的錯誤 message 可能夾帶 email 原文,不能進 log */
const errInfo = (e: ApiError) => ({ status: e?.status ?? null, code: e?.code ?? null });

export const createInviteHandler = (deps: InviteDeps) => {
  const { admin } = deps;
  const siteUrl = deps.siteUrl.replace(/\/+$/, "");
  const hourlyLimit = deps.hourlyLimit ?? HOURLY_INVITE_LIMIT;
  const log: LogFn =
    deps.log ??
    ((level, entry) => (level === "error" ? console.error : console.log)(JSON.stringify(entry)));

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");

    // --- 1) 身分:一定要是登入中的使用者 ---
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail(401, "UNAUTHENTICATED", "請先登入");
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    // anon key 本身也是合法 JWT,會通過 gateway;但它沒有 sub,getUser 會失敗 → 401
    if (authErr || !authData?.user) return fail(401, "UNAUTHENTICATED", "登入已過期,請重新登入");
    const caller = authData.user;

    // --- 授權:必須是某家餐廳「啟用中的老闆」(只信資料庫) ---
    const { data: ownerRows, error: ownerErr } = await admin
      .from("restaurant_accounts")
      .select("restaurant_id")
      .eq("user_id", caller.id)
      .eq("role", "owner")
      .eq("is_active", true);
    if (ownerErr) return fail(500, "LOOKUP_FAILED", "查詢權限失敗,請稍後再試");
    const ownedIds = [
      ...new Set(((ownerRows as { restaurant_id: string }[] | null) ?? []).map((r) => r.restaurant_id)),
    ];
    if (ownedIds.length === 0) return fail(403, "NOT_OWNER", "只有老闆可以新增成員");

    // --- 2) 輸入驗證 ---
    const body = await req.json().catch(() => null);
    const parsed = parseInviteInput(body);
    if (!parsed.ok) return fail(400, parsed.code, parsed.message, parsed.field);
    const input = parsed.value;

    // 要加進哪一家:前端指定的必須是他當老闆的店;沒指定就只能是唯一那一家
    let restaurantId: string;
    if (input.restaurantId) {
      if (!ownedIds.includes(input.restaurantId)) {
        return fail(403, "NOT_OWNER", "你不是這家餐廳的老闆,不能新增成員");
      }
      restaurantId = input.restaurantId;
    } else if (ownedIds.length === 1) {
      restaurantId = ownedIds[0];
    } else {
      return fail(400, "RESTAURANT_REQUIRED", "你同時是多家餐廳的老闆,請指定要加入哪一家", "restaurant_id");
    }

    const { data: restaurant, error: restErr } = await admin
      .from("restaurants")
      .select("id, is_active")
      .eq("id", restaurantId)
      .maybeSingle();
    if (restErr || !restaurant) return fail(500, "LOOKUP_FAILED", "查詢餐廳失敗,請稍後再試");
    if ((restaurant as { is_active?: boolean }).is_active === false) {
      return fail(403, "RESTAURANT_INACTIVE", "餐廳已停用,無法新增成員");
    }

    if (input.branchId) {
      const { data: branch, error: branchErr } = await admin
        .from("restaurant_branches")
        .select("id, is_active")
        .eq("id", input.branchId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (branchErr) return fail(500, "LOOKUP_FAILED", "查詢分店失敗,請稍後再試");
      if (!branch) return fail(400, "BRANCH_NOT_FOUND", "找不到這個分店", "branch_id");
      if ((branch as { is_active?: boolean }).is_active === false) {
        return fail(400, "BRANCH_INACTIVE", "這個分店已停用,請選其他分店", "branch_id");
      }
    }

    // --- 3) 頻率限制(資料庫裡原子化;之後回 409 的也算一次,探測也一起限速) ---
    const { data: claimed, error: claimErr } = await admin.rpc("claim_restaurant_invite_slot", {
      p_restaurant: restaurantId,
      p_limit: hourlyLimit,
    });
    if (claimErr) return fail(500, "LOOKUP_FAILED", "查詢失敗,請稍後再試");
    if (claimed !== true) {
      return fail(429, "RATE_LIMITED", "這一小時內新增成員的次數太多了,請稍後再試");
    }

    // --- 4) 這個 email 是不是已經有帳號(寄信之前擋,重複的不會寄出任何信) ---
    const { data: statusRows, error: statusErr } = await admin.rpc("restaurant_invite_email_status", {
      p_restaurant: restaurantId,
      p_email: input.email,
    });
    if (statusErr) return fail(500, "LOOKUP_FAILED", "查詢帳號失敗,請稍後再試");
    const existing = (statusRows as { user_id: string; status: string }[] | null)?.[0];
    if (existing?.status === "member_active") {
      const { data: found } = await admin.auth.admin.getUserById(existing.user_id);
      const u = found?.user;
      if (u?.invited_at && !u.email_confirmed_at) {
        return fail(
          409,
          "INVITE_PENDING",
          "已經邀請過這個 Email,對方還沒完成設定。邀請連結 1 小時內有效;過期的話,請對方到登入頁按「忘記密碼」,用這個 Email 設定密碼即可登入",
          "email",
        );
      }
      return fail(409, "ALREADY_MEMBER", "這個 Email 已經是本店成員了", "email");
    }
    if (existing?.status === "member_inactive") {
      return fail(
        409,
        "MEMBER_INACTIVE",
        "這個 Email 曾是本店成員、目前已停用。請在成員列表按「啟用」恢復,不用重新邀請",
        "email",
      );
    }
    if (existing) {
      // 供應商、別家餐廳的成員、平台管理員、註冊到一半的帳號…一律不在這裡綁,
      // 也不說是哪一種身分(不替任何人洩漏別人的帳號狀態)
      return fail(409, "EMAIL_TAKEN", EMAIL_TAKEN_MESSAGE, "email");
    }

    // --- 5) 建帳號(email 唯一索引 = 併發時只有一個請求會成功) ---
    // role=restaurant 只是身分標記;店內角色以 restaurant_accounts.role 為準(老闆之後可改)。
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: input.email,
      email_confirm: false,
      user_metadata: { display_name: input.name },
      app_metadata: {
        role: "restaurant",
        invited_by: caller.id,
        invited_restaurant_id: restaurantId,
      },
    });
    if (createErr || !created?.user) {
      log("error", { event: "invite_create_user_failed", restaurant_id: restaurantId, ...errInfo(createErr) });
      const code = createErr?.code;
      if (code === "email_exists" || code === "user_already_exists" || createErr?.status === 422) {
        return fail(409, "EMAIL_TAKEN", EMAIL_TAKEN_MESSAGE, "email");
      }
      if (createErr?.status === 400 || code === "validation_failed" || code === "email_address_invalid") {
        return fail(400, "EMAIL_INVALID", "Email 格式不正確", "email");
      }
      return fail(502, "CREATE_FAILED", "建立帳號失敗,請稍後再試");
    }
    const userId = created.user.id;

    /** 刪掉「這個請求自己建的」帳號(成員資料會 cascade 刪掉);失敗重試一次 */
    const rollback = async (reason: string): Promise<boolean> => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (!error) {
          log("error", { event: "invite_rolled_back", reason, user_id: userId });
          return true;
        }
        log("error", { event: "invite_rollback_failed", reason, user_id: userId, attempt, ...errInfo(error) });
      }
      return false;
    };
    const rollbackFailed = () =>
      fail(500, "ROLLBACK_FAILED", "新增失敗,而且留下一個未完成的帳號。請不要重試,聯絡平台客服處理");

    // --- 6) 綁進餐廳(這時還沒寄信;失敗就刪帳號) ---
    const { data: member, error: insErr } = await admin
      .from("restaurant_accounts")
      .insert({
        user_id: userId,
        restaurant_id: restaurantId,
        branch_id: input.branchId,
        role: input.role,
        is_active: true,
      })
      .select(MEMBER_COLUMNS)
      .single();
    if (insErr || !member) {
      log("error", { event: "invite_link_failed", restaurant_id: restaurantId, ...errInfo(insErr) });
      if (!(await rollback("restaurant_accounts"))) return rollbackFailed();
      return fail(500, "LINK_FAILED", "成員資料寫入失敗,請再試一次");
    }

    // --- 7) 寄邀請信 ---
    // 連結落在 /reset-password。那一頁只在收到 PASSWORD_RECOVERY 事件時顯示「設定密碼」,
    // 而 supabase-js 只在網址的 type=recovery 時發這個事件;它解析網址時 query 參數
    // 優先於 hash,所以帶 ?type=recovery,受邀的人點信就會直接看到「設定密碼」。
    // (連結過期時沒有 session,會落到「忘記密碼」表單 —— 用同一個 Email 重設就是正確的退路。)
    const invite = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${siteUrl}/reset-password?type=recovery`,
      data: { display_name: input.name },
    });
    if (invite.error || !invite.data?.user) {
      log("error", { event: "invite_send_failed", restaurant_id: restaurantId, ...errInfo(invite.error) });
      if (!(await rollback("invite"))) return rollbackFailed();
      if (invite.error?.status === 429 || invite.error?.code === "over_email_send_rate_limit") {
        return fail(429, "RATE_LIMITED", "邀請信寄得太頻繁,請稍後再試");
      }
      return fail(502, "INVITE_FAILED", "邀請信寄送失敗,請稍後再試");
    }

    // 不記 email(個資),只記 id
    log("info", {
      event: "restaurant_member_invited",
      restaurant_id: restaurantId,
      invited_by: caller.id,
      user_id: userId,
      role: input.role,
    });

    return json({
      data: {
        member,
        email: input.email,
        display_name: input.name,
        invite_pending: true,
      },
    });
  };
};
