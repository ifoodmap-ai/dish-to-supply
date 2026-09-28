// Chatbot 的回歸護欄。
//
// Chatbot 同時被訪客首頁(Index.tsx)與餐廳後台的 AI 小助手泡泡(AIAssistantBubble)使用。
// 泡泡會傳 variant="panel" 拿掉外框與重複標題;首頁什麼都不傳。
// 「預設輸出」這組快照是在 Chatbot 加 variant 之前產生的 —— 之後只要不傳 variant 時的
// 輸出(初始、打字、等待回覆、收到回覆、送出需求、AI 失敗)有任何變動,這裡就會紅。
//
// 🔴 AI 一律 mock:測試環境會讀到 .env.local 的正式 Supabase 網址,漏 mock 就會打正式的
//    AI Edge Function(會計費)。fetch 另外換成一律失敗的假函式當第二道保險。

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AnalysisResult } from "@/lib/api";
import Chatbot from "./Chatbot";

const { chatReply, analyzeChat, track, toastError } = vi.hoisted(() => ({
  chatReply: vi.fn(),
  analyzeChat: vi.fn(),
  track: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, chatReply, analyzeChat };
});

vi.mock("@/lib/analytics", () => ({ track }));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn() },
}));

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

const PLACEHOLDER = "例如：我需要新鮮番茄、生菜、雞胸肉...";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderWithLanguage = (ui: ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

let timeSpy: MockInstance;
let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // 訊息時間戳記隨執行當下與系統語系變動,固定下來快照才穩定
  timeSpy = vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("10:30");
  // jsdom 沒有 scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  timeSpy.mockRestore();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
});

describe("Chatbot 預設輸出(不傳 variant,訪客首頁 Index.tsx 的用法)", () => {
  it("初始 → 打字 → 等待回覆 → 收到回覆 → 送出需求,每一段輸出與加 prop 前一致", async () => {
    const onRequirementsSubmit = vi.fn();
    const { container } = renderWithLanguage(<Chatbot onRequirementsSubmit={onRequirementsSubmit} />);

    expect(container).toMatchSnapshot("初始");

    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(input, { target: { value: "我是火鍋店,每週要進牛肉" } });
    expect(container).toMatchSnapshot("打字中");

    const firstReply = deferred<{ reply: string }>();
    chatReply.mockReturnValueOnce(firstReply.promise);
    fireEvent.click(screen.getByRole("button"));
    expect(container).toMatchSnapshot("等待回覆");

    await act(async () => {
      firstReply.resolve({ reply: "好的!請問每週大約需要多少牛肉?" });
    });
    expect(container).toMatchSnapshot("收到回覆");
    expect(chatReply).toHaveBeenLastCalledWith([
      { role: "bot", text: "您好！我是您的食材採購助手。請告訴我您需要什麼食材，我會幫您找到合適的供應商。" },
      { role: "user", text: "我是火鍋店,每週要進牛肉" },
    ]);
    expect(analyzeChat).not.toHaveBeenCalled();

    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    fireEvent.change(input, { target: { value: "牛肉 5kg、洋蔥 3kg、青蔥,幫我找供應商" } });
    fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

    await waitFor(() => expect(onRequirementsSubmit).toHaveBeenCalledTimes(1));
    expect(onRequirementsSubmit).toHaveBeenCalledWith(["牛肉 5kg", "洋蔥 3kg", "青蔥"], {
      analysisId: "analysis-1",
      names: ["牛肉", "洋蔥", "青蔥"],
    });
    // 等「打字中」三個點消失(finally 跑完)再拍
    await waitFor(() => expect(container.querySelector(".animate-bounce")).toBeNull());
    expect(screen.getByText(/已為您整理出採購需求/)).toBeInTheDocument();
    expect(container).toMatchSnapshot("送出需求後");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("AI 失敗時的輸出與加 prop 前一致", async () => {
    chatReply.mockRejectedValueOnce(new Error("網路逾時"));
    const { container } = renderWithLanguage(<Chatbot onRequirementsSubmit={vi.fn()} />);

    const input = screen.getByPlaceholderText(PLACEHOLDER);
    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button"));

    await screen.findByText(/抱歉,AI 服務暫時無法回覆/);
    expect(toastError).toHaveBeenCalledWith("AI 對話失敗:網路逾時");
    expect(container).toMatchSnapshot("AI 失敗");
  });
});

describe('Chatbot variant="panel"(AI 小助手泡泡的面板)', () => {
  it("拿掉外框與重複標題;訊息列表、輸入框、發送鈕都有可及名稱", () => {
    const { container } = renderWithLanguage(<Chatbot variant="panel" onRequirementsSubmit={vi.fn()} />);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByText("線上")).toBeNull();

    const log = screen.getByRole("log", { name: "食材需求對話" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveTextContent("您好！我是您的食材採購助手。");
    expect(screen.getByRole("textbox", { name: "輸入食材需求" })).toHaveAttribute("placeholder", PLACEHOLDER);
    expect(screen.getByRole("button", { name: "發送" })).toBeDisabled();
  });

  it("對話邏輯跟預設版一樣:送出需求照樣擷取並轉傳,只捲自己的列表、不呼叫 scrollIntoView", async () => {
    const onRequirementsSubmit = vi.fn();
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    renderWithLanguage(<Chatbot variant="panel" onRequirementsSubmit={onRequirementsSubmit} />);

    const input = screen.getByRole("textbox", { name: "輸入食材需求" });
    fireEvent.change(input, { target: { value: "牛肉 5kg、洋蔥 3kg、青蔥,幫我找供應商" } });
    fireEvent.click(screen.getByRole("button", { name: "發送" }));

    // 發送鈕在輸入框清空後變 disabled,焦點要放回輸入框,不能掉到 body
    expect(input).toHaveFocus();
    // 等待回覆時有報讀用的文字
    expect(screen.getByRole("log")).toHaveTextContent("正在分析您的需求...");

    await waitFor(() => expect(onRequirementsSubmit).toHaveBeenCalledTimes(1));
    expect(onRequirementsSubmit).toHaveBeenCalledWith(["牛肉 5kg", "洋蔥 3kg", "青蔥"], {
      analysisId: "analysis-1",
      names: ["牛肉", "洋蔥", "青蔥"],
    });
    expect(track).toHaveBeenCalledWith("analysis_started", { source: "chat" });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("AI 失敗時一樣回錯誤訊息並跳 toast", async () => {
    chatReply.mockRejectedValueOnce(new Error("網路逾時"));
    renderWithLanguage(<Chatbot variant="panel" onRequirementsSubmit={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: "輸入食材需求" });
    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

    expect(await screen.findByText(/抱歉,AI 服務暫時無法回覆/)).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("AI 對話失敗:網路逾時");
  });

  it("傳 greeting 就用它當開場白,送給 AI 的對話也從它開始", async () => {
    chatReply.mockResolvedValueOnce({ reply: "好的" });
    renderWithLanguage(<Chatbot variant="panel" greeting="我是 AI 助手,可以陪你把需求問清楚。" />);

    const log = screen.getByRole("log");
    expect(log.firstElementChild).toHaveTextContent("我是 AI 助手,可以陪你把需求問清楚。");
    expect(log).not.toHaveTextContent("您好！我是您的食材採購助手。");

    const input = screen.getByRole("textbox", { name: "輸入食材需求" });
    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });
    expect(await screen.findByText("好的")).toBeInTheDocument();
    expect(chatReply).toHaveBeenCalledWith([
      { role: "bot", text: "我是 AI 助手,可以陪你把需求問清楚。" },
      { role: "user", text: "你好" },
    ]);
  });

  it("英文介面時輸入框的可及名稱也是英文", () => {
    // LanguageProvider 從 localStorage 讀語系;測試環境的 localStorage 不可靠,直接換掉
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "ifm_lang" ? "en" : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    renderWithLanguage(<Chatbot variant="panel" />);

    expect(screen.getByRole("textbox", { name: "Describe the ingredients you need" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
