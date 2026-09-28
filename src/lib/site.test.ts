import { afterEach, describe, expect, it, vi } from "vitest";
import { LANDING_URL, landingHomeUrl } from "./site";

// 刻意不在測試裡寫死形象站網址:網址全站只能出現在 site.ts 一個地方。
// 預設值本身由實際點擊驗證(落地網址),這裡只驗規則。

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
