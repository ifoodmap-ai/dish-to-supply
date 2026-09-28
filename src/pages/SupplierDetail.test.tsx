// 公開供應商頁(/supplier/:id)的「詢價」退場(業主拍板 Q7-A):
//   原本送出詢價寫進 inquiries,但只有送出者本人讀得到,供應商、管理員都收不到,頁面卻說「供應商將會收到」。
//   改成「註冊餐廳即可線上叫貨」,連到 /register/restaurant;已經是會員的人另有連結到後台叫貨。
//   這頁不再碰 inquiries(既有資料保留不刪,這裡只是不再寫入)。
// supabase 換成記憶體假資料並記錄碰過哪些表;擋掉所有網路請求。

import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { createMemoryStorage } from "@/test/memory-storage";
import SupplierDetail from "./SupplierDetail";

const { touched } = vi.hoisted(() => ({ touched: [] as string[] }));

const TABLES: Record<string, unknown> = {
  suppliers: {
    id: "sup-1",
    name: "鮮綠農產",
    description: "當日採收的葉菜與根莖類",
    contact_email: "hello@example.com",
    phone: null,
    service_areas: ["台北市"],
    is_active: true,
  },
  supplies: [
    { id: "p-1", supplier_id: "sup-1", name: "高麗菜", category: "蔬菜", unit: "kg", pack_size: null, price: 45, currency: "TWD", description: null, is_available: true },
    { id: "p-2", supplier_id: "sup-1", name: "洋蔥", category: "蔬菜", unit: "kg", pack_size: null, price: 38, currency: "TWD", description: null, is_available: true },
    { id: "p-9", supplier_id: "sup-other", name: "別家的品項", category: "肉品", unit: "kg", pack_size: null, price: 300, currency: "TWD", description: null, is_available: true },
  ],
  supplier_reviews: [],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      touched.push(table);
      const result = () => ({ data: TABLES[table] ?? [], error: null });
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        insert: () => builder,
        maybeSingle: () => Promise.resolve(result()),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(onFulfilled, onRejected),
      };
      return builder;
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/supplier/sup-1"]}>
          <Routes>
            <Route path="/supplier/:id" element={<SupplierDetail />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  touched.length = 0;
  // 語言存在 localStorage(ifm_lang);Node 25 的全域 localStorage 是空殼,見 memory-storage.ts
  vi.stubGlobal("localStorage", createMemoryStorage());
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

const CTA = "註冊餐廳即可線上叫貨";

describe("SupplierDetail — 詢價退場,改成註冊餐廳線上叫貨", () => {
  it("頁首有「註冊餐廳即可線上叫貨」連到 /register/restaurant,另有給會員的後台叫貨連結", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "鮮綠農產" });

    const ctas = screen.getAllByRole("link", { name: CTA });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((a) => expect(a).toHaveAttribute("href", "/register/restaurant"));
    expect(screen.getByRole("link", { name: "已經是餐廳會員?到後台叫貨" })).toHaveAttribute("href", "/restaurant/purchase");
    // 聯絡方式照舊
    expect(screen.getByRole("link", { name: "立即連繫" })).toHaveAttribute("href", "mailto:hello@example.com");
  });

  it("每張商品卡原本的「詢價」鈕都換成同一個 CTA(只列這家的商品)", async () => {
    renderPage();
    const card = (await screen.findByRole("heading", { name: "高麗菜" })).parentElement as HTMLElement;

    expect(within(card).getByRole("link", { name: CTA })).toHaveAttribute("href", "/register/restaurant");
    expect(screen.getByRole("heading", { name: "洋蔥" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "別家的品項" })).toBeNull();
    // 頁首 1 個 + 兩張商品卡各 1 個
    expect(screen.getAllByRole("link", { name: CTA })).toHaveLength(3);
  });

  it("整頁沒有詢價相關的按鈕、購物車,也不會碰 inquiries 表", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "高麗菜" });

    expect(screen.queryByRole("button", { name: /詢價/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /購物車/ })).toBeNull();
    expect(screen.queryByText(/詢價清單|送出詢價|供應商將會收到/)).toBeNull();
    expect(touched).not.toContain("inquiries");
    expect(new Set(touched)).toEqual(new Set(["suppliers", "supplies", "supplier_reviews"]));
  });
});
