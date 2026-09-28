// 後台精簡第一期:供應商後台選單 11 → 5 個分區,分區裡用分頁。
// 這裡驗證:①側欄剛好 5 項 ②分頁依路由標出 active ③舊路由全部還能開、
// 落在正確的分區與分頁 ④定價助手從選單/分頁收起來但路由仍可直接開 ⑤鍵盤與 aria。
//
// 子頁面全部換成空殼標題(這裡只驗版面殼,不驗個別頁面內容);
// 跟其他 Layout 測試一樣 mock 掉 supabase 與 PortalSwitcher,不打任何正式服務。

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupplierLayout from "./SupplierLayout";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("@/components/PortalSwitcher", () => ({ default: () => null }));

const renderLayout = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/supplier" element={<SupplierLayout />}>
          <Route index element={<h1>總覽頁</h1>} />
          <Route path="leads" element={<h1>商機雷達頁</h1>} />
          <Route path="orders" element={<h1>收單紀錄頁</h1>} />
          <Route path="quotes" element={<h1>線上報價頁</h1>} />
          <Route path="catalog" element={<h1>商品目錄頁</h1>} />
          <Route path="pricing" element={<h1>定價助手頁</h1>} />
          <Route path="forecast" element={<h1>需求預測頁</h1>} />
          <Route path="customers" element={<h1>客戶管理頁</h1>} />
          {/* 對齊 App.tsx:物流追蹤併入出貨,這條路由現在是轉址 */}
          <Route path="logistics" element={<Navigate to="/supplier/shipments" replace />} />
          <Route path="shipments" element={<h1>出貨紀錄頁</h1>} />
          <Route path="reviews" element={<h1>我的評價頁</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

describe("SupplierLayout — 側欄剛好 5 個分區", () => {
  it("桌機側欄是 5 個分區連結,文字依序為:總覽、訂單、商機、商品與價格、客戶與評價", () => {
    renderLayout("/supplier");
    const desktopNav = screen.getByTestId("supplier-sidebar-desktop");
    const links = within(desktopNav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.textContent)).toEqual(["總覽", "訂單", "商機", "商品與價格", "客戶與評價"]);
  });

  it("手機抽屜也是同樣 5 個分區連結", () => {
    renderLayout("/supplier");
    const mobileNav = screen.getByTestId("supplier-sidebar-mobile");
    const links = within(mobileNav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.textContent)).toEqual(["總覽", "訂單", "商機", "商品與價格", "客戶與評價"]);
  });

  it("找不到「定價助手」「需求預測」「收單紀錄」等舊的 11 項標籤 —— 選單只剩 5 個分區名", () => {
    renderLayout("/supplier");
    ["定價助手", "商機雷達", "收單紀錄", "線上報價", "物流追蹤", "出貨紀錄", "我的評價"].forEach((oldLabel) => {
      expect(screen.queryByRole("link", { name: oldLabel })).toBeNull();
    });
  });
});

describe("SupplierLayout — aria-current 標出目前分區", () => {
  it("在訂單分區底下的路由,側欄只有「訂單」帶 aria-current=page", () => {
    renderLayout("/supplier/quotes");
    const desktopNav = screen.getByTestId("supplier-sidebar-desktop");
    expect(within(desktopNav).getByRole("link", { name: "訂單" })).toHaveAttribute("aria-current", "page");
    ["總覽", "商機", "商品與價格", "客戶與評價"].forEach((label) => {
      expect(within(desktopNav).getByRole("link", { name: label })).not.toHaveAttribute("aria-current");
    });
  });
});

describe("SupplierLayout — 11 條舊路由全部打得開,落在正確的分區與分頁", () => {
  it.each([
    ["/supplier", "總覽頁", "總覽", null as string[] | null, null as string | null],
    ["/supplier/leads", "商機雷達頁", "商機", ["商機雷達", "需求與備貨"], "商機雷達"],
    ["/supplier/forecast", "需求預測頁", "商機", ["商機雷達", "需求與備貨"], "需求與備貨"],
    ["/supplier/orders", "收單紀錄頁", "訂單", ["收單", "報價", "出貨"], "收單"],
    ["/supplier/quotes", "線上報價頁", "訂單", ["收單", "報價", "出貨"], "報價"],
    ["/supplier/shipments", "出貨紀錄頁", "訂單", ["收單", "報價", "出貨"], "出貨"],
    ["/supplier/logistics", "出貨紀錄頁", "訂單", ["收單", "報價", "出貨"], "出貨"],
    ["/supplier/catalog", "商品目錄頁", "商品與價格", null as string[] | null, null as string | null],
    ["/supplier/customers", "客戶管理頁", "客戶與評價", ["客戶", "評價"], "客戶"],
    ["/supplier/reviews", "我的評價頁", "客戶與評價", ["客戶", "評價"], "評價"],
  ])("%s → 頁面 %s,分區「%s」", (path, heading, sectionLabel, expectedTabs, activeTab) => {
    renderLayout(path);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();

    const desktopNav = screen.getByTestId("supplier-sidebar-desktop");
    expect(within(desktopNav).getByRole("link", { name: sectionLabel })).toHaveAttribute("aria-current", "page");

    if (expectedTabs) {
      const tabs = screen.getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual(expectedTabs);
      expect(screen.getByRole("tab", { name: activeTab as string })).toHaveAttribute("aria-selected", "true");
    } else {
      expect(screen.queryByRole("tablist")).toBeNull();
    }
  });

  it("/supplier/logistics 會真的轉址(網址變成 /supplier/shipments),不是停在原地假裝有內容", () => {
    renderLayout("/supplier/logistics");
    // 轉址後只剩出貨紀錄頁的標題,物流頁的內容不會出現
    expect(screen.getByRole("heading", { name: "出貨紀錄頁" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /物流/ })).toBeNull();
  });
});

describe("SupplierLayout — 定價助手:選單收起來,路由仍可直接開(Q6-A)", () => {
  it("直接打 /supplier/pricing 網址,頁面正常渲染,側欄標出「商品與價格」", () => {
    renderLayout("/supplier/pricing");
    expect(screen.getByRole("heading", { name: "定價助手頁" })).toBeInTheDocument();

    const desktopNav = screen.getByTestId("supplier-sidebar-desktop");
    expect(within(desktopNav).getByRole("link", { name: "商品與價格" })).toHaveAttribute("aria-current", "page");
  });

  it("畫面上完全找不到「定價助手」或「行情比價」這兩個選單/分頁字樣", () => {
    renderLayout("/supplier/pricing");
    expect(screen.queryByText("定價助手")).toBeNull();
    expect(screen.queryByText("行情比價")).toBeNull();
  });

  it("商品與價格分區只剩一個可見分頁,不畫分頁列(catalog 與 pricing 兩條路由都一樣)", () => {
    renderLayout("/supplier/catalog");
    expect(screen.queryByRole("tablist")).toBeNull();
    renderLayout("/supplier/pricing");
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("SupplierLayout — 分頁列的鍵盤操作與 aria(整合驗證,細節見 SectionTabs.test.tsx)", () => {
  it("方向鍵可以在訂單分區的 3 個分頁間移動焦點", () => {
    renderLayout("/supplier/orders");
    const tablist = screen.getByRole("tablist");
    const first = screen.getByRole("tab", { name: "收單" });
    const second = screen.getByRole("tab", { name: "報價" });

    first.focus();
    expect(first).toHaveFocus();
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(second).toHaveFocus();
  });

  it("分頁列有正確的 aria-label,並且 aria-controls 指到主內容區", () => {
    renderLayout("/supplier/orders");
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label", "訂單分頁");
    screen.getAllByRole("tab").forEach((tab) => {
      expect(tab).toHaveAttribute("aria-controls", "supplier-main-panel");
    });
    expect(document.getElementById("supplier-main-panel")).toBeInTheDocument();
  });
});
