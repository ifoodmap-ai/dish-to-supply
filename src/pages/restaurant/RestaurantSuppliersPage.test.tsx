// 「叫貨與訂單 → 供應商」分頁(/restaurant/suppliers):「查看」不再帶人去公開供應商頁
// (那頁是給訪客看的,原本的詢價是死路,業主拍板 Q7-A),改成在卡片裡就地展開績效。
// supabase 換成記憶體假資料,並擋掉所有網路請求。

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantSuppliersPage from "./RestaurantSuppliersPage";

type Role = "owner" | "manager" | "purchaser";
const { state } = vi.hoisted(() => ({ state: { role: "owner" as Role } }));

const ORDERS = [
  { id: "aaaaaaaa-0000-4000-8000-0000000000a1", supplier_id: "sup-1", total_amount: 1000, status: "received", created_at: "2026-09-20T01:00:00Z" },
  { id: "aaaaaaaa-0000-4000-8000-0000000000a2", supplier_id: "sup-1", total_amount: 500, status: "delivered", created_at: "2026-09-26T01:00:00Z" },
  { id: "aaaaaaaa-0000-4000-8000-0000000000b1", supplier_id: "sup-2", total_amount: 800, status: "quoted", created_at: "2026-09-25T01:00:00Z" },
];

const TABLES: Record<string, unknown[]> = {
  supplier_orders: ORDERS,
  suppliers: [
    { id: "sup-1", name: "鮮綠農產", description: "當日採收的葉菜與根莖類", service_areas: ["台北市", "新北市"] },
    { id: "sup-2", name: "海味水產", description: null, service_areas: [] },
  ],
  supplier_metrics: [
    { supplier_id: "sup-1", orders_total: 42, ontime_rate: 0.95, shortage_rate: 0.02, avg_reply_minutes: 18, avg_rating: 4.6, computed_at: "2026-09-27T00:00:00Z" },
  ],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: TABLES[table] ?? [], error: null }).then(onFulfilled, onRejected),
      };
      return builder;
    },
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

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/restaurant/suppliers"]}>
      <RestaurantSuppliersPage />
    </MemoryRouter>,
  );

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.role = "owner";
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

const cardOf = async (name: string) => {
  const heading = await screen.findByRole("heading", { name });
  return heading.closest("[class*='rounded']") as HTMLElement;
};

describe("RestaurantSuppliersPage —「查看」改成就地展開績效", () => {
  it("整頁沒有任何連到公開供應商頁(/supplier/:id)的連結", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "鮮綠農產" });

    const links = screen.queryAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links.filter((href) => href?.startsWith("/supplier/"))).toEqual([]);
  });

  it("按「查看績效」在卡片裡展開近期合作與平台統計,再按一次收起", async () => {
    const user = userEvent.setup();
    renderPage();

    const card = await cardOf("鮮綠農產");
    const toggle = within(card).getByRole("button", { name: "查看績效" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    const region = screen.getByRole("region", { name: "鮮綠農產 的績效明細" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", region.id);
    expect(toggle).toHaveTextContent("收起");
    // 近期合作:新到舊,編號是尾 8 碼大寫、狀態用中文
    const items = within(region).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("#000000A2");
    expect(items[0]).toContain("待收貨");
    expect(items[1]).toContain("#000000A1");
    expect(items[1]).toContain("待評價");
    expect(region).toHaveTextContent("平台累計訂單42");
    expect(region).toHaveTextContent("平均回覆18 分鐘");
    expect(within(region).getByRole("link", { name: "到訂單分頁看完整履歷" })).toHaveAttribute("href", "/restaurant/orders");

    await user.click(toggle);
    expect(screen.queryByRole("region", { name: "鮮綠農產 的績效明細" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("一次只展開一家;沒有統計資料的供應商顯示「—」", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await cardOf("鮮綠農產")).getByRole("button", { name: "查看績效" }));
    await user.click(within(await cardOf("海味水產")).getByRole("button", { name: "查看績效" }));

    expect(screen.queryByRole("region", { name: "鮮綠農產 的績效明細" })).toBeNull();
    const region = screen.getByRole("region", { name: "海味水產 的績效明細" });
    expect(region).toHaveTextContent("平台累計訂單—");
  });

  it("採購員也能展開(不含金額欄位)", async () => {
    state.role = "purchaser";
    const user = userEvent.setup();
    renderPage();

    const card = await cardOf("鮮綠農產");
    expect(within(card).queryByText("累計金額")).toBeNull();
    await user.click(within(card).getByRole("button", { name: "查看績效" }));
    expect(screen.getByRole("region", { name: "鮮綠農產 的績效明細" })).toBeInTheDocument();
  });
});
