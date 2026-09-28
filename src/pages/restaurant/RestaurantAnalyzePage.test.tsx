// AI 菜單分析頁(精簡版)的流程測試:上傳 → 辨識 → 找供應商 → 帶到智慧採購,
// 以及 AI 助手泡泡從其他頁透過 router state 帶需求過來。
// AI、供應商目錄、事件追蹤全部 mock,不打任何網路。

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type MemoryRouterProps } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AnalysisResult, MatchResult } from "@/lib/api";
import RestaurantAnalyzePage, { ANALYSIS_HANDOFF_KEY } from "./RestaurantAnalyzePage";

const { analyzeMenu, matchSuppliers, toastError } = vi.hoisted(() => ({
  analyzeMenu: vi.fn(),
  matchSuppliers: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, analyzeMenu, matchSuppliers };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError, info: vi.fn() } }));

const ANALYSIS: AnalysisResult = {
  analysisId: "analysis-1",
  persistError: null,
  summary: "",
  ingredients: [
    { name: "牛肉", quantity: "5", unit: "kg" },
    { name: "洋蔥", quantity: "3", unit: "kg" },
    { name: "青蔥" },
  ],
};

const MATCH: MatchResult = {
  requested: ["牛肉", "洋蔥", "青蔥"],
  suppliers: [
    {
      supplier: { id: "sup-1", name: "鮮綠蔬果行", description: null, service_areas: ["台北市"] },
      score: 92,
      matchedCount: 2,
      items: [
        { ingredient: "洋蔥", name: "洋蔥", price: 38, unit: "kg", pack_size: null },
        { ingredient: "青蔥", name: "青蔥", price: 120, unit: "kg", pack_size: null },
      ],
    },
  ],
};

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
};

let storage: ReturnType<typeof memoryStorage>;

type InitialEntry = NonNullable<MemoryRouterProps["initialEntries"]>[number];

/** 把目前的 router state 印出來,驗證套用後有沒有清掉 */
const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="router-state">{JSON.stringify(location.state ?? null)}</output>;
};

/** 模擬泡泡在任何一頁送出需求:帶 state 導到分析頁 */
const BUBBLE_STATE = {
  chatRequirements: ["豬五花 3kg", "高麗菜 4kg"],
  chatMeta: { analysisId: "chat-2", names: ["豬五花", "高麗菜"] },
};
const BubbleSimulator = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/restaurant/analyze", { state: BUBBLE_STATE })}>
      模擬泡泡送出
    </button>
  );
};

const PurchaseStub = () => {
  const navigate = useNavigate();
  return (
    <div>
      智慧採購頁
      <button type="button" onClick={() => navigate(-1)}>上一頁</button>
    </div>
  );
};

const renderPage = ({ entry = "/restaurant/analyze", withProbe = false }: { entry?: InitialEntry; withProbe?: boolean } = {}) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <LanguageProvider>
        <Routes>
          <Route path="/restaurant/analyze" element={<RestaurantAnalyzePage />} />
          <Route path="/restaurant/purchase" element={<PurchaseStub />} />
          <Route path="/supplier/:id" element={<div>供應商頁</div>} />
        </Routes>
        {withProbe && (
          <>
            <LocationProbe />
            <BubbleSimulator />
          </>
        )}
      </LanguageProvider>
    </MemoryRouter>,
  );

const withChatState = (state: unknown): InitialEntry => ({ pathname: "/restaurant/analyze", state });
const routerState = () => screen.getByTestId("router-state").textContent;

const pickMenuPhoto = () => {
  const file = new File(["menu"], "menu.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText(/上傳菜單照片/), { target: { files: [file] } });
  return file;
};

const analyze = async () => {
  const file = pickMenuPhoto();
  fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
  await screen.findByText("牛肉 5kg");
  return file;
};

describe("RestaurantAnalyzePage(精簡版)", () => {
  beforeEach(() => {
    analyzeMenu.mockResolvedValue(ANALYSIS);
    matchSuppliers.mockResolvedValue(MATCH);
    storage = memoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    URL.createObjectURL = vi.fn(() => "blob:menu-preview");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("還沒分析前只有上傳卡:沒有結果、供應商、採購按鈕,也沒有內嵌聊天框", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /AI 菜單分析/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/上傳菜單照片/)).toBeInTheDocument();

    expect(screen.queryByText(/已識別/)).not.toBeInTheDocument();
    expect(screen.queryByText("媒合的供應商")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /帶到智慧採購/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /尋找供應商/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /重新上傳/ })).not.toBeInTheDocument();
    // 原本頁尾的 <Chatbot> 已拿掉(改成右下角泡泡)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector("#analysis-results")).toBeNull();
    expect(document.querySelector("#supplier-section")).toBeNull();
  });

  it("上傳 → 辨識 → 找供應商 → 帶到智慧採購,一路走完且交接資料正確", async () => {
    renderPage();

    // 選照片:出現預覽,主要動作只有「開始分析」
    const file = pickMenuPhoto();
    expect(screen.getByAltText("菜單預覽")).toHaveAttribute("src", "blob:menu-preview");
    expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled();

    // 辨識完成:上傳卡收起來,換成食材清單 + 兩個下一步
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByText("牛肉 5kg");
    expect(analyzeMenu).toHaveBeenCalledWith(file);
    expect(screen.getByText("已識別 3 項食材")).toBeInTheDocument();
    expect(screen.getByText("洋蔥 3kg")).toBeInTheDocument();
    expect(screen.getByText("青蔥")).toBeInTheDocument();
    expect(screen.queryByLabelText(/上傳菜單照片/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /帶到智慧採購/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /尋找供應商/ })).toBeInTheDocument();
    expect(screen.queryByText("媒合的供應商")).not.toBeInTheDocument();

    // 找供應商:用原始品名去媒合,按鈕收起來
    fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
    await screen.findByText("鮮綠蔬果行");
    expect(matchSuppliers).toHaveBeenCalledWith(["牛肉", "洋蔥", "青蔥"]);
    expect(screen.getByText("媒合的供應商")).toBeInTheDocument();
    expect(screen.getByText("符合 2 項")).toBeInTheDocument();
    expect(screen.getByText("洋蔥 $38/kg")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /尋找供應商/ })).not.toBeInTheDocument();

    // 帶到智慧採購:sessionStorage 交接原始品名,導到採購頁
    fireEvent.click(screen.getByRole("button", { name: /帶到智慧採購/ }));
    await screen.findByText("智慧採購頁");
    expect(JSON.parse(storage.getItem(ANALYSIS_HANDOFF_KEY) ?? "null")).toEqual(["牛肉", "洋蔥", "青蔥"]);
  });

  it("分析完可以直接帶到智慧採購,不必先找供應商", async () => {
    renderPage();
    await analyze();

    fireEvent.click(screen.getByRole("button", { name: /帶到智慧採購/ }));
    await screen.findByText("智慧採購頁");
    expect(matchSuppliers).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem(ANALYSIS_HANDOFF_KEY) ?? "null")).toEqual(["牛肉", "洋蔥", "青蔥"]);
  });

  it("供應商卡片的「查看並詢價」會開該供應商頁", async () => {
    renderPage();
    await analyze();
    fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
    await screen.findByText("鮮綠蔬果行");

    fireEvent.click(screen.getByRole("button", { name: /查看並詢價/ }));
    await screen.findByText("供應商頁");
  });

  it("媒合不到供應商時顯示精簡空狀態,仍可帶到智慧採購", async () => {
    matchSuppliers.mockResolvedValue({ requested: [], suppliers: [] });
    renderPage();
    await analyze();

    fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
    await screen.findByText(/平台上暫時沒有完全符合的供應商/);
    expect(screen.getByRole("button", { name: /帶到智慧採購/ })).toBeInTheDocument();
  });

  it("「重新上傳」回到只有上傳卡的狀態", async () => {
    renderPage();
    await analyze();
    fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
    await screen.findByText("鮮綠蔬果行");

    fireEvent.click(screen.getByRole("button", { name: /重新上傳/ }));

    expect(screen.getByLabelText(/上傳菜單照片/)).toBeInTheDocument();
    expect(screen.queryByText("牛肉 5kg")).not.toBeInTheDocument();
    expect(screen.queryByText("鮮綠蔬果行")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /帶到智慧採購/ })).not.toBeInTheDocument();
  });

  it("AI 分析失敗:提示錯誤、留在預覽,可以再按一次", async () => {
    analyzeMenu.mockRejectedValue(new Error("逾時"));
    renderPage();
    pickMenuPhoto();

    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("AI 分析失敗:逾時"));
    expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled();
    expect(screen.queryByText(/已識別/)).not.toBeInTheDocument();
  });

  describe("AI 助手泡泡從其他頁帶需求過來(router state)", () => {
    it("帶 state.chatRequirements 進入:結果區出現那些食材,state 被清掉", async () => {
      renderPage({
        withProbe: true,
        entry: withChatState({
          chatRequirements: ["牛肉 5kg", "洋蔥 3kg"],
          chatMeta: { analysisId: "chat-1", names: ["牛肉", "洋蔥"] },
        }),
      });

      await screen.findByText("牛肉 5kg");
      expect(screen.getByText("洋蔥 3kg")).toBeInTheDocument();
      expect(screen.getByText("已識別 2 項食材")).toBeInTheDocument();
      expect(screen.queryByLabelText(/上傳菜單照片/)).not.toBeInTheDocument();
      await waitFor(() => expect(routerState()).toBe("null"));

      // 用 chatMeta.names 去媒合
      fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
      await screen.findByText("鮮綠蔬果行");
      expect(matchSuppliers).toHaveBeenCalledWith(["牛肉", "洋蔥"]);
    });

    it("已經在分析頁時再送一次不同需求:結果更新、供應商區收起、state 再清掉", async () => {
      renderPage({
        withProbe: true,
        entry: withChatState({ chatRequirements: ["牛肉 5kg"], chatMeta: { names: ["牛肉"] } }),
      });
      await screen.findByText("牛肉 5kg");
      fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
      await screen.findByText("鮮綠蔬果行");
      await waitFor(() => expect(routerState()).toBe("null"));

      fireEvent.click(screen.getByRole("button", { name: "模擬泡泡送出" }));

      await screen.findByText("豬五花 3kg");
      expect(screen.getByText("高麗菜 4kg")).toBeInTheDocument();
      expect(screen.queryByText("牛肉 5kg")).not.toBeInTheDocument();
      expect(screen.queryByText("媒合的供應商")).not.toBeInTheDocument();
      await waitFor(() => expect(routerState()).toBe("null"));

      fireEvent.click(screen.getByRole("button", { name: /帶到智慧採購/ }));
      await screen.findByText("智慧採購頁");
      expect(JSON.parse(storage.getItem(ANALYSIS_HANDOFF_KEY) ?? "null")).toEqual(["豬五花", "高麗菜"]);
    });

    it("chatMeta 缺欄位或型別不對也能用:品名從需求字串推回來", async () => {
      renderPage({
        withProbe: true,
        entry: withChatState({ chatRequirements: ["雞蛋 60顆", "青蔥", "可樂 1.5L", 42, "  "], chatMeta: { names: "壞掉" } }),
      });

      await screen.findByText("雞蛋 60顆");
      expect(screen.getByText("已識別 3 項食材")).toBeInTheDocument();
      await waitFor(() => expect(routerState()).toBe("null"));

      fireEvent.click(screen.getByRole("button", { name: /尋找供應商/ }));
      await screen.findByText("鮮綠蔬果行");
      expect(matchSuppliers).toHaveBeenCalledWith(["雞蛋", "青蔥", "可樂"]);

      fireEvent.click(screen.getByRole("button", { name: /帶到智慧採購/ }));
      await screen.findByText("智慧採購頁");
      expect(JSON.parse(storage.getItem(ANALYSIS_HANDOFF_KEY) ?? "null")).toEqual(["雞蛋", "青蔥", "可樂"]);
    });

    it("完全沒有 chatMeta 也能用", async () => {
      renderPage({ withProbe: true, entry: withChatState({ chatRequirements: ["白米 10kg"] }) });
      await screen.findByText("白米 10kg");
      await waitFor(() => expect(routerState()).toBe("null"));
    });

    it("套用後按上一頁回到分析頁,不會再套用一次", async () => {
      renderPage({
        entry: withChatState({ chatRequirements: ["牛肉 5kg"], chatMeta: { names: ["牛肉"] } }),
      });
      await screen.findByText("牛肉 5kg");

      fireEvent.click(screen.getByRole("button", { name: /帶到智慧採購/ }));
      await screen.findByText("智慧採購頁");
      fireEvent.click(screen.getByRole("button", { name: "上一頁" }));

      expect(await screen.findByLabelText(/上傳菜單照片/)).toBeInTheDocument();
      expect(screen.queryByText("牛肉 5kg")).not.toBeInTheDocument();
    });

    it("chatRequirements 是空的:不顯示空結果,state 一樣清掉", async () => {
      renderPage({ withProbe: true, entry: withChatState({ chatRequirements: [] }) });

      await waitFor(() => expect(routerState()).toBe("null"));
      expect(screen.getByLabelText(/上傳菜單照片/)).toBeInTheDocument();
      expect(screen.queryByText(/已識別/)).not.toBeInTheDocument();
    });

    it("不是泡泡帶來的 state:當一般進入,也不去動它", () => {
      renderPage({ withProbe: true, entry: withChatState({ from: "/restaurant/orders" }) });

      expect(screen.getByLabelText(/上傳菜單照片/)).toBeInTheDocument();
      expect(screen.queryByText(/已識別/)).not.toBeInTheDocument();
      expect(routerState()).toBe(JSON.stringify({ from: "/restaurant/orders" }));
    });
  });

  it("選到非圖片檔會用中文提示,不進預覽", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/上傳菜單照片/), {
      target: { files: [new File(["x"], "menu.pdf", { type: "application/pdf" })] },
    });

    expect(toastError).toHaveBeenCalledWith("請選擇圖片檔(JPG、PNG)");
    expect(screen.queryByAltText("菜單預覽")).not.toBeInTheDocument();
  });
});
