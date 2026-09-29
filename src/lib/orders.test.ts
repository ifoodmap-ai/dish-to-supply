// 前端 TRANSITIONS(決定出現哪些按鈕)必須跟資料庫的轉移表(真正的規則)逐條一致:
// 這裡直接解析 migration 20260929100000 的 order_transition_rules() 那一段 VALUES 來比對,
// 任何一邊多一條或少一條都會紅。另外驗 recordOrderEvent 不再送 actor_id、錯誤會帶出原因。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertSpy, result } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "sales@example.com" } } }) },
    from: () => ({
      insert: (v: unknown) => {
        insertSpy(v);
        return { select: () => ({ single: async () => result }) };
      },
    }),
  },
}));

import {
  ADMIN_DISPATCHABLE,
  allowedTransitions,
  formatOrderNo,
  isStaleOrderError,
  OrderEventError,
  recordOrderEvent,
  type ActorRole,
  type OrderStatus,
} from "./orders";

const MIGRATION = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260929100000_order_transition_rules.sql"),
  "utf8",
);

/** 解析 migration 裡 @transitions-begin … @transitions-end 之間的 ('身分','從','到') */
const dbRules = (): Set<string> => {
  const begin = MIGRATION.indexOf("@transitions-begin");
  const end = MIGRATION.indexOf("@transitions-end");
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const block = MIGRATION.slice(begin, end);
  const rows = [...block.matchAll(/\('(\w+)',\s*'(\w+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);
  return new Set(rows);
};

const STATUSES: OrderStatus[] = [
  "draft", "submitted", "dispatched", "accepted", "quoted", "confirmed", "shipped", "in_transit", "delivered",
  "received", "reviewed", "closed", "rejected", "discrepancy", "disputed", "cancelled", "expired",
  "pending", "sent", "completed",
];

/** 前端的表攤平成同樣的 (身分, 從, 到);餐廳拆成老闆/店長/採購員(採購員不能送出) */
const frontRules = (): Set<string> => {
  const out = new Set<string>();
  const add = (actor: string, role: ActorRole) =>
    STATUSES.forEach((from) =>
      allowedTransitions(role, from).forEach((to) => {
        if (actor === "purchaser" && to === "submitted") return;
        out.add(`${actor}|${from}|${to}`);
      }),
    );
  add("owner", "restaurant");
  add("manager", "restaurant");
  add("purchaser", "restaurant");
  add("supplier", "supplier");
  add("admin", "admin");
  add("system", "system");
  return out;
};

describe("轉移表:前端 TRANSITIONS 與資料庫 order_transition_rules() 逐條一致", () => {
  it("資料庫共 85 條", () => {
    expect(dbRules().size).toBe(85);
  });

  it("兩邊完全相同(多一條、少一條都不行)", () => {
    const db = dbRules();
    const front = frontRules();
    expect([...front].filter((r) => !db.has(r)).sort()).toEqual([]);
    expect([...db].filter((r) => !front.has(r)).sort()).toEqual([]);
  });

  it("供應商最多推到 delivered:received 只有餐廳能觸發", () => {
    STATUSES.forEach((from) => {
      expect(allowedTransitions("supplier", from)).not.toContain("received");
    });
  });

  it("供應商在各狀態的按鈕:接單/拒單、報價、出貨、送達", () => {
    expect(allowedTransitions("supplier", "dispatched")).toEqual(["accepted", "rejected"]);
    expect(allowedTransitions("supplier", "accepted")).toEqual(["quoted"]);
    expect(allowedTransitions("supplier", "quoted")).toEqual([]);
    expect(allowedTransitions("supplier", "confirmed")).toEqual(["shipped"]);
    expect(allowedTransitions("supplier", "shipped")).toEqual(["in_transit", "delivered"]);
    expect(allowedTransitions("supplier", "in_transit")).toEqual(["delivered"]);
    expect(allowedTransitions("supplier", "delivered")).toEqual([]);
  });

  it("管理員可以從待派發、被拒、逾時派單;畫面上的「派給…」狀態都在轉移表裡,而且不含草稿", () => {
    expect(ADMIN_DISPATCHABLE).toEqual(["submitted", "pending", "rejected", "expired"]);
    ADMIN_DISPATCHABLE.forEach((s) => {
      expect(allowedTransitions("admin", s)).toContain("dispatched");
    });
    expect(ADMIN_DISPATCHABLE).not.toContain("draft");
    expect(allowedTransitions("admin", "dispatched")).toEqual([]);
  });
});

describe("recordOrderEvent", () => {
  beforeEach(() => {
    insertSpy.mockReset();
    result.data = { id: "ev-1" };
    result.error = null;
  });

  it("不送 actor_id(伺服器用 auth.uid() 決定),其餘欄位照傳", async () => {
    await recordOrderEvent({
      orderId: "order-1",
      fromStatus: "accepted",
      toStatus: "quoted",
      actorRole: "supplier",
      source: "supplier_portal",
      note: "含運",
      payload: { total_amount: 1200 },
    });
    const sent = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("actor_id");
    expect(sent).toMatchObject({
      order_id: "order-1",
      from_status: "accepted",
      to_status: "quoted",
      actor_role: "supplier",
      source: "supplier_portal",
      actor_label: "sales@example.com",
      note: "含運",
      payload: { total_amount: 1200 },
    });
  });

  it("資料庫擋下時丟 OrderEventError,訊息照實、帶出 code 與 hint", async () => {
    result.data = null;
    result.error = {
      message: "這張訂單的狀態已經變成「待報價」,畫面上的資料過期了,請重新整理後再操作",
      code: "P0001",
      hint: "stale_order_status",
    };
    const err = await recordOrderEvent({
      orderId: "order-1", fromStatus: "dispatched", toStatus: "accepted", actorRole: "supplier", source: "supplier_portal",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OrderEventError);
    expect(err.message).toContain("畫面上的資料過期了");
    expect(err.code).toBe("P0001");
    expect(isStaleOrderError(err)).toBe(true);
  });

  it("權限不符不是「過期」:不會被當成重新整理就好", async () => {
    result.data = null;
    result.error = { message: "供應商不能把訂單從「待收貨」改成「待評價」", code: "42501", hint: "transition_not_allowed" };
    const err = await recordOrderEvent({
      orderId: "order-1", fromStatus: "delivered", toStatus: "received", actorRole: "supplier", source: "supplier_portal",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OrderEventError);
    expect(isStaleOrderError(err)).toBe(false);
    expect(isStaleOrderError(new Error("x"))).toBe(false);
  });

  it("orders.ts 也匯出訂單編號函式", () => {
    expect(formatOrderNo("a1e337b0-de8c-4e65-b22a-ca76edcf4143")).toBe("#EDCF4143");
  });
});
