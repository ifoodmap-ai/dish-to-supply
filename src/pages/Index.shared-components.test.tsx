// 訪客首頁(Index.tsx)的回歸護欄。
//
// MenuUpload / IngredientAnalysis / SupplierMatch 同時被餐廳後台的「AI 菜單分析」頁使用,
// 後台那邊為了精簡介面,會對它們傳「選用 props」。這支測試鎖住「不傳新 props」時
// Index.tsx 走完整條流程(上傳 → 辨識 → 留聯絡資訊 → 供應商媒合)每一段的實際輸出,
// 快照是在元件加新 props 之前產生的 —— 之後只要預設輸出有任何變動,這裡就會紅。
//
// 與這三個元件無關的區塊(Hero、Chatbot 等)換成空殼,避免別的改動讓快照誤報。

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AnalysisResult, MatchResult } from "@/lib/api";
import Index from "./Index";

const { analyzeMenu, matchSuppliers, insert } = vi.hoisted(() => ({
  analyzeMenu: vi.fn(),
  matchSuppliers: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, analyzeMenu, matchSuppliers };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("@/components/Hero", () => ({ default: () => <div data-stub="hero" /> }));
vi.mock("@/components/HowItWorks", () => ({ default: () => <div data-stub="how-it-works" /> }));
vi.mock("@/components/PartnerBrands", () => ({ default: () => <div data-stub="partner-brands" /> }));
vi.mock("@/components/BuyerProfiles", () => ({ default: () => <div data-stub="buyer-profiles" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div data-stub="footer" /> }));
vi.mock("@/components/Chatbot", () => ({ default: () => <div data-stub="chatbot" /> }));

const ANALYSIS: AnalysisResult = {
  analysisId: "analysis-1",
  persistError: null,
  summary: "",
  ingredients: [
    { name: "牛肉", quantity: "5", unit: "kg" },
    { name: "洋蔥", quantity: "3", unit: "kg" },
    { name: "雞蛋", quantity: "60", unit: "顆" },
    { name: "青蔥" },
  ],
};

const MATCH: MatchResult = {
  requested: ["牛肉", "洋蔥", "雞蛋", "青蔥"],
  suppliers: [
    {
      supplier: { id: "sup-1", name: "鮮綠蔬果行", description: "北部餐廳蔬果直送", service_areas: ["台北市", "新北市"] },
      score: 92,
      matchedCount: 2,
      items: [
        { ingredient: "洋蔥", name: "洋蔥", price: 38, unit: "kg", pack_size: null },
        { ingredient: "青蔥", name: "青蔥", price: 120, unit: "kg", pack_size: null },
      ],
    },
    {
      supplier: { id: "sup-2", name: "大成肉品", description: null, service_areas: null },
      score: 81,
      matchedCount: 1,
      items: [{ ingredient: "牛肉", name: "牛腱", price: 520, unit: "kg", pack_size: null }],
    },
  ],
};

const renderIndex = () =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <Index />
      </LanguageProvider>
    </MemoryRouter>,
  );

const section = (selector: string) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`找不到 ${selector}`);
  return el;
};

describe("Index.tsx 共用元件的預設輸出(不傳新 props)", () => {
  beforeEach(() => {
    // LanguageProvider 預設繁中(讀不到 localStorage 也一樣),不用另外設定
    analyzeMenu.mockResolvedValue(ANALYSIS);
    matchSuppliers.mockResolvedValue(MATCH);
    insert.mockResolvedValue({ error: null });
    URL.createObjectURL = vi.fn(() => "blob:menu-preview");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("上傳 → 辨識 → 留聯絡資訊 → 供應商媒合,每一段輸出與改動前一致", async () => {
    renderIndex();

    // 1. 還沒上傳
    expect(section("#upload-section")).toMatchSnapshot("MenuUpload 初始");
    expect(section("#analysis-results")).toMatchSnapshot("IngredientAnalysis 無資料");
    expect(section("#supplier-section")).toMatchSnapshot("SupplierMatch 未顯示");

    // 2. 選好照片
    const file = new File(["menu"], "menu.png", { type: "image/png" });
    fireEvent.change(section("#menu-upload"), { target: { files: [file] } });
    expect(section("#upload-section")).toMatchSnapshot("MenuUpload 已選照片");

    // 3. 辨識完成
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByText("牛肉 5kg");
    expect(analyzeMenu).toHaveBeenCalledWith(file);
    expect(section("#upload-section")).toMatchSnapshot("MenuUpload 分析後");
    expect(section("#analysis-results")).toMatchSnapshot("IngredientAnalysis 有資料");

    // 4. 找供應商 → 訪客要先留聯絡資訊
    fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
    await waitFor(() => expect(document.querySelector("#contact-gate")).not.toBeNull());
    expect(section("#supplier-section")).toMatchSnapshot("SupplierMatch 留資前");

    fireEvent.change(section("#contact-gate-company"), { target: { value: "好味小館" } });
    fireEvent.change(section("#contact-gate-line"), { target: { value: "foodie888" } });
    fireEvent.submit(section("#contact-gate form"));

    // 5. 媒合結果
    await screen.findByText("鮮綠蔬果行");
    expect(matchSuppliers).toHaveBeenCalledWith(["牛肉", "洋蔥", "雞蛋", "青蔥"]);
    expect(section("#supplier-section")).toMatchSnapshot("SupplierMatch 有結果");
  });

  it("媒合不到供應商時的空狀態與改動前一致", async () => {
    matchSuppliers.mockResolvedValue({ requested: [], suppliers: [] });
    renderIndex();

    fireEvent.change(section("#menu-upload"), {
      target: { files: [new File(["menu"], "menu.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByText("牛肉 5kg");
    fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
    await waitFor(() => expect(document.querySelector("#contact-gate")).not.toBeNull());
    fireEvent.change(section("#contact-gate-company"), { target: { value: "好味小館" } });
    fireEvent.change(section("#contact-gate-phone"), { target: { value: "0912345678" } });
    fireEvent.submit(section("#contact-gate form"));

    await screen.findByText("已收到您的需求");
    expect(section("#supplier-section")).toMatchSnapshot("SupplierMatch 空狀態");
  });
});
