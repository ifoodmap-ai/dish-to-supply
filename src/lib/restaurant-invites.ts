// 餐廳成員邀請 —— 受邀者這一端:列出 / 接受 / 拒絕自己的邀請,以及拒絕後「建立自己的餐廳」。
//
// 老闆在「分店與成員」頁邀請人(Edge Function invite-restaurant-member),寫進
// restaurant_accounts 的列 accepted_at = null。在受邀者按「接受」之前他**不是**這家店的成員:
// RLS、current_restaurant_ids()、restaurant_role()、portal.ts、RestaurantRoute 都不算他
// (migration 20260928170000_restaurant_member_acceptance.sql)。
//
// 下面三支 RPC 都是 SECURITY DEFINER,只會處理 auth.uid() 自己那一筆待接受的邀請 ——
// 就算前端被改掉、傳別人的邀請 id 進來,資料庫也只會回「找不到」。

import { supabase } from "@/integrations/supabase/client";
import type { RestaurantRole } from "@/components/RestaurantRoute";

export interface PendingRestaurantInvite {
  invite_id: string;
  restaurant_name: string;
  role: RestaurantRole;
  branch_name: string | null;
  invited_at: string;
}

export const RESTAURANT_ROLE_LABEL: Record<RestaurantRole, string> = {
  owner: "老闆",
  manager: "店長",
  purchaser: "採購員",
};

type RpcError = { message?: string; code?: string; hint?: string | null };
type RpcResult<T> = { data: T | null; error: RpcError | null };

const callRpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> => {
  try {
    return (await (supabase as never as {
      rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<RpcResult<T>>;
    }).rpc(fn, args)) as RpcResult<T>;
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
};

const isRole = (v: unknown): v is RestaurantRole =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(RESTAURANT_ROLE_LABEL, v);

/**
 * 我有哪些待接受的邀請,以及查詢有沒有失敗(失敗 ≠ 沒有邀請)。
 *
 * ⚠️ 跟 getUserPortals 一樣:不要在 onAuthStateChange 的 callback 裡直接呼叫(auth lock 會死鎖)。
 */
export const loadPendingRestaurantInvites = async (): Promise<{
  invites: PendingRestaurantInvite[];
  failed: boolean;
}> => {
  const { data, error } = await callRpc<unknown[]>("my_pending_restaurant_invites");
  if (error || !Array.isArray(data)) return { invites: [], failed: true };
  const invites = data.flatMap((row) => {
    const r = row as Partial<PendingRestaurantInvite> | null;
    if (!r || typeof r.invite_id !== "string" || !isRole(r.role)) return [];
    return [
      {
        invite_id: r.invite_id,
        restaurant_name: typeof r.restaurant_name === "string" && r.restaurant_name.trim() ? r.restaurant_name : "未命名餐廳",
        role: r.role,
        branch_name: typeof r.branch_name === "string" && r.branch_name.trim() ? r.branch_name : null,
        invited_at: typeof r.invited_at === "string" ? r.invited_at : "",
      },
    ];
  });
  return { invites, failed: false };
};

/** 只要清單;查詢失敗回空陣列(邀請只是「多一個選項」,不能擋住註冊完成頁之類的流程) */
export const getPendingRestaurantInvites = async (): Promise<PendingRestaurantInvite[]> =>
  (await loadPendingRestaurantInvites()).invites;

// 用字串判別(kind):這個專案的 tsconfig 沒開 strict,布林判別(ok: true/false)不會收窄型別
export type InviteActionResult =
  | { kind: "ok"; restaurantId: string | null }
  | { kind: "gone"; message: string }
  | { kind: "failed"; message: string };

export const INVITE_GONE_MESSAGE = "這個邀請已經失效(可能被取消或已處理過),請重新整理頁面";
export const INVITE_FAILED_MESSAGE = "操作沒有成功,請稍後再試一次";

/** 資料庫回「找不到這筆待接受的邀請」(被取消、已處理過、或根本不是你的) */
const isGone = (e: RpcError) => e.hint === "invite_not_found" || /invite not found/i.test(e.message ?? "");

const failure = (e: RpcError): InviteActionResult =>
  isGone(e)
    ? { kind: "gone", message: INVITE_GONE_MESSAGE }
    : { kind: "failed", message: INVITE_FAILED_MESSAGE };

/** 接受邀請 → 成為該店成員。成功時回餐廳 id。 */
export const acceptRestaurantInvite = async (inviteId: string): Promise<InviteActionResult> => {
  const { data, error } = await callRpc<string>("accept_restaurant_invite", { p_invite: inviteId });
  if (error) return failure(error);
  return { kind: "ok", restaurantId: typeof data === "string" ? data : null };
};

/** 拒絕邀請 → 那一筆邀請被刪掉(老闆的成員列表上也會消失)。 */
export const declineRestaurantInvite = async (inviteId: string): Promise<InviteActionResult> => {
  const { error } = await callRpc<null>("decline_restaurant_invite", { p_invite: inviteId });
  if (error) return failure(error);
  return { kind: "ok", restaurantId: null };
};

export interface OwnRestaurantInput {
  restaurantName: string;
  contactName: string;
  phone: string;
}

/** 與 create_restaurant_onboarding() 的檢查一致(字數以字元計) */
export const validateOwnRestaurant = (
  input: OwnRestaurantInput,
): Partial<Record<keyof OwnRestaurantInput, string>> => {
  const errors: Partial<Record<keyof OwnRestaurantInput, string>> = {};
  const name = Array.from(input.restaurantName.trim()).length;
  if (name < 2 || name > 100) errors.restaurantName = "餐廳名稱需為 2 至 100 個字元";
  if (Array.from(input.contactName.trim()).length > 80) errors.contactName = "聯絡人姓名不可超過 80 個字元";
  if (Array.from(input.phone.trim()).length > 30) errors.phone = "電話不可超過 30 個字元";
  return errors;
};

/**
 * 已登入、沒有任何身分的人(例如剛拒絕邀請)建立自己的餐廳 ——
 * 跟自助註冊用同一支 create_restaurant_onboarding(),自己就是老闆(已接受)。
 */
export const createOwnRestaurant = async (
  input: OwnRestaurantInput,
): Promise<{ kind: "ok"; restaurantId: string } | { kind: "failed"; message: string }> => {
  const { data, error } = await callRpc<string>("create_restaurant_onboarding", {
    p_name: input.restaurantName.trim(),
    p_contact_name: input.contactName.trim() || null,
    p_contact_phone: input.phone.trim() || null,
  });
  if (error || typeof data !== "string" || !data) {
    return { kind: "failed", message: "餐廳建立失敗,請稍後再試" };
  }
  return { kind: "ok", restaurantId: data };
};
