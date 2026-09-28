import { afterEach, describe, expect, it, vi } from "vitest";
import { LANDING_URL, landingHomeUrl } from "./site";

// 網址在程式裡只寫在 site.ts。這裡刻意再寫一次「沒設 VITE_LANDING_URL 時的預設值」:
// 它就是形象站的正式網域(業主的 ifoodmap.ai),被不小心改掉要有測試擋。
// 其餘規則(去結尾斜線、zh → /、en → /en、環境變數優先)不綁網域;頁首等元件測試也照舊用 LANDING_URL,
// 本機若設了 VITE_LANDING_URL 才不會誤報。

const loadFresh = async () => {
  vi.resetModules();
  return import("./site");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("landing site url", () => {
  it("defaults to an https origin with no trailing slash", () => {
    expect(LANDING_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  it("defaults to the landing site's official domain https://ifoodmap.ai (zh → /, en → /en)", async () => {
    vi.stubEnv("VITE_LANDING_URL", "");
    const site = await loadFresh();

    expect(site.LANDING_URL).toBe("https://ifoodmap.ai");
    expect(site.landingHomeUrl("zh")).toBe("https://ifoodmap.ai/");
    expect(site.landingHomeUrl("en")).toBe("https://ifoodmap.ai/en");
  });

  it("maps zh to the landing root and en to /en", () => {
    expect(landingHomeUrl("zh")).toBe(`${LANDING_URL}/`);
    expect(landingHomeUrl("en")).toBe(`${LANDING_URL}/en`);
  });

  it("uses VITE_LANDING_URL when set, trimming trailing slashes", async () => {
    vi.stubEnv("VITE_LANDING_URL", "https://www.example.test//");
    const site = await loadFresh();

    expect(site.LANDING_URL).toBe("https://www.example.test");
    expect(site.landingHomeUrl("zh")).toBe("https://www.example.test/");
    expect(site.landingHomeUrl("en")).toBe("https://www.example.test/en");
  });

  it("falls back to the built-in default when VITE_LANDING_URL is empty or blank", async () => {
    vi.stubEnv("VITE_LANDING_URL", "");
    const empty = (await loadFresh()).LANDING_URL;
    vi.stubEnv("VITE_LANDING_URL", "   ");
    const blank = (await loadFresh()).LANDING_URL;

    expect(empty).toMatch(/^https:\/\/[^/]+$/);
    expect(blank).toBe(empty);
  });
});
