// 使用者身分 → 後台入口。全站唯一的判斷來源。
//
// 一個人可以同時有多重身分(例如老闆本人既是平台管理員、又掛在某家供應商底下),
// 所以這裡回傳的是「清單」而不是單一角色 —— 登入導向取第一個,身分切換器列全部。
//
// 三種身分的判斷方式各不相同:
//   admin      → JWT 的 app_metadata.role
//   supplier   → supplier_accounts 有啟用中的紀錄
//   restaurant → restaurant_accounts 有啟用中的紀錄

import { supabase } from "@/integrations/supabase/client";

export type PortalKey = "admin" | "supplier" | "restaurant";

export interface PortalInfo {
  key: PortalKey;
  /** 側邊欄與切換器顯示的名稱 */
  label: string;
  /** 這個身分底下的單位名稱(餐廳名/供應商名),管理員為 null */
  orgName: string | null;
  /** 站內路徑 */
  path: string;
  /** 是否在另一個網域(管理員站),切過去要重新登入 */
  external: boolean;
}

export interface SessionLike {
  user?: { id?: string; app_metadata?: { role?: string } } | null;
}

/** 管理員站的網址。空字串代表跟目前站台同一個 origin(admin build 自己)。 */
export const ADMIN_SITE_URL =
  (import.meta.env.VITE_ADMIN_SITE_URL as string | undefined) ?? "https://ifoodmap-admin.vercel.app";

/** 目前這份建置是不是管理員站 */
export const IS_ADMIN_BUILD = (import.meta.env.VITE_PORTAL as string | undefined) === "admin";

const PORTAL_META: Record<PortalKey, { label: string; path: string; order: number }> = {
  admin: { label: "平台營運後台", path: "/admin", order: 0 },
  supplier: { label: "供應商後台", path: "/supplier", order: 1 },
  restaurant: { label: "餐廳後台", path: "/restaurant", order: 2 },
};

/**
 * 查某張帳號綁定表。
 * PostgREST 的 builder 是 thenable 而不是真正的 Promise(沒有 .catch),
 * 所以這裡自己 await 起來、把錯誤收乾淨,回傳單純的陣列。
 */
const fetchAccounts = async <T>(table: string, cols: string, userId: string): Promise<T[]> => {
  try {
    const res = (await (supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: boolean) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from(table)
      .select(cols)
      .eq("user_id", userId)
      .eq("is_active", true)) as { data: T[] | null; error: { message: string } | null };

    return res.error ? [] : res.data ?? [];
  } catch {
    return [];
  }
};

/**
 * 查出這個 session 能進哪些後台。
 * 依 admin → supplier → restaurant 排序(導向優先序)。
 *
 * ⚠️ 不要在 supabase.auth.onAuthStateChange 的 callback 內直接呼叫 ——
 *    supabase-js v2 在 callback 期間持有 auth lock,查 DB 會鎖死。
 *    請在 callback 外(setTimeout 0 之後)呼叫。
 */
export const getUserPortals = async (session: SessionLike | null): Promise<PortalInfo[]> => {
  const uid = session?.user?.id;
  if (!uid) return [];

  const portals: PortalInfo[] = [];

  if (session?.user?.app_metadata?.role === "admin") {
    portals.push({
      key: "admin",
      label: PORTAL_META.admin.label,
      orgName: null,
      path: PORTAL_META.admin.path,
      // 在前台站看到的管理員入口是另一個網域;在 admin 站上就是站內
      external: !IS_ADMIN_BUILD,
    });
  }

  const [sup, rest] = await Promise.all([
    fetchAccounts<{ supplier_id: string; suppliers?: { name?: string } | null }>(
      "supplier_accounts", "supplier_id, suppliers(name)", uid
    ),
    fetchAccounts<{ restaurant_id: string; restaurants?: { name?: string } | null }>(
      "restaurant_accounts", "restaurant_id, restaurants(name)", uid
    ),
  ]);

  if (sup.length) {
    portals.push({
      key: "supplier",
      label: PORTAL_META.supplier.label,
      orgName: sup[0]?.suppliers?.name ?? null,
      path: PORTAL_META.supplier.path,
      external: IS_ADMIN_BUILD,
    });
  }

  if (rest.length) {
    portals.push({
      key: "restaurant",
      label: PORTAL_META.restaurant.label,
      orgName: rest[0]?.restaurants?.name ?? null,
      path: PORTAL_META.restaurant.path,
      external: IS_ADMIN_BUILD,
    });
  }

  return portals.sort((a, b) => PORTAL_META[a.key].order - PORTAL_META[b.key].order);
};

/** 前台站的網址(給 admin 站的切換器連回來用) */
export const MAIN_SITE_URL =
  (import.meta.env.VITE_MAIN_SITE_URL as string | undefined) ?? "https://dish-to-supply.vercel.app";

/** 把 PortalInfo 轉成可直接跳的完整網址 */
export const portalHref = (p: PortalInfo): string => {
  if (!p.external) return p.path;
  const base = p.key === "admin" ? ADMIN_SITE_URL : MAIN_SITE_URL;
  return `${base.replace(/\/$/, "")}${p.path}`;
};

/** 登入後預設要去哪。沒有任何身分回 null(呼叫端決定怎麼提示)。 */
export const defaultPortal = (portals: PortalInfo[]): PortalInfo | null => portals[0] ?? null;

/** 使用者選的角色跟實際身分是否相符 */
export const hasPortal = (portals: PortalInfo[], key: PortalKey): boolean =>
  portals.some((p) => p.key === key);

export const PORTAL_LABEL: Record<PortalKey, string> = {
  admin: PORTAL_META.admin.label,
  supplier: PORTAL_META.supplier.label,
  restaurant: PORTAL_META.restaurant.label,
};
