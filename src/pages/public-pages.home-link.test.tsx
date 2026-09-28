// 五個未登入公開頁都要能回形象站首頁(logo + 「← 回首頁」),管理員站則不能有。
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LANDING_URL } from "@/lib/site";
import { createMemoryStorage } from "@/test/memory-storage";
import JoinSupplierPage from "./JoinSupplierPage";
import LoginPortal from "./LoginPortal";
import RegisterCompletePage from "./RegisterCompletePage";
import ResetPasswordPage from "./ResetPasswordPage";
import RestaurantRegisterPage from "./RestaurantRegisterPage";

// 不讓任何一頁碰到正式 Supabase:session 一律是空的,寫入也是假的
const { supabase } = vi.hoisted(() => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const PAGES: [string, ComponentType][] = [
  ["LoginPortal (/)", LoginPortal],
  ["RestaurantRegisterPage (/register/restaurant)", RestaurantRegisterPage],
  ["JoinSupplierPage (/join)", JoinSupplierPage],
  ["RegisterCompletePage (/register/complete)", RegisterCompletePage],
  ["ResetPasswordPage (/reset-password)", ResetPasswordPage],
];

const renderPage = (
  Page: ComponentType,
  lang: "zh" | "en" = "zh",
  Provider: ComponentType<{ children: ReactNode }> = LanguageProvider,
) => {
  localStorage.setItem("ifm_lang", lang);
  return render(
    <Provider>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </Provider>,
  );
};

beforeEach(() => {
  // 語言存在 localStorage(ifm_lang);見 memory-storage.ts 為什麼要換掉
  vi.stubGlobal("localStorage", createMemoryStorage());
  // 管理員站登入頁一進來就有表單,Radix Checkbox 需要 ResizeObserver(jsdom 沒有)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(PAGES)("%s", (_name, Page) => {
  it("links the logo and 回首頁 to the Chinese landing home", async () => {
    renderPage(Page, "zh");

    const logoLink = await screen.findByRole("link", {
      name: "回到 iFoodmap 食材地圖首頁",
    });
    const backLink = screen.getByRole("link", { name: "回首頁" });

    expect(logoLink).toHaveAttribute("href", `${LANDING_URL}/`);
    expect(backLink).toHaveAttribute("href", `${LANDING_URL}/`);
    expect(within(logoLink).getByRole("img", { name: "iFoodmap" })).toBeInTheDocument();
    // 頁首已有 logo,內文不該再放第二個
    expect(screen.getAllByRole("img", { name: "iFoodmap" })).toHaveLength(1);
  });

  it("uses English labels and /en when the language is English", async () => {
    renderPage(Page, "en");

    expect(
      await screen.findByRole("link", { name: "Back to the iFoodmap homepage" }),
    ).toHaveAttribute("href", `${LANDING_URL}/en`);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      `${LANDING_URL}/en`,
    );
  });
});

describe("links that mean 'log in' stay on the product site", () => {
  it("RestaurantRegisterPage keeps 登入平台 → /", async () => {
    renderPage(RestaurantRegisterPage);
    expect(screen.getByRole("link", { name: "登入平台" })).toHaveAttribute("href", "/");
  });

  it("ResetPasswordPage keeps 回登入頁 → /", async () => {
    renderPage(ResetPasswordPage);
    expect(await screen.findByRole("link", { name: "回登入頁" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("JoinSupplierPage after applying", () => {
  it("sends the applicant back to the landing home, not the login page", async () => {
    renderPage(JoinSupplierPage);

    fireEvent.change(screen.getByLabelText(/公司名稱/), {
      target: { value: "測試農產" },
    });
    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送出申請" }));

    expect(await screen.findByRole("link", { name: "返回首頁" })).toHaveAttribute(
      "href",
      `${LANDING_URL}/`,
    );
    // 送出走的是上面的假 supabase,不是正式資料庫
    expect(supabase.from).toHaveBeenCalledWith("supplier_applications");
  });
});

describe("admin build (VITE_PORTAL=admin)", () => {
  // IS_ADMIN_BUILD 是模組載入時算好的常數,所以要設好環境變數後重新載入頁面
  const loadAdmin = async (load: () => Promise<{ default: ComponentType }>) => {
    vi.stubEnv("VITE_PORTAL", "admin");
    vi.resetModules();
    const { default: Page } = await load();
    const { LanguageProvider: Provider } = await import("@/contexts/LanguageContext");
    return { Page, Provider };
  };

  const expectNoLandingLink = () => {
    expect(screen.queryByRole("link", { name: "回首頁" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "回到 iFoodmap 食材地圖首頁" }),
    ).toBeNull();
    expect(screen.getByRole("img", { name: "iFoodmap" }).closest("a")).toBeNull();
    for (const link of screen.queryAllByRole("link")) {
      expect(link.getAttribute("href") ?? "").not.toContain(LANDING_URL);
    }
  };

  it("LoginPortal shows no way to the landing site", async () => {
    const { Page, Provider } = await loadAdmin(() => import("./LoginPortal"));
    renderPage(Page, "zh", Provider);

    await screen.findByRole("heading", { name: "iFoodmap 平台營運後台" });
    expectNoLandingLink();
    // 語言切換與「回餐廳／供應商入口」照舊
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "← 回餐廳／供應商入口" }),
    ).toBeInTheDocument();
  });

  it("ResetPasswordPage (also served on the admin site) shows no way to the landing site", async () => {
    const { Page, Provider } = await loadAdmin(() => import("./ResetPasswordPage"));
    renderPage(Page, "zh", Provider);

    await screen.findByRole("heading", { name: "忘記密碼" });
    expectNoLandingLink();
  });
});
