// 管理員後台共用版面:AI 助手泡泡每一頁都看得到,而且是純對話(admin 模式)。
//
// 🔴 管理員後台是另一個網站(VITE_PORTAL=admin),沒有 /restaurant/* 路由 —— 對話裡講到「供應商」「媒合」
//    也不能擷取需求或導頁,導過去就是 404。
// 子頁面換成空殼(這裡只驗版面);泡泡與 Chatbot 是真的,只 mock 掉 AI 呼叫(不打正式 AI Edge Function)。

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AnalysisResult } from "@/lib/api";
import AdminLayout from "./AdminLayout";

const { chatReply, analyzeChat } = vi.hoisted(() => ({
  chatReply: vi.fn(),
  analyzeChat: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: vi.fn(),
    },
  },
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
  ingredients: [{ name: "牛肉", quantity: "5", unit: "kg" }],
};

let pathnames: string[] = [];
const PathProbe = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    pathnames.push(pathname);
  }, [pathname]);
  return null;
};

const renderLayout = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<h1>儀表板頁</h1>} />
            <Route path="orders" element={<h1>供應商訂單頁</h1>} />
            <Route path="analyses" element={<h1>分析紀錄頁</h1>} />
          </Route>
          <Route path="*" element={<h1>不該來到這裡</h1>} />
        </Routes>
        <PathProbe />
      </LanguageProvider>
    </MemoryRouter>,
  );

const fab = () => screen.getByRole("button", { name: "AI 助手" });
const chatInput = () => screen.getByRole("textbox", { name: "輸入食材需求" });

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pathnames = [];
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

describe("AdminLayout 的 AI 助手泡泡", () => {
  it.each([
    ["/admin", "儀表板頁"],
    ["/admin/orders", "供應商訂單頁"],
    ["/admin/analyses", "分析紀錄頁"],
  ])("%s 看得到泡泡,小標是中性的「AI 助手」(整個版面只有一顆)", async (path, heading) => {
    renderLayout(path);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(fab()).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-tip")).toHaveTextContent("AI 助手");
    expect(screen.queryByText("找食材嗎？")).toBeNull();
    expect(document.querySelectorAll("[data-ai-assistant]")).toHaveLength(1);
    expect(document.querySelector("[data-ai-assistant]")).toHaveAttribute("data-ai-assistant", "admin");
    // 等 AdminLayout 讀完登入狀態,避免 act 警告
    await waitFor(() => expect(screen.getByRole("main")).toBeInTheDocument());
  });

  it("送出含「供應商」「媒合」的訊息 → 只有 AI 回話,不擷取需求、不導頁(🔴 不能導去 /restaurant/*)", async () => {
    chatReply.mockResolvedValueOnce({ reply: "好的,請問是哪一家餐廳的需求?" });
    // 萬一 admin 模式誤把交接函式傳給 Chatbot,這個回覆會讓它真的導頁 —— 測試就會抓到
    analyzeChat.mockResolvedValue(ANALYSIS);
    const user = userEvent.setup();
    renderLayout("/admin/orders");

    await user.click(fab());
    await user.type(chatInput(), "牛肉 5kg,幫我媒合供應商並報價");
    fireEvent.keyPress(chatInput(), { key: "Enter", code: "Enter", charCode: 13 });

    expect(await screen.findByText("好的,請問是哪一家餐廳的需求?")).toBeInTheDocument();
    expect(analyzeChat).not.toHaveBeenCalled();
    expect(pathnames).toEqual(["/admin/orders"]);
    expect(screen.queryByRole("heading", { name: "不該來到這裡" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "AI 助手" })).toBeInTheDocument();
  });

  it("用側欄換頁:泡泡一直在,開著的面板會收起", async () => {
    const user = userEvent.setup();
    renderLayout("/admin");

    await user.click(fab());
    expect(screen.getByRole("dialog", { name: "AI 助手" })).toBeInTheDocument();

    // 桌機與手機側欄各有一份連結,點第一份就好
    await user.click(screen.getAllByRole("link", { name: "分析紀錄" })[0]);

    expect(screen.getByRole("heading", { name: "分析紀錄頁" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveAttribute("aria-expanded", "false");
    expect(within(document.body).getAllByTestId("ai-assistant-tip")).toHaveLength(1);
  });

  it("主內容底部留白(160px)讓表格底下靠右的按鈕能捲到泡泡與小標籤上方", async () => {
    renderLayout("/admin/orders");

    expect(screen.getByRole("main")).toHaveClass("pb-40");
    await waitFor(() => expect(screen.getByRole("main")).toBeInTheDocument());
  });
});
