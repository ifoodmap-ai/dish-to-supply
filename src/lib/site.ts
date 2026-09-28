// 形象站(對外行銷首頁)的網址 —— 全站唯一的出處,別的地方不要再寫死。
//
// 產品站的 `/` 是登入頁,所以對「還沒登入的訪客」來說,「首頁」指的是形象站首頁。
// 預設值是形象站的正式網域(業主的 ifoodmap.ai,2026-09-29 起);要臨時指到別的網址,
// 建置時設 VITE_LANDING_URL 就好(結尾斜線可有可無),不用改程式;要改預設值,也只改下面這一行。

import type { useLanguage } from "@/contexts/LanguageContext";

type SiteLanguage = ReturnType<typeof useLanguage>["language"];

const DEFAULT_LANDING_URL = "https://ifoodmap.ai";

/** 形象站網址,不含結尾斜線。 */
export const LANDING_URL = (
  (import.meta.env.VITE_LANDING_URL as string | undefined)?.trim() || DEFAULT_LANDING_URL
).replace(/\/+$/, "");

/**
 * 依目前語言回傳形象站首頁:中文 `/`、英文 `/en`。
 *
 * 英文刻意不帶結尾斜線:形象站 vercel.json 設了 trailingSlash:false,
 * `/en/` 會先 308 轉到 `/en`;它的 canonical 與 hreflang 也都是 `/en`。
 */
export const landingHomeUrl = (language: SiteLanguage): string =>
  `${LANDING_URL}${language === "en" ? "/en" : "/"}`;
