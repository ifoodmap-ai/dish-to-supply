import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LANDING_URL } from "@/lib/site";
import { createMemoryStorage } from "@/test/memory-storage";
import PublicHeader from "./PublicHeader";

// portal.ts 會連帶載入 supabase client;頁首用不到,換成空物件免得建立真的連線
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const renderHeader = (lang: "zh" | "en", ui: ReactElement = <PublicHeader />) => {
  localStorage.setItem("ifm_lang", lang);
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

beforeEach(() => {
  // 語言存在 localStorage(ifm_lang);見 memory-storage.ts 為什麼要換掉
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PublicHeader", () => {
  it("links the logo and 回首頁 to the Chinese landing home in the same tab", () => {
    renderHeader("zh");

    const logoLink = screen.getByRole("link", { name: "回到 iFoodmap 食材地圖首頁" });
    const backLink = screen.getByRole("link", { name: "回首頁" });

    for (const link of [logoLink, backLink]) {
      expect(link).toHaveAttribute("href", `${LANDING_URL}/`);
      expect(link).not.toHaveAttribute("target");
    }
    expect(within(logoLink).getByRole("img", { name: "iFoodmap" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("switches both labels and the destination to English", () => {
    renderHeader("en");

    expect(
      screen.getByRole("link", { name: "Back to the iFoodmap homepage" }),
    ).toHaveAttribute("href", `${LANDING_URL}/en`);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      `${LANDING_URL}/en`,
    );
  });

  it("keeps a 44px touch target and a visible focus ring on both links", () => {
    renderHeader("zh");

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("min-h-11", "focus-visible:ring-2");
    }
  });

  it("puts extra actions before the back link", () => {
    renderHeader("zh", <PublicHeader actions={<button type="button">English</button>} />);

    const action = screen.getByRole("button", { name: "English" });
    const backLink = screen.getByRole("link", { name: "回首頁" });
    expect(
      action.compareDocumentPosition(backLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("admin build (VITE_PORTAL=admin): plain logo, no link to the landing site", async () => {
    vi.stubEnv("VITE_PORTAL", "admin");
    vi.resetModules();
    const { default: AdminHeader } = await import("./PublicHeader");
    const { LanguageProvider: Provider } = await import("@/contexts/LanguageContext");

    render(
      <Provider>
        <AdminHeader actions={<button type="button">English</button>} />
      </Provider>,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("img", { name: "iFoodmap" }).closest("a")).toBeNull();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  });
});
