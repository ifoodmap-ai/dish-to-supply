// invite-restaurant-member 的輸入驗證。
// 純函式、不依賴 Deno —— Edge Function 執行時用,vitest 也直接測這支。
// 前端 RestaurantTeamPage 有一份簡化版的即時檢查,訊息文字刻意和這裡一致;
// 真正的把關在這裡(伺服器端),前端檢查只是讓使用者早點看到錯。

export const INVITE_ROLES = ["owner", "manager", "purchaser"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const NAME_MAX = 50;
export const EMAIL_MAX = 254;

// 夠嚴格擋掉明顯打錯的,又不會誤殺正常地址(+ 別名、子網域、數字都要過)。
// 更細的格式交給 GoTrue,它不收的會回 400,我們一樣轉成「Email 格式不正確」。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export type InviteField = "email" | "name" | "role" | "branch_id" | "restaurant_id";

export interface InviteInput {
  email: string;
  name: string;
  role: InviteRole;
  /** null = 全店(不限分店) */
  branchId: string | null;
  /** 前端帶來的餐廳 id —— 只當「指定哪一家」用,授權一律以 restaurant_accounts 為準 */
  restaurantId: string | null;
}

export type ParseResult =
  | { ok: true; value: InviteInput }
  | { ok: false; code: string; message: string; field?: InviteField };

const fail = (code: string, message: string, field?: InviteField): ParseResult => ({
  ok: false,
  code,
  message,
  field,
});

/** 空字串 / null / undefined → null;其他值必須是 UUID */
const optionalUuid = (v: unknown): { ok: true; value: string | null } | { ok: false } => {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v === "string" && UUID_RE.test(v.trim())) return { ok: true, value: v.trim().toLowerCase() };
  return { ok: false };
};

export const isInviteRole = (v: unknown): v is InviteRole =>
  typeof v === "string" && (INVITE_ROLES as readonly string[]).includes(v);

export const parseInviteInput = (body: unknown): ParseResult => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("INVALID_BODY", "請求格式錯誤");
  }
  const b = body as Record<string, unknown>;

  // --- email ---
  if (b.email !== undefined && b.email !== null && typeof b.email !== "string") {
    return fail("EMAIL_INVALID", "Email 格式不正確", "email");
  }
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email) return fail("EMAIL_REQUIRED", "請輸入 Email", "email");
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return fail("EMAIL_INVALID", "Email 格式不正確", "email");
  }

  // --- 姓名 ---
  if (b.name !== undefined && b.name !== null && typeof b.name !== "string") {
    return fail("NAME_INVALID", "姓名格式不正確", "name");
  }
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return fail("NAME_REQUIRED", "請輸入姓名", "name");
  if (CONTROL_RE.test(name)) return fail("NAME_INVALID", "姓名格式不正確", "name");
  if ([...name].length > NAME_MAX) {
    return fail("NAME_TOO_LONG", `姓名最多 ${NAME_MAX} 個字`, "name");
  }

  // --- 角色 ---
  if (b.role === undefined || b.role === null || b.role === "") {
    return fail("ROLE_REQUIRED", "請選擇角色", "role");
  }
  if (!isInviteRole(b.role)) return fail("ROLE_INVALID", "角色不正確", "role");

  // --- 分店 / 餐廳 ---
  const branch = optionalUuid(b.branch_id);
  if (!branch.ok) return fail("BRANCH_INVALID", "分店不正確", "branch_id");
  const restaurant = optionalUuid(b.restaurant_id);
  if (!restaurant.ok) return fail("RESTAURANT_INVALID", "餐廳不正確", "restaurant_id");

  return {
    ok: true,
    value: {
      email,
      name,
      role: b.role,
      branchId: branch.value,
      restaurantId: restaurant.value,
    },
  };
};
