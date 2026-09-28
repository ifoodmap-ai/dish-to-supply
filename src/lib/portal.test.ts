import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ */
/* 假的 supabase:記錄每張表查詢帶了哪些條件,回傳我們指定的列             */
/* ------------------------------------------------------------------ */

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, { message: string } | null>,
  queries: [] as { table: string; select: string; filters: string[] }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const q = { table, select: "", filters: [] as string[] };
    h.queries.push(q);
    const result = () => ({ data: h.rows[table] ?? [], error: h.errors[table] ?? null });
    const chain = {
      select: (cols: string) => {
        q.select = cols;
        return chain;
      },
      eq: (col: string, v: unknown) => {
        q.filters.push(`${col}=eq.${String(v)}`);
        return chain;
      },
      not: (col: string, op: string, v: unknown) => {
        q.filters.push(`${col}=not.${op}.${String(v)}`);
        return chain;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  };
  return { supabase: { from } };
});

import { getUserPortals, hasPortal, loadUserPortals } from "./portal";

const session = (role?: string) => ({ user: { id: "u-1", app_metadata: role ? { role } : {} } });

beforeEach(() => {
  h.rows = {};
  h.errors = {};
  h.queries = [];
});

describe("getUserPortals —— 待接受的餐廳邀請不算身分", () => {
  it("只有一筆待接受的邀請(accepted_at = null)→ 沒有餐廳後台", async () => {
    h.rows.restaurant_accounts = [
      { restaurant_id: "r-evil", accepted_at: null, restaurants: { name: "搶先邀請的店" } },
    ];
    const portals = await getUserPortals(session());
    expect(portals).toEqual([]);
    expect(hasPortal(portals, "restaurant")).toBe(false);
  });

  it("已接受的成員資格 → 有餐廳後台,名稱取已接受的那一家", async () => {
    h.rows.restaurant_accounts = [
      { restaurant_id: "r-pending", accepted_at: null, restaurants: { name: "還沒接受的店" } },
      { restaurant_id: "r-mine", accepted_at: "2026-09-01T00:00:00Z", restaurants: { name: "我的店" } },
    ];
    const portals = await getUserPortals(session());
    expect(portals.map((p) => p.key)).toEqual(["restaurant"]);
    expect(portals[0].orgName).toBe("我的店");
  });

  it("查詢一定帶 user_id、is_active=true、accepted_at 不是 null(伺服器端也先篩掉)", async () => {
    await getUserPortals(session());
    const q = h.queries.find((x) => x.table === "restaurant_accounts");
    expect(q?.filters).toEqual(["user_id=eq.u-1", "is_active=eq.true", "accepted_at=not.is.null"]);
    expect(q?.select).toContain("accepted_at");
  });

  it("供應商身分照舊只看 is_active(那張表沒有邀請制)", async () => {
    h.rows.supplier_accounts = [{ supplier_id: "s-1", suppliers: { name: "好菜行" } }];
    const portals = await getUserPortals(session());
    expect(portals.map((p) => p.key)).toEqual(["supplier"]);
    const q = h.queries.find((x) => x.table === "supplier_accounts");
    expect(q?.filters).toEqual(["user_id=eq.u-1", "is_active=eq.true"]);
  });

  it("管理員 + 待接受的餐廳邀請 → 只有管理員身分", async () => {
    h.rows.restaurant_accounts = [{ restaurant_id: "r-x", accepted_at: null, restaurants: { name: "X" } }];
    const portals = await getUserPortals(session("admin"));
    expect(portals.map((p) => p.key)).toEqual(["admin"]);
  });

  it("查詢失敗 → getUserPortals 當作沒有這個身分,不丟例外", async () => {
    h.errors.restaurant_accounts = { message: "boom" };
    await expect(getUserPortals(session())).resolves.toEqual([]);
  });

  it("loadUserPortals 分得出「查詢失敗」與「真的沒有身分」", async () => {
    await expect(loadUserPortals(session())).resolves.toEqual({ portals: [], failed: false });
    h.errors.supplier_accounts = { message: "upstream timeout" };
    h.rows.restaurant_accounts = [{ restaurant_id: "r-1", accepted_at: "2026-09-01T00:00:00Z", restaurants: { name: "我的店" } }];
    const res = await loadUserPortals(session());
    expect(res.failed).toBe(true);
    // 查得到的身分照樣回來
    expect(res.portals.map((p) => p.key)).toEqual(["restaurant"]);
  });

  it("沒有登入 → 空清單,不查資料庫", async () => {
    await expect(getUserPortals(null)).resolves.toEqual([]);
    expect(h.queries).toEqual([]);
  });
});
