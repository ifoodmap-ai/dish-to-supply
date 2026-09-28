// SectionTabs 是給供應商/餐廳/管理員三個後台共用的分頁列。
// 這裡只測元件本身的行為(可見分頁、active 判斷、鍵盤操作、aria 屬性),
// 不依賴任何實際後台的路由表 —— 用假的 tabs 陣列驗證它是「通用」的。

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import SectionTabs, { type SectionTabItem } from "./SectionTabs";

// 這個 repo 的 vitest 設定沒有開全域 auto-cleanup(setup.ts 只掛 jest-dom matcher),
// 每個測試檔要自己在 afterEach 呼叫 cleanup(),不然上一個 render() 的 DOM 會疊在下一個測試上。
afterEach(() => {
  cleanup();
});

const threeTabs: SectionTabItem[] = [
  { label: "收單", path: "/supplier/orders" },
  { label: "報價", path: "/supplier/quotes" },
  { label: "出貨", path: "/supplier/shipments" },
];

const renderTabs = (
  tabs: SectionTabItem[],
  path: string,
  extra?: Partial<React.ComponentProps<typeof SectionTabs>>,
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionTabs tabs={tabs} ariaLabel="訂單分區的分頁" {...extra} />
    </MemoryRouter>,
  );

describe("SectionTabs — 可見分頁與數量", () => {
  it("只剩 1 個可見分頁時整個不畫(單一目的地的切換器沒有意義)", () => {
    const tabs: SectionTabItem[] = [
      { label: "商品目錄", path: "/supplier/catalog" },
      { label: "行情比價", path: "/supplier/pricing", hidden: true },
    ];
    renderTabs(tabs, "/supplier/catalog");
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("0 個分頁、或 tabs 為空陣列也不畫", () => {
    renderTabs([], "/supplier/catalog");
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("分頁數量剛好對上可見清單,順序不變", () => {
    renderTabs(threeTabs, "/supplier/orders");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent)).toEqual(["收單", "報價", "出貨"]);
  });

  it("hidden 分頁(不論函式或布林值)不算進可見清單,就算排在中間", () => {
    const tabs: SectionTabItem[] = [
      { label: "商機雷達", path: "/supplier/leads" },
      { label: "永遠隱藏", path: "/supplier/hidden-a", hidden: true },
      { label: "函式隱藏", path: "/supplier/hidden-b", hidden: () => true },
      { label: "需求與備貨", path: "/supplier/forecast" },
    ];
    renderTabs(tabs, "/supplier/leads");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByText("永遠隱藏")).toBeNull();
    expect(screen.queryByText("函式隱藏")).toBeNull();
  });
});

describe("SectionTabs — 依路由標出所在分頁", () => {
  it("目前路徑完全等於某分頁 → 那個分頁 aria-selected=true,其餘 false", () => {
    renderTabs(threeTabs, "/supplier/quotes");
    expect(screen.getByRole("tab", { name: "收單" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "報價" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "出貨" })).toHaveAttribute("aria-selected", "false");
  });

  it("子路徑也算在分頁範圍內(前綴比對,例如 /supplier/orders/123)", () => {
    renderTabs(threeTabs, "/supplier/orders/123");
    expect(screen.getByRole("tab", { name: "收單" })).toHaveAttribute("aria-selected", "true");
  });

  it("停在被隱藏的分頁路由時,沒有任何可見分頁顯示為 active,但分頁列仍可鍵盤聚焦", () => {
    const tabs: SectionTabItem[] = [
      { label: "商品目錄", path: "/supplier/catalog" },
      { label: "行情比價", path: "/supplier/pricing", hidden: true },
      { label: "第三頁", path: "/supplier/extra" },
    ];
    renderTabs(tabs, "/supplier/pricing");
    const allTabs = screen.getAllByRole("tab");
    expect(allTabs.every((t) => t.getAttribute("aria-selected") === "false")).toBe(true);
    expect(allTabs[0]).toHaveAttribute("tabindex", "0");
  });
});

describe("SectionTabs — aria 屬性", () => {
  it("容器是 role=tablist 並帶 aria-label;每個分頁是 role=tab", () => {
    renderTabs(threeTabs, "/supplier/orders");
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label", "訂單分區的分頁");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("給了 panelId 時,每個分頁都有 aria-controls 指向它", () => {
    renderTabs(threeTabs, "/supplier/orders", { panelId: "supplier-main-panel" });
    screen.getAllByRole("tab").forEach((tab) => {
      expect(tab).toHaveAttribute("aria-controls", "supplier-main-panel");
    });
  });

  it("沒給 panelId 就不寫 aria-controls", () => {
    renderTabs(threeTabs, "/supplier/orders");
    screen.getAllByRole("tab").forEach((tab) => {
      expect(tab).not.toHaveAttribute("aria-controls");
    });
  });

  it("roving tabindex:只有 active 分頁 tabIndex=0,其餘 -1", () => {
    renderTabs(threeTabs, "/supplier/quotes");
    expect(screen.getByRole("tab", { name: "收單" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "報價" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "出貨" })).toHaveAttribute("tabindex", "-1");
  });

  it("手機橫向捲動:分頁列不換行、可以橫向 overflow", () => {
    renderTabs(threeTabs, "/supplier/orders");
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("overflow-x-auto");
    expect(tablist).toHaveClass("whitespace-nowrap");
  });
});

describe("SectionTabs — 鍵盤操作", () => {
  it("方向鍵在可見分頁間移動焦點,並且頭尾會繞回", () => {
    renderTabs(threeTabs, "/supplier/orders");
    const first = screen.getByRole("tab", { name: "收單" });
    const second = screen.getByRole("tab", { name: "報價" });
    const third = screen.getByRole("tab", { name: "出貨" });
    const tablist = screen.getByRole("tablist");

    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(third).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(third).toHaveFocus();
  });

  it("Home / End 跳到第一個與最後一個可見分頁", () => {
    renderTabs(threeTabs, "/supplier/orders");
    const first = screen.getByRole("tab", { name: "收單" });
    const third = screen.getByRole("tab", { name: "出貨" });
    const tablist = screen.getByRole("tablist");

    first.focus();
    fireEvent.keyDown(tablist, { key: "End" });
    expect(third).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(first).toHaveFocus();
  });

  it("隱藏的分頁不會被鍵盤移動選到(方向鍵只在可見分頁間跳)", () => {
    const tabs: SectionTabItem[] = [
      { label: "商品目錄", path: "/supplier/catalog" },
      { label: "行情比價", path: "/supplier/pricing", hidden: true },
      { label: "第三頁", path: "/supplier/extra" },
    ];
    renderTabs(tabs, "/supplier/catalog");
    const first = screen.getByRole("tab", { name: "商品目錄" });
    const second = screen.getByRole("tab", { name: "第三頁" });
    const tablist = screen.getByRole("tablist");

    first.focus();
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(second).toHaveFocus();
    expect(screen.queryByText("行情比價")).toBeNull();
  });
});

describe("SectionTabs — 分頁背後是真實路由", () => {
  const ProbeAndTabs = ({ tabs }: { tabs: SectionTabItem[] }) => {
    const location = useLocation();
    return (
      <>
        <SectionTabs tabs={tabs} ariaLabel="訂單分區的分頁" />
        <p data-testid="path">{location.pathname}</p>
      </>
    );
  };

  it("點分頁會換路由(不是假分頁,是 NavLink 深連結)", () => {
    render(
      <MemoryRouter initialEntries={["/supplier/orders"]}>
        <ProbeAndTabs tabs={threeTabs} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("path")).toHaveTextContent("/supplier/orders");

    fireEvent.click(screen.getByRole("tab", { name: "報價" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/supplier/quotes");
  });

  it("在分頁上按 Space 也會觸發跳轉(原生 <a> 預設不吃 Space)", () => {
    render(
      <MemoryRouter initialEntries={["/supplier/orders"]}>
        <ProbeAndTabs tabs={threeTabs} />
      </MemoryRouter>,
    );
    screen.getByRole("tab", { name: "出貨" }).focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: " " });
    expect(screen.getByTestId("path")).toHaveTextContent("/supplier/shipments");
  });
});
