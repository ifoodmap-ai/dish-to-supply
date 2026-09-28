// MenuUpload 精簡版(餐廳後台 AI 菜單分析頁)的上傳卡:整張卡都要點得到。
//
// 驗收抓到:外面包一層 <Card className="p-4 sm:p-6">、label 只在虛線框上時,
// 卡片外框與內距那一圈點了沒反應(游標也不是手指)。現在 label 本身就是卡片。
// 預設版(Index 用的)的輸出由 src/pages/Index.shared-components.test.tsx 的快照鎖住。

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import MenuUpload from "./MenuUpload";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const renderCompact = () =>
  render(
    <LanguageProvider>
      <MenuUpload compact onAnalysisComplete={vi.fn()} />
    </LanguageProvider>,
  );

describe("MenuUpload compact 上傳卡", () => {
  afterEach(() => {
    cleanup();
  });

  it("卡片最外圈(外框+內距)就在可點的 label 範圍內:label 本身就是卡片,外面沒有再包一層", () => {
    const { container } = renderCompact();
    const input = container.querySelector<HTMLInputElement>("#menu-upload");
    const label = container.querySelector<HTMLLabelElement>('label[for="menu-upload"]');
    if (!input || !label) throw new Error("找不到上傳用的 input / label");

    // 元件只輸出兩個節點:畫面外的 input(sr-only,不佔版面)和 label。
    // 沒有任何包在 label 外面、會自己佔一圈空間的元素 —— 也就不會有點不到的死區
    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(input);
    expect(container.children[1]).toBe(label);
    expect(input).toHaveClass("sr-only");

    // 卡片的外框、圓角、底色、陰影,以及內距,全都長在 label 自己身上
    expect(label).toHaveClass("block", "cursor-pointer", "rounded-lg", "border", "bg-card", "shadow-sm", "p-4", "sm:p-6");

    // 看得到的內容全都在 label 裡
    expect(label).toContainElement(screen.getByText("上傳菜單照片"));
    expect(label).toContainElement(screen.getByText("AI 會列出要採購的食材"));

    // 點在最外圈時事件的 target 就是 label 本身(不是內層虛線框)—— 一樣會轉成點 input,也就是開選檔
    const openPicker = vi.fn();
    input.addEventListener("click", openPicker);
    fireEvent.click(label);
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  it("鍵盤:input 是 sr-only(不是 display:none),Tab 得到;聚焦框掛在卡片上", () => {
    const { container } = renderCompact();
    const input = container.querySelector<HTMLInputElement>("#menu-upload");
    const label = container.querySelector<HTMLLabelElement>('label[for="menu-upload"]');
    if (!input || !label) throw new Error("找不到上傳用的 input / label");

    expect(input).toHaveAttribute("type", "file");
    expect(input).not.toHaveClass("hidden");
    expect(input).toHaveClass("peer");
    input.focus();
    expect(input).toHaveFocus();
    expect(label).toHaveClass("peer-focus-visible:ring-2", "peer-focus-visible:ring-ring");
  });

  it("選好照片後換成預覽卡(不再是 label),可以換一張回到上傳卡", () => {
    URL.createObjectURL = vi.fn(() => "blob:menu-preview");
    const { container } = renderCompact();

    fireEvent.change(screen.getByLabelText(/上傳菜單照片/), {
      target: { files: [new File(["menu"], "menu.png", { type: "image/png" })] },
    });
    expect(screen.getByAltText("菜單預覽")).toBeInTheDocument();
    expect(container.querySelector('label[for="menu-upload"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "換一張" }));
    expect(container.querySelector('label[for="menu-upload"]')).not.toBeNull();
  });
});
