// 舊版買家入口 /my 退場(業主拍板 Q7-A):站內零入口、詢價供應商也收不到 → 一律轉去餐廳後台。
// 走真正的 App 路由表;餐廳後台的門禁與版面換成替身,只驗「/my 會落在 /restaurant、舊頁不再出現」。
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

vi.mock("@/components/RestaurantRoute", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRestaurant: () => ({ id: "a", restaurant_id: "r", branch_id: null, role: "owner", restaurant_name: "好味小館" }),
  canSeeCost: () => true,
  needsApproval: () => false,
}));

vi.mock("@/pages/restaurant/RestaurantLayout", () => ({
  default: function RestaurantLayoutProbe() {
    const { pathname, search } = useLocation();
    return <p data-testid="restaurant-portal">{`餐廳後台 ${pathname}${search}`}</p>;
  },
}));

vi.mock("@/pages/BuyerPortalPage", () => ({ default: () => <p>舊版買家入口</p> }));

describe("/my 轉址到 /restaurant", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it.each(["/my", "/my?from=bookmark"])("%s → /restaurant(replace,不留 /my 在瀏覽紀錄)", (url) => {
    window.history.pushState({}, "", url);
    const before = window.history.length;

    render(<App />);

    expect(screen.getByTestId("restaurant-portal")).toHaveTextContent(/^餐廳後台 \/restaurant$/);
    expect(window.location.pathname).toBe("/restaurant");
    expect(window.history.length).toBe(before);
    expect(screen.queryByText("舊版買家入口")).toBeNull();
  });
});
