import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { id: "u-1" } } as { user: { id: string } } | null,
  rows: [] as unknown[],
  filters: [] as string[],
  select: "",
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: (cols: string) => {
      h.select = cols;
      return chain;
    },
    eq: (col: string, v: unknown) => {
      h.filters.push(`${col}=eq.${String(v)}`);
      return chain;
    },
    not: (col: string, op: string, v: unknown) => {
      h.filters.push(`${col}=not.${op}.${String(v)}`);
      return chain;
    },
    limit: () => Promise.resolve({ data: h.rows }),
  };
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: h.session } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => chain,
    },
  };
});

import RestaurantRoute, { useRestaurant } from "./RestaurantRoute";

const WhoAmI = () => {
  const acc = useRestaurant();
  return <p>{`${acc.restaurant_name}/${acc.role}`}</p>;
};

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={["/restaurant"]}>
      <Routes>
        <Route path="/" element={<p>登入首頁</p>} />
        <Route
          path="/restaurant"
          element={
            <RestaurantRoute>
              <WhoAmI />
            </RestaurantRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.session = { user: { id: "u-1" } };
  h.rows = [];
  h.filters = [];
  h.select = "";
});

afterEach(cleanup);

describe("RestaurantRoute —— 待接受的邀請不是餐廳身分", () => {
  it("只有待接受的邀請(accepted_at = null)→ 進不了後台,回登入首頁", async () => {
    h.rows = [
      { id: "acc-p", restaurant_id: "r-1", branch_id: null, role: "owner", accepted_at: null, restaurants: { name: "搶先邀請的店" } },
    ];
    renderRoute();
    expect(await screen.findByText("登入首頁")).toBeInTheDocument();
    expect(screen.queryByText(/搶先邀請的店/)).not.toBeInTheDocument();
  });

  it("已接受的成員 → 進得去,拿到該店名稱與角色", async () => {
    h.rows = [
      { id: "acc-1", restaurant_id: "r-1", branch_id: null, role: "purchaser", accepted_at: "2026-09-28T08:00:00Z", restaurants: { name: "好味小館" } },
    ];
    renderRoute();
    expect(await screen.findByText("好味小館/purchaser")).toBeInTheDocument();
  });

  it("查詢帶 user_id、is_active=true、accepted_at 不是 null", async () => {
    renderRoute();
    await screen.findByText("登入首頁");
    expect(h.filters).toEqual(["user_id=eq.u-1", "is_active=eq.true", "accepted_at=not.is.null"]);
    expect(h.select).toContain("accepted_at");
  });

  it("沒登入 → 回登入首頁", async () => {
    h.session = null;
    renderRoute();
    expect(await screen.findByText("登入首頁")).toBeInTheDocument();
  });
});
