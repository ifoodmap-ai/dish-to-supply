// 餐廳後台共用版面:AI 小助手泡泡每一頁都看得到,在任何一頁用對話送出需求都會導去分析頁。
//
// 子頁面換成空殼(這裡只驗版面);泡泡與 Chatbot 是真的,只 mock 掉 AI 呼叫。
// 🔴 測試環境會讀到 .env.local 的正式 Supabase 網址,漏 mock 就會打正式的 AI Edge Function(會計費)。

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AnalysisResult } from "@/lib/api";
import type { ChatRequirementsLocationState } from "@/components/AIAssistantBubble";
import RestaurantLayout from "./RestaurantLayout";

const { chatReply, analyzeChat } = vi.hoisted(() => ({
  chatReply: vi.fn(),
  analyzeChat: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

vi.mock("@/components/RestaurantRoute", () => ({
  useRestaurant: () => ({
    id: "account-1",
    restaurant_id: "restaurant-1",
    branch_id: null,
    role: "owner",
    restaurant_name: "好味小館",
  }),
  canSeeCost: () => true,
}));

vi.mock("@/components/PortalSwitcher", () => ({ default: () => null }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, chatReply, analyzeChat };
});

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const ANALYSIS: AnalysisResult = {
  analysisId: "analysis-1",
  persistError: null,
  summary: "",
  ingredients: [
    { name: "牛肉", quantity: "5", unit: "kg" },
    { name: "洋蔥", quantity: "3", unit: "kg" },
  ],
};

/** 分析頁的空殼:把收到的 router state 印出來 */
const AnalyzeProbe = () => {
  const state = useLocation().state as ChatRequirementsLocationState | null;
  return (
    <div>
      <h1>AI 菜單分析頁</h1>
      <p data-testid="handoff">{state ? JSON.stringify(state) : "沒有 state"}</p>
    </div>
  );
};

const renderLayout = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route path="/restaurant" element={<RestaurantLayout />}>
            <Route index element={<h1>營運總覽頁</h1>} />
            <Route path="orders" element={<h1>訂單與收貨頁</h1>} />
            <Route path="team" element={<h1>分店與成員頁</h1>} />
            <Route path="analyze" element={<AnalyzeProbe />} />
          </Route>
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );

const fab = () => screen.getByRole("button", { name: "找食材嗎？AI 採購助手" });
const chatInput = () => screen.getByRole("textbox", { name: "輸入食材需求" });

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chatReply.mockReset();
  analyzeChat.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

describe("RestaurantLayout 的 AI 小助手泡泡", () => {
  it.each([
    ["/restaurant", "營運總覽頁"],
    ["/restaurant/orders", "訂單與收貨頁"],
    ["/restaurant/team", "分店與成員頁"],
  ])("%s 看得到泡泡與「找食材嗎？」小標籤(整個版面只有一顆)", (path, heading) => {
    renderLayout(path);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(fab()).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-tip")).toHaveTextContent("找食材嗎？");
    expect(document.querySelectorAll("[data-ai-assistant]")).toHaveLength(1);
    expect(document.querySelector("[data-ai-assistant]")).toHaveAttribute("data-ai-assistant", "restaurant");
  });

  it("用側欄換頁:泡泡一直在(同一顆,對話不會不見),開著的面板會收起", async () => {
    chatReply.mockResolvedValueOnce({ reply: "請問每週大約需要多少牛肉?" });
    const user = userEvent.setup();
    renderLayout("/restaurant");

    await user.click(fab());
    await user.type(chatInput(), "我要進牛肉");
    fireEvent.keyPress(chatInput(), { key: "Enter", code: "Enter", charCode: 13 });
    expect(await screen.findByText("請問每週大約需要多少牛肉?")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "訂單與收貨" }));

    expect(screen.getByRole("heading", { name: "訂單與收貨頁" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveAttribute("aria-expanded", "false");

    await user.click(fab());
    expect(within(screen.getByRole("dialog", { name: "AI 採購助手" })).getByText("我要進牛肉")).toBeInTheDocument();
  });

  it("在訂單頁用對話送出需求 → 收起面板,導去 /restaurant/analyze,需求放在 router state", async () => {
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderLayout("/restaurant/orders");

    await user.click(fab());
    await user.type(chatInput(), "牛肉 5kg、洋蔥 3kg,幫我找供應商");
    fireEvent.keyPress(chatInput(), { key: "Enter", code: "Enter", charCode: 13 });

    expect(await screen.findByRole("heading", { name: "AI 菜單分析頁" })).toBeInTheDocument();
    const state = JSON.parse(screen.getByTestId("handoff").textContent ?? "null");
    expect(state).toEqual({
      chatRequirements: ["牛肉 5kg", "洋蔥 3kg"],
      chatMeta: { analysisId: "analysis-1", names: ["牛肉", "洋蔥"] },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fab()).toHaveFocus();
  });

  it("主內容底部留白(160px)讓頁尾靠右的按鈕能捲到泡泡與小標籤上方", () => {
    renderLayout("/restaurant/orders");

    const main = screen.getByRole("main");
    expect(main).toHaveClass("pb-40", "md:pb-40");
  });
});
