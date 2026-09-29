import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 產品站正式網域 2026-09-29 起是 app.ifoodmap.ai;舊網址 dish-to-supply.vercel.app 整站 308 過去。
// 🔴 根目錄 vercel.json 是「兩個」Vercel 專案共用的(dish-to-supply 與 ifoodmap-admin 都從 repo 根目錄部署),
// 所以轉址一定要用 host 條件限定在舊網址本身 —— 條件寫寬了,管理員站或 preview 部署也會整站被轉走。
// 寫法仿 landing/tests/public-domain.test.cjs(形象站同一天做過同一件事)。
const OFFICIAL = "https://app.ifoodmap.ai";
// Vercel 自動配給 dish-to-supply 專案的網址。換網域之後它唯一的用途是這裡的轉址來源。
const OLD_HOST = "dish-to-supply.vercel.app";

interface Condition {
  type: string;
  key?: string;
  value?: unknown;
}
interface Redirect {
  source: string;
  destination: string;
  has?: Condition[];
  [field: string]: unknown;
}
interface VercelConfig {
  redirects?: Redirect[];
  rewrites?: { source: string; destination: string }[];
}

const ROOT = resolve(__dirname, "../..");
const config: VercelConfig = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const hostRedirects = (config.redirects ?? []).filter((r) => (r.has ?? []).some((c) => c.type === "host"));

/** 規則的 host 條件(Vercel 把字串值當正規表示式) */
const hostPattern = (r: Redirect): string => {
  const cond = (r.has ?? []).find((c) => c.type === "host");
  if (typeof cond?.value !== "string") throw new Error(`${r.source} 的 host 條件請用字串(正規表示式)`);
  return cond.value;
};

// 「片段搜尋」與「整串比對」兩種解讀都驗,兩種都要成立。
const readings = (pattern: string) => [new RegExp(pattern), new RegExp(`^(?:${pattern})$`)];

describe("vercel.json:舊產品站網址整站 308 到 app.ifoodmap.ai", () => {
  it("依 host 轉址的規則剛好兩條(站根一條、其餘路徑一條),整條釘死", () => {
    expect(hostRedirects).toHaveLength(2);
    // 整條釘死:多一個欄位(statusCode、missing…)或少一個都要紅。
    //   permanent: true → Vercel 回 308(保留 method 與 body;搜尋引擎視為永久搬家)。
    //   /:path* → /:path*:整段路徑原樣帶過去;query 不寫在 destination,Vercel 會自己接到 Location 後面。
    // 🔴 站根 / 要自己一條:Vercel 的 /:path* 不比對空路徑(形象站 2026-09-29 上線實測,只寫 /:path* 時舊網址首頁照樣 200)。
    expect(hostRedirects[0]).toStrictEqual({
      source: "/",
      has: [{ type: "host", value: "^dish-to-supply\\.vercel\\.app$" }],
      destination: `${OFFICIAL}/`,
      permanent: true,
    });
    expect(hostRedirects[1]).toStrictEqual({
      source: "/:path*",
      has: [{ type: "host", value: "^dish-to-supply\\.vercel\\.app$" }],
      destination: `${OFFICIAL}/:path*`,
      permanent: true,
    });
    for (const r of hostRedirects) expect(r.destination).not.toMatch(/[?#]/);
  });

  it("host 條件剛好等於舊網址:正式網域、管理員站、preview 部署都不會被轉走,目的地也不會再被轉(防無限轉址)", () => {
    const mustNotMatch = [
      "app.ifoodmap.ai",
      "ifoodmap.ai",
      "ifoodmap-admin.vercel.app",
      "ifoodmap-admin-orcin.vercel.app",
      "dish-to-supply-git-main-example.vercel.app", // 分支 preview
      "dish-to-supply-a1b2c3-example.vercel.app", // 單次部署網址
      "dish-to-supplyXvercelXapp", // 點號沒跳脫就會配到任何字元
      `x${OLD_HOST}`,
      `${OLD_HOST}.example.test`,
    ];
    expect(hostRedirects.length).toBeGreaterThan(0);
    for (const rule of hostRedirects) {
      for (const re of readings(hostPattern(rule))) {
        expect(re.test(OLD_HOST), `${rule.source}: ${re} 應該比對到 ${OLD_HOST}`).toBe(true);
        for (const host of mustNotMatch) {
          expect(re.test(host), `${rule.source}: ${re} 不該比對到 ${host}`).toBe(false);
        }
        const destinationHost = new URL(rule.destination.replace("/:path*", "/")).host;
        expect(re.test(destinationHost), `${rule.source}: 目的地 ${destinationHost} 又符合條件,會無限轉址`).toBe(false);
      }
    }
  });

  it("任何一條轉到正式網域的規則都必須限定來源 host,而且不能比對到正式網域本身", () => {
    // 正式網域跟舊網址掛在同一個 Vercel 專案上:沒有 host 條件的話,app.ifoodmap.ai 上的請求也會被轉,無限迴圈。
    const officialHost = new URL(OFFICIAL).host;
    for (const r of config.redirects ?? []) {
      // 站內相對路徑的轉址(/old → /new)不在這條的範圍
      if (!/^https?:\/\//.test(r.destination) || new URL(r.destination.replace("/:path*", "/")).host !== officialHost) continue;
      expect((r.has ?? []).some((c) => c.type === "host"), `${r.source} → ${r.destination} 沒有 host 條件`).toBe(true);
      for (const re of readings(hostPattern(r))) {
        expect(re.test(officialHost), `${r.source} 的 host 條件 ${re} 會比對到 ${officialHost}`).toBe(false);
      }
    }
  });

  it("SPA 的 rewrites 仍在(所有路徑回 index.html,前端路由才接得到)", () => {
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });
});
