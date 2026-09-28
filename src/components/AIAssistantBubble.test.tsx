// AI 小助手泡泡:開關、Esc、焦點、手機全螢幕、換頁收起,以及兩種模式整理出需求後的去向:
//   · restaurant(預設):不會自己跳頁。對話裡出現結果卡,按「到 AI 菜單分析查看」才導去
//     /restaurant/analyze(需求放在 router state);使用者看不到面板時改跳 toast,按「查看」才導;
//     泡泡已經卸載就什麼都不做
//   · admin:純對話,不擷取需求、不導頁(管理員站沒有 /restaurant/*)
//
// 用真的 Chatbot(variant="panel")跑整段對話,只 mock 掉 AI 呼叫 ——
// 🔴 測試環境會讀到 .env.local 的正式 Supabase 網址,漏 mock 就會打正式的 AI Edge Function(會計費),
//    fetch 另外換成一律失敗的假函式當第二道保險。

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ComponentProps } from "react";
import { Link, MemoryRouter, useLocation, type Location } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AnalysisResult } from "@/lib/api";
import AIAssistantBubble from "./AIAssistantBubble";

const { chatReply, analyzeChat, track, toastError, toastFn, toastDismiss } = vi.hoisted(() => ({
  chatReply: vi.fn(),
  analyzeChat: vi.fn(),
  track: vi.fn(),
  toastError: vi.fn(),
  toastFn: vi.fn((..._args: unknown[]) => "result-toast"),
  toastDismiss: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, chatReply, analyzeChat };
});

vi.mock("@/lib/analytics", () => ({ track }));

vi.mock("sonner", () => ({
  toast: Object.assign(toastFn, { error: toastError, success: vi.fn(), info: vi.fn(), dismiss: toastDismiss }),
}));

type ToastOptions = { action: { label: string; onClick: () => void } };
/** 泡泡跳出的「AI 已整理好」toast:文字與「查看」動作 */
const resultToast = () => {
  const [message, options] = toastFn.mock.calls[0] as [string, ToastOptions];
  return { message, options };
};

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

const REQUEST = "牛肉 5kg、洋蔥 3kg、青蔥,幫我找供應商";

const HANDOFF_STATE = {
  chatRequirements: ["牛肉 5kg", "洋蔥 3kg", "青蔥"],
  chatMeta: { analysisId: "analysis-1", names: ["牛肉", "洋蔥", "青蔥"] },
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// 每次渲染後的網址都記下來,驗「有沒有導頁、導去哪、帶什麼 state」
let locations: Location[] = [];
const LocationProbe = () => {
  const location = useLocation();
  useEffect(() => {
    locations.push(location);
  }, [location]);
  return null;
};
const currentLocation = () => locations[locations.length - 1];

type BubbleProps = ComponentProps<typeof AIAssistantBubble>;

const renderBubble = (props: BubbleProps = {}, path = "/restaurant/orders") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <button type="button">頁面上的按鈕</button>
        <Link to="/restaurant/suppliers">我的供應商</Link>
        <AIAssistantBubble {...props} />
        <LocationProbe />
      </LanguageProvider>
    </MemoryRouter>,
  );

/**
 * Router 一直在、只有泡泡被拿掉 —— 跟真的一樣(登出、切到供應商後台時整個 App 的 Router 還在)。
 * 這樣泡泡卸載後如果還偷偷導頁,LocationProbe 會記到。
 */
const renderRemovableBubble = (path = "/restaurant/orders") => {
  const Tree = ({ showBubble }: { showBubble: boolean }) => (
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        {showBubble && <AIAssistantBubble />}
        <LocationProbe />
      </LanguageProvider>
    </MemoryRouter>
  );
  const view = render(<Tree showBubble />);
  return { removeBubble: () => view.rerender(<Tree showBubble={false} />) };
};

const fab = (name = "找食材嗎？AI 採購助手") => screen.getByRole("button", { name });
const tip = () => screen.getByTestId("ai-assistant-tip");
const chatInput = () => screen.getByRole("textbox", { name: "輸入食材需求" });
const panel = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const pressEnter = (el: HTMLElement) =>
  fireEvent.keyPress(el, { key: "Enter", code: "Enter", charCode: 13 });

/** 模擬視窗寬度:jsdom 沒有 matchMedia,元件在沒有 matchMedia 時當桌機 */
const setViewport = (desktop: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  locations = [];
  // clearMocks 不會清掉排隊中的 mockResolvedValueOnce,這裡整個重設,避免上一個測試沒用完的回覆漏過來
  chatReply.mockReset();
  analyzeChat.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { matchMedia?: unknown }).matchMedia;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  document.body.style.overflow = "";
  expect(fetchGuard).not.toHaveBeenCalled();
  // 泡泡在固定定位的面板裡對話,不能連外層頁面一起捲
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

describe("AIAssistantBubble 收起時", () => {
  it("只露出泡泡與「找食材嗎？」小標籤;泡泡的可及名稱是文字,不只是圖示", () => {
    renderBubble();

    expect(fab()).toHaveAttribute("aria-expanded", "false");
    expect(fab()).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel()).toHaveAttribute("aria-hidden", "true");
    expect(panel()).toHaveAttribute("inert");
    expect(panel()).toHaveAttribute("data-state", "closed");

    // 小標籤看得到,但跟泡泡是同一個動作:不重複出現在 Tab 序列與報讀裡
    expect(tip()).toHaveTextContent("找食材嗎？");
    expect(tip()).toHaveAttribute("aria-hidden", "true");
    expect(tip()).toHaveAttribute("tabindex", "-1");
    expect(tip()).not.toHaveAttribute("data-hidden");
  });

  it("用 portal 掛在 body 底下,不受掛載位置的版面影響", () => {
    const { container } = renderBubble();

    const root = fab().closest("[data-ai-assistant]");
    expect(root).toHaveAttribute("data-ai-assistant", "restaurant");
    expect(root?.parentElement).toBe(document.body);
    expect(container.contains(fab())).toBe(false);
  });
});

describe("AIAssistantBubble 開關與焦點(桌機)", () => {
  it("點泡泡打開:焦點進輸入框、小標籤收起、非強制回應;再點一次收起", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());

    const dialog = screen.getByRole("dialog", { name: "AI 採購助手" });
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog).not.toHaveAttribute("inert");
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(fab()).toHaveAttribute("aria-expanded", "true");
    expect(fab()).toHaveAttribute("aria-controls", dialog.id);
    expect(chatInput()).toHaveFocus();
    expect(tip()).toHaveAttribute("data-hidden");
    expect(document.body.style.overflow).toBe("");

    // 面板裡只有面板自己的標題,Chatbot 的大標題與卡片標題列都拿掉了
    expect(within(dialog).getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "iFoodmap AI 採購助手",
    ]);

    await user.click(fab());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel()).toHaveAttribute("inert");
    expect(fab()).toHaveAttribute("aria-expanded", "false");
    expect(fab()).toHaveFocus();
    expect(tip()).not.toHaveAttribute("data-hidden");
  });

  it("點「找食材嗎？」小標籤也能打開", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(tip());

    expect(screen.getByRole("dialog", { name: "AI 採購助手" })).toBeInTheDocument();
    expect(chatInput()).toHaveFocus();
  });

  it("Esc 關閉面板並把焦點還給泡泡", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    expect(chatInput()).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveFocus();
  });

  it("焦點在泡泡上時 Esc 也能關閉", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    fab().focus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveFocus();
  });

  it("注音選字中按 Esc 是取消選字,不會關掉面板", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    fireEvent.keyDown(chatInput(), { key: "Escape", isComposing: true });

    expect(screen.getByRole("dialog", { name: "AI 採購助手" })).toBeInTheDocument();
    expect(chatInput()).toHaveFocus();
  });

  it("標題列的「關閉」鈕收起面板並把焦點還給泡泡", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.click(screen.getByRole("button", { name: "關閉" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveFocus();
  });

  it("換頁時自動收起,對話紀錄留著", async () => {
    chatReply.mockResolvedValueOnce({ reply: "請問每週大約需要多少牛肉?" });
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.type(chatInput(), "我要進牛肉");
    pressEnter(chatInput());
    expect(await screen.findByText("請問每週大約需要多少牛肉?")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "我的供應商" }));

    expect(currentLocation().pathname).toBe("/restaurant/suppliers");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveAttribute("aria-expanded", "false");

    await user.click(fab());
    const dialog = screen.getByRole("dialog", { name: "AI 採購助手" });
    expect(within(dialog).getByText("我要進牛肉")).toBeInTheDocument();
    expect(within(dialog).getByText("請問每週大約需要多少牛肉?")).toBeInTheDocument();
  });

  it("捲過第一個畫面後收起小標籤,捲回頂端再出現", () => {
    renderBubble();
    expect(tip()).not.toHaveAttribute("data-hidden");

    Object.defineProperty(window, "scrollY", { configurable: true, value: window.innerHeight });
    fireEvent.scroll(window);
    expect(tip()).toHaveAttribute("data-hidden");

    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    fireEvent.scroll(window);
    expect(tip()).not.toHaveAttribute("data-hidden");
  });
});

describe("AIAssistantBubble 餐廳版整理出需求(不會自己跳頁)", () => {
  const GO = { name: "到 AI 菜單分析查看" };

  it("面板裡出現結果卡、不自動導頁;按「到 AI 菜單分析查看」才收起面板、導去分析頁,state 形狀正確", async () => {
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble({}, "/restaurant/orders");

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    await user.click(screen.getByRole("button", { name: "發送" }));

    const dialog = screen.getByRole("dialog", { name: "AI 採購助手" });
    const go = await within(dialog).findByRole("button", GO);
    expect(within(dialog).getByText("已整理 3 項食材：牛肉 5kg、洋蔥 3kg、青蔥")).toBeInTheDocument();
    expect(within(dialog).queryByText(/正在為您媒合供應商/)).toBeNull();
    // 不自己跳頁、不跳 toast、面板照樣開著,焦點還在輸入框
    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(toastFn).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(chatInput()).toHaveFocus();

    await user.click(go);

    expect(currentLocation().pathname).toBe("/restaurant/analyze");
    const { state } = currentLocation();
    expect(state).toEqual(HANDOFF_STATE);
    // router state 會存進 history.state,必須可序列化
    expect(structuredClone(state)).toEqual(HANDOFF_STATE);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveAttribute("aria-expanded", "false");
    expect(fab()).toHaveFocus();

    // 再打開時對話紀錄與結果卡都還在(Chatbot 沒被卸載)
    await user.click(fab());
    const reopened = screen.getByRole("dialog", { name: "AI 採購助手" });
    expect(within(reopened).getByText(REQUEST)).toBeInTheDocument();
    expect(within(reopened).getByRole("button", GO)).toBeInTheDocument();
  });

  it("超過 3 項時結果卡只列前 3 項再加「…」,導頁時帶完整清單", async () => {
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce({
      ...ANALYSIS,
      ingredients: [...ANALYSIS.ingredients, { name: "雞蛋", quantity: "60", unit: "顆" }],
    });
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());
    await user.click(await screen.findByRole("button", GO));

    expect(screen.queryByText("已整理 4 項食材：牛肉 5kg、洋蔥 3kg、青蔥…")).not.toBeNull();
    expect(currentLocation().state).toEqual({
      chatRequirements: ["牛肉 5kg", "洋蔥 3kg", "青蔥", "雞蛋 60顆"],
      chatMeta: { analysisId: "analysis-1", names: ["牛肉", "洋蔥", "青蔥", "雞蛋"] },
    });
  });

  it("已經在分析頁:按結果卡也照樣導頁(同一路由、新的 location.key),讓分析頁接手新的 state", async () => {
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble({}, "/restaurant/analyze");
    const before = currentLocation();

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());
    const go = await screen.findByRole("button", GO);
    expect(currentLocation().key).toBe(before.key);

    await user.click(go);

    expect(currentLocation().key).not.toBe(before.key);
    expect(currentLocation().pathname).toBe("/restaurant/analyze");
    expect(currentLocation().state).toEqual(HANDOFF_STATE);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("面板收起後結果才回來:不導頁、不搶焦點,改跳 toast;按 toast 的「查看」才導頁", async () => {
    const reply = deferred<{ reply: string }>();
    chatReply.mockReturnValueOnce(reply.promise);
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());
    await user.keyboard("{Escape}");
    const pageButton = screen.getByRole("button", { name: "頁面上的按鈕" });
    pageButton.focus();

    await act(async () => {
      reply.resolve({ reply: "了解,我來幫您整理。" });
    });
    await waitFor(() => expect(toastFn).toHaveBeenCalledTimes(1));

    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(pageButton).toHaveFocus();
    const { message, options } = resultToast();
    expect(message).toBe("AI 已整理好 3 項食材");
    expect(options.action.label).toBe("查看");

    act(() => {
      options.action.onClick();
    });

    expect(currentLocation().pathname).toBe("/restaurant/analyze");
    expect(currentLocation().state).toEqual(HANDOFF_STATE);
    expect(toastDismiss).toHaveBeenCalledWith("result-toast");
  });

  it("toast 跳出後使用者自己打開面板:toast 收掉,結果卡在面板裡,按了才導頁", async () => {
    const reply = deferred<{ reply: string }>();
    chatReply.mockReturnValueOnce(reply.promise);
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());
    await user.keyboard("{Escape}");
    await act(async () => {
      reply.resolve({ reply: "了解,我來幫您整理。" });
    });
    await waitFor(() => expect(toastFn).toHaveBeenCalledTimes(1));

    await user.click(fab());

    expect(toastDismiss).toHaveBeenCalledWith("result-toast");
    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    await user.click(within(screen.getByRole("dialog", { name: "AI 採購助手" })).getByRole("button", GO));
    expect(currentLocation().pathname).toBe("/restaurant/analyze");
    expect(currentLocation().state).toEqual(HANDOFF_STATE);
  });

  it("換頁後結果才回來(就算在新頁面又打開了面板):不導頁,改跳 toast", async () => {
    const reply = deferred<{ reply: string }>();
    chatReply.mockReturnValueOnce(reply.promise);
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble({}, "/restaurant/orders");

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());
    await user.click(screen.getByRole("link", { name: "我的供應商" }));
    expect(currentLocation().pathname).toBe("/restaurant/suppliers");
    await user.click(fab());

    await act(async () => {
      reply.resolve({ reply: "了解,我來幫您整理。" });
    });
    await waitFor(() => expect(toastFn).toHaveBeenCalledTimes(1));

    expect(resultToast().message).toBe("AI 已整理好 3 項食材");
    expect(currentLocation().pathname).toBe("/restaurant/suppliers");
    expect(locations.some((l) => l.pathname === "/restaurant/analyze")).toBe(false);
    expect(screen.getByRole("dialog", { name: "AI 採購助手" })).toHaveAttribute("data-state", "open");
  });

  it("卸載後結果才回來(登出、切到別的後台):不導頁、沒有 toast、沒有 React 警告", async () => {
    const analysis = deferred<AnalysisResult>();
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockReturnValueOnce(analysis.promise);
    const user = userEvent.setup();
    const { removeBubble } = renderRemovableBubble();

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());
    await waitFor(() => expect(analyzeChat).toHaveBeenCalledTimes(1));

    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");
    removeBubble();
    expect(document.querySelector("[data-ai-assistant]")).toBeNull();
    await act(async () => {
      analysis.resolve(ANALYSIS);
    });

    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(toastFn).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("卸載時 AI 還在回話:之後連需求擷取都不做(不建待審分析、不導頁、沒有 toast、沒有 React 警告)", async () => {
    const reply = deferred<{ reply: string }>();
    chatReply.mockReturnValueOnce(reply.promise);
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    const { removeBubble } = renderRemovableBubble();

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());

    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");
    removeBubble();
    await act(async () => {
      reply.resolve({ reply: "了解,我來幫您整理。" });
    });

    expect(analyzeChat).not.toHaveBeenCalled();
    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(toastFn).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("有傳 onRequirementsSubmit 就交給它:不放結果卡、不導頁", async () => {
    const onRequirementsSubmit = vi.fn();
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble({ onRequirementsSubmit }, "/restaurant/orders");

    await user.click(fab());
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());

    await waitFor(() => expect(onRequirementsSubmit).toHaveBeenCalledTimes(1));
    expect(onRequirementsSubmit).toHaveBeenCalledWith(HANDOFF_STATE.chatRequirements, HANDOFF_STATE.chatMeta);
    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(screen.queryByRole("button", GO)).toBeNull();
    expect(toastFn).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveFocus();
  });

  it("只是聊天(沒講到找供應商)時面板保持打開、不導頁、沒有結果卡", async () => {
    chatReply.mockResolvedValueOnce({ reply: "請問每週大約需要多少牛肉?" });
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.type(chatInput(), "我是火鍋店,每週要進牛肉");
    pressEnter(chatInput());

    expect(await screen.findByText("請問每週大約需要多少牛肉?")).toBeInTheDocument();
    expect(analyzeChat).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", GO)).toBeNull();
    expect(toastFn).not.toHaveBeenCalled();
    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(screen.getByRole("dialog", { name: "AI 採購助手" })).toBeInTheDocument();
  });
});

describe('AIAssistantBubble variant="admin"(管理員後台)', () => {
  it("小標與名稱用中性的「AI 助手」,不是「找食材嗎？」", async () => {
    const user = userEvent.setup();
    renderBubble({ variant: "admin" }, "/admin/orders");

    expect(tip()).toHaveTextContent("AI 助手");
    expect(screen.queryByText("找食材嗎？")).toBeNull();
    expect(fab("AI 助手").closest("[data-ai-assistant]")).toHaveAttribute("data-ai-assistant", "admin");

    await user.click(fab("AI 助手"));
    const dialog = screen.getByRole("dialog", { name: "AI 助手" });
    expect(within(dialog).getByRole("heading")).toHaveTextContent("iFoodmap AI 助手");
    expect(chatInput()).toHaveFocus();
  });

  it("送出含「供應商」「媒合」的訊息 → 只有 AI 回話:不擷取需求、不導頁、面板不收(🔴 不能導去 /restaurant/*)", async () => {
    chatReply.mockResolvedValueOnce({ reply: "好的,請問是哪一家餐廳的需求?" });
    // 萬一 admin 模式誤把交接函式傳給 Chatbot,這個回覆會讓它真的導頁 —— 測試就會抓到
    analyzeChat.mockResolvedValue(ANALYSIS);
    const user = userEvent.setup();
    renderBubble({ variant: "admin" }, "/admin/orders");

    await user.click(fab("AI 助手"));
    await user.type(chatInput(), "牛肉 5kg,幫我媒合供應商並報價");
    pressEnter(chatInput());

    expect(await screen.findByText("好的,請問是哪一家餐廳的需求?")).toBeInTheDocument();
    expect(chatReply).toHaveBeenCalledTimes(1);
    expect(analyzeChat).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(locations.map((l) => l.pathname)).toEqual(["/admin/orders"]);
    expect(locations.some((l) => l.pathname.startsWith("/restaurant"))).toBe(false);
    expect(screen.getByRole("dialog", { name: "AI 助手" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "到 AI 菜單分析查看" })).toBeNull();
    expect(toastFn).not.toHaveBeenCalled();
  });
});

describe("AIAssistantBubble 開場白", () => {
  const firstMessage = (dialog: HTMLElement) => within(dialog).getByRole("log").firstElementChild as HTMLElement;
  const ADMIN_GREETING = "我是 AI 助手，會像跟餐廳對話時一樣，陪你把食材的品項、數量和配送需求一步步問清楚。";

  it("管理員版不交接,開場白不能提「供應商」「媒合」「報價」;送給 AI 的對話也從這句開始", async () => {
    chatReply.mockResolvedValueOnce({ reply: "好的,請問是哪一類食材?" });
    const user = userEvent.setup();
    renderBubble({ variant: "admin" }, "/admin/orders");

    await user.click(fab("AI 助手"));
    const greeting = firstMessage(screen.getByRole("dialog", { name: "AI 助手" }));
    expect(greeting).toHaveTextContent(ADMIN_GREETING);
    for (const word of ["供應商", "媒合", "報價"]) {
      expect(greeting.textContent).not.toContain(word);
    }

    await user.type(chatInput(), "我想問葉菜類");
    pressEnter(chatInput());
    expect(await screen.findByText("好的,請問是哪一類食材?")).toBeInTheDocument();
    expect(chatReply).toHaveBeenCalledWith([
      { role: "bot", text: ADMIN_GREETING },
      { role: "user", text: "我想問葉菜類" },
    ]);
  });

  it("餐廳版的開場白不變,還是字典裡原本那句", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    expect(firstMessage(screen.getByRole("dialog", { name: "AI 採購助手" }))).toHaveTextContent(
      "您好！我是您的食材採購助手。請告訴我您需要什麼食材，我會幫您找到合適的供應商。",
    );
  });
});

describe("AIAssistantBubble 手機(<640px)全螢幕", () => {
  beforeEach(() => setViewport(false));

  it("aria-modal、鎖住背景捲動,Esc 關閉後還原捲動並把焦點還給泡泡", async () => {
    document.body.style.overflow = "auto";
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());

    const dialog = screen.getByRole("dialog", { name: "AI 採購助手" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(chatInput()).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(panel()).not.toHaveAttribute("aria-modal");
    expect(document.body.style.overflow).toBe("auto");
    expect(fab()).toHaveFocus();
  });

  it("點背景遮罩關閉", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    await user.click(screen.getByTestId("ai-assistant-backdrop"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab()).toHaveFocus();
  });

  it("Tab / Shift+Tab 的焦點鎖在面板裡", async () => {
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    const close = screen.getByRole("button", { name: "關閉" });
    expect(chatInput()).toHaveFocus();

    // 還沒打字時「發送」是 disabled,輸入框就是最後一站 → 繞回「關閉」
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(chatInput()).toHaveFocus();

    await user.type(chatInput(), "牛肉");
    await user.tab();
    expect(screen.getByRole("button", { name: "發送" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it("結果卡一樣在面板裡;按了才收起、還原背景捲動,再導去分析頁", async () => {
    chatReply.mockResolvedValueOnce({ reply: "了解,我來幫您整理。" });
    analyzeChat.mockResolvedValueOnce(ANALYSIS);
    const user = userEvent.setup();
    renderBubble();

    await user.click(fab());
    expect(document.body.style.overflow).toBe("hidden");
    await user.type(chatInput(), REQUEST);
    pressEnter(chatInput());

    const go = await screen.findByRole("button", { name: "到 AI 菜單分析查看" });
    expect(locations.map((l) => l.pathname)).toEqual(["/restaurant/orders"]);
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(go);

    expect(currentLocation().pathname).toBe("/restaurant/analyze");
    expect(currentLocation().state).toEqual(HANDOFF_STATE);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(fab()).toHaveFocus();
  });
});

describe("AIAssistantBubble 讓位給右下角的 toast", () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

  /** 假裝排版:泡泡在右下角;toast 的位置由 data-rect 指定(jsdom 不排版) */
  const fakeLayout = (fabName?: string) => {
    const fabEl = fab(fabName);
    return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this === fabEl) return rect(1194, window.innerHeight - 88, 58, 58);
      const spec = this.getAttribute("data-rect");
      if (spec) {
        const [l, t, w, h] = spec.split(",").map(Number);
        return rect(l, t, w, h);
      }
      return rect(0, 0, 0, 0);
    });
  };

  const addToast = (attrs: Record<string, string>) => {
    const list = document.createElement("ol");
    const item = document.createElement("li");
    Object.entries(attrs).forEach(([k, v]) => item.setAttribute(k, v));
    list.appendChild(item);
    document.body.appendChild(list);
    return { list, item };
  };

  const lift = () => document.querySelector<HTMLElement>("[data-ai-assistant]")!.style.getPropertyValue("--ai-lift");

  it("右下角出現 sonner toast 時,整組往上挪到 toast 上方;toast 收掉就回來", async () => {
    renderBubble();
    const layout = fakeLayout();
    expect(lift()).toBe("0px");

    // sonner 桌機預設:右下角,距底 32px,高 54px → toast 頂端距底 86px
    const H = window.innerHeight;
    const { list, item } = addToast({ "data-sonner-toast": "", "data-rect": `892,${H - 86},356,54` });
    await waitFor(() => expect(lift()).toBe("86px"));

    item.setAttribute("data-removed", "true");
    await waitFor(() => expect(lift()).toBe("0px"));

    list.remove();
    layout.mockRestore();
  });

  it("shadcn(Radix)toast 也一樣讓位", async () => {
    renderBubble({ variant: "admin" }, "/admin/orders");
    const layout = fakeLayout("AI 助手");

    const H = window.innerHeight;
    const { list, item } = addToast({
      "data-swipe-direction": "right",
      "data-state": "open",
      "data-rect": `860,${H - 110},404,94`,
    });
    await waitFor(() => expect(lift()).toBe("110px"));

    item.setAttribute("data-state", "closed");
    await waitFor(() => expect(lift()).toBe("0px"));

    list.remove();
    layout.mockRestore();
  });

  it("不在泡泡那一欄、或在畫面上半部的 toast,不用讓", async () => {
    renderBubble();
    const layout = fakeLayout();

    const H = window.innerHeight;
    const left = addToast({ "data-sonner-toast": "", "data-rect": `16,${H - 86},356,54` });
    const top = addToast({ "data-sonner-toast": "", "data-rect": "1000,16,356,54" });
    // 讓 MutationObserver 跑完、量過一次
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(lift()).toBe("0px");

    left.list.remove();
    top.list.remove();
    layout.mockRestore();
  });
});
