// 「叫貨與訂單 → 訂單」分頁(/restaurant/orders)的簽核規則(業主拍板 Q8-A):
//   - 草稿不列在這頁(查詢就排除),只在頂端提示「待簽核 N 張」並連到叫貨分頁
//   - 這頁沒有任何「送出訂單」鈕 —— 送出只在叫貨分頁的待簽核區、只給老闆/店長
//   - 其他既有動作(確認訂單、取消、收貨…)照舊
// supabase 換成記憶體假資料(每次查詢都記錄下來),並擋掉所有網路請求。

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantOrdersPage from "./RestaurantOrdersPage";

type Role = "owner" | "manager" | "purchaser";
type Filter = [op: string, col: string, val: unknown];
interface Call { table: string; op: string; cols?: string; values?: unknown; filters: Filter[] }

const { state, recordOrderEvent } = vi.hoisted(() => ({
  state: {
    role: "owner" as Role,
    calls: [] as Call[],
    listRows: [] as Record<string, unknown>[],
    draftRows: [] as Record<string, unknown>[],
  },
  recordOrderEvent: vi.fn(),
}));

/** 只實作這頁用得到的 PostgREST builder;回傳什麼依篩選條件決定 */
const fakeFrom = (table: string) => {
  const call: Call = { table, op: "select", filters: [] };
  const resolve = () => {
    state.calls.push(call);
    if (table === "suppliers") return { data: [{ id: "sup-1", name: "鮮綠農產" }], error: null };
    if (table === "supplier_orders") {
      const isDraftCount = call.filters.some(([op, col, val]) => op === "eq" && col === "status" && val === "draft");
      return { data: isDraftCount ? state.draftRows : state.listRows, error: null };
    }
    return { data: [], error: null };
  };
  const builder = {
    select: (cols: string) => { call.cols = cols; return builder; },
    insert: (values: unknown) => { call.op = "insert"; call.values = values; return builder; },
    eq: (col: string, val: unknown) => { call.filters.push(["eq", col, val]); return builder; },
    neq: (col: string, val: unknown) => { call.filters.push(["neq", col, val]); return builder; },
    order: () => builder,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };
  return builder;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => fakeFrom(t),
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "owner@example.com" } } }) },
  },
}));

vi.mock("@/components/RestaurantRoute", () => ({
  useRestaurant: () => ({
    id: "account-1",
    restaurant_id: "restaurant-1",
    branch_id: null,
    role: state.role,
    restaurant_name: "好味小館",
  }),
  canSeeCost: (role: Role) => role === "owner" || role === "manager",
  needsApproval: (role: Role) => role === "purchaser",
}));

vi.mock("@/lib/orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orders")>("@/lib/orders");
  return { ...actual, recordOrderEvent, fetchOrderTimeline: vi.fn(async () => []) };
});

vi.mock("@/components/restaurant/ReceiveOrderDialog", () => ({ default: () => null }));
vi.mock("@/components/restaurant/OrderReviewDialog", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const order = (id: string, status: string) => ({
  id,
  status,
  supplier_id: "sup-1",
  ingredient_list: [{ name: "高麗菜", quantity: 3, unit: "kg" }],
  total_amount: 1200,
  notes: null,
  created_at: "2026-09-27T02:00:00Z",
  current_stage_since: "2026-09-27T02:00:00Z",
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/restaurant/orders"]}>
      <RestaurantOrdersPage />
    </MemoryRouter>,
  );

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.role = "owner";
  state.calls = [];
  state.listRows = [order("aaaaaaaa-0000-4000-8000-00000000q001", "quoted"), order("aaaaaaaa-0000-4000-8000-00000000d001", "delivered")];
  state.draftRows = [{ id: "draft-1" }, { id: "draft-2" }];
  recordOrderEvent.mockReset();
  recordOrderEvent.mockResolvedValue({});
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

const waitLoaded = () => screen.findByText("#0000Q001");

describe("RestaurantOrdersPage — 草稿不在訂單分頁", () => {
  it("訂單列表的查詢排除草稿(neq status draft),另外只查草稿張數", async () => {
    renderPage();
    await waitLoaded();

    const orderQueries = state.calls.filter((c) => c.table === "supplier_orders");
    const list = orderQueries.find((c) => c.filters.some(([op]) => op === "neq"));
    expect(list?.filters).toEqual(
      expect.arrayContaining([["eq", "restaurant_id", "restaurant-1"], ["neq", "status", "draft"]]),
    );
    const count = orderQueries.find((c) => c.filters.some(([op, col, val]) => op === "eq" && col === "status" && val === "draft"));
    expect(count?.cols).toBe("id");
  });

  it("就算查詢回來混了一張草稿,也不會畫在列表上", async () => {
    state.listRows = [...state.listRows, order("aaaaaaaa-0000-4000-8000-00000000f001", "draft")];
    renderPage();
    await waitLoaded();

    expect(screen.queryByText("#0000F001")).toBeNull();
    expect(screen.queryByText("草稿")).toBeNull();
  });

  it.each<[Role, RegExp, string]>([
    ["owner", /待簽核 2 張:採購單要在「叫貨」分頁簽核後才會送出/, "前往簽核"],
    ["manager", /待簽核 2 張:採購單要在「叫貨」分頁簽核後才會送出/, "前往簽核"],
    ["purchaser", /待簽核 2 張:採購單要由老闆或店長簽核後才會送出/, "查看待簽核"],
  ])("%s:頂端提示待簽核張數,連到叫貨分頁", async (role, text, linkName) => {
    state.role = role;
    renderPage();
    await waitLoaded();

    const notice = await screen.findByTestId("pending-approval-notice");
    expect(notice).toHaveTextContent(text);
    expect(within(notice).getByRole("link", { name: linkName })).toHaveAttribute("href", "/restaurant/purchase");
  });

  it("沒有草稿就不顯示提示", async () => {
    state.draftRows = [];
    renderPage();
    await waitLoaded();

    expect(screen.queryByTestId("pending-approval-notice")).toBeNull();
  });
});

describe("RestaurantOrdersPage — 沒有送出鈕,其他既有動作照舊", () => {
  it.each<Role>(["owner", "manager", "purchaser"])("%s:整頁沒有「送出訂單」(連混進來的草稿也沒有)", async (role) => {
    state.role = role;
    state.listRows = [...state.listRows, order("aaaaaaaa-0000-4000-8000-00000000f001", "draft")];
    renderPage();
    await waitLoaded();

    expect(screen.queryByRole("button", { name: /送出訂單/ })).toBeNull();
  });

  it("待確認的單照樣有「確認訂單」「取消訂單」,待收貨的單有「已收到貨」「回報異常」", async () => {
    renderPage();
    await waitLoaded();

    expect(screen.getByRole("button", { name: "確認訂單" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消訂單" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已收到貨" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回報異常" })).toBeInTheDocument();
  });

  it("已取消的單(含被退回的草稿)只寫「已取消」,不說轉客服;爭議中的單照舊說已交由客服跟進", async () => {
    state.listRows = [
      ...state.listRows,
      order("aaaaaaaa-0000-4000-8000-00000000c001", "cancelled"),
      order("aaaaaaaa-0000-4000-8000-00000000e001", "disputed"),
    ];
    renderPage();
    await waitLoaded();

    const cancelledCard = (await screen.findByText("#0000C001")).closest("[class*='rounded']") as HTMLElement;
    expect(cancelledCard).toHaveTextContent("這張訂單已取消");
    expect(cancelledCard).not.toHaveTextContent("客服");
    const disputedCard = screen.getByText("#0000E001").closest("[class*='rounded']") as HTMLElement;
    expect(disputedCard).toHaveTextContent("這張訂單目前為「爭議中」,已交由客服跟進");
  });

  it("按「確認訂單」一樣只走 recordOrderEvent(quoted → confirmed)", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitLoaded();

    await user.click(screen.getByRole("button", { name: "確認訂單" }));
    await waitFor(() => expect(recordOrderEvent).toHaveBeenCalledTimes(1));
    expect(recordOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "aaaaaaaa-0000-4000-8000-00000000q001",
        fromStatus: "quoted",
        toStatus: "confirmed",
        actorRole: "restaurant",
        source: "restaurant_portal",
      }),
    );
  });
});
