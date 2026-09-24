#!/usr/bin/env node
/**
 * 建置時預先渲染（prerender）
 * ---------------------------------------------------------------------------
 * 這站是「自製模板引擎（support.js）+ 瀏覽器端渲染」，伺服器吐出的 HTML 只有
 * <x-dc> 裡的 {{ }} 佔位符。Googlebot 會跑 JS 所以看得到內容，但大多數 AI 爬蟲
 * 不跑 JS —— 它們看到的是一頁佔位符。這支腳本在建置時用無頭 Chrome 把每一條路由
 * 跑過一次，把「渲染完成的 DOM」寫成實體 HTML 檔。
 *
 * 產出（寫在專案根目錄，由 Vercel 當成一般靜態檔直接服務）：
 *   dc-template.js          原本 <x-dc> 裡那份模板（全站共用一份，瀏覽器快取一次）
 *   restaurants.html        /restaurants
 *   en/restaurants.html     /en/restaurants
 *   news/<slug>.html        /news/<slug>
 *   robots.txt              SPEC §5（放行所有 AI 爬蟲 + Sitemap: 行）
 *   sitemap.xml             SPEC §6（從同一份路由表產生）
 *   llms.txt                SPEC §8（成本低、效果趨近於零，做一份放著）
 *   ...（路由清單從 routing.js 推導，不寫死）
 *
 * 每頁的 <head>（SPEC §3）：渲染完成當下 <head> 已經是這一頁自己的 head ——
 * 框架會把 <helmet> 搬進 <head>，index.html 的 syncSeo() 與 routing.js 的
 * syncMetadata() 已把 title / description / canonical / og:url / og:locale /
 * hreflang / html lang 逐頁算好。這支再跑一次 scripts/seo-head.mjs 的正規化，
 * 補齊 SPEC 要求但程式沒產的（og:image:width/height/alt、og:locale:alternate）、
 * 砍掉 SPEC 判定該砍的（twitter:title/description/image）、把中文文章頁那句
 * 共用 description 換成文章自己的摘要，並讓所有絕對網址都出自 publicBaseUrl。
 * 英文頁的 og:image 用 og-image-en.png（中文頁維持 og-image.png）。
 * JSON-LD（SPEC §4）也在這一步寫進靜態 <head>：首頁 Organization + WebSite、
 * 文章頁 Article + BreadcrumbList、/legal/:slug BreadcrumbList，其他頁不放
 * （內容由 seo-head.mjs 的 buildJsonLd() 決定，auditJsonLd() 逐頁驗）。
 *
 * 水合（hydration）設計 —— 刻意保守，目標是「support.js 看到的 DOM 跟改動前一樣」：
 *   1. 預渲染內容放在 <div id="ifm-prerendered">（不是 #dc-root，免得 index.html
 *      那支「等 #dc-root 出現」的 enhancer 抓到假的根）。
 *   2. <head> 有一行 JS：有 JS 就把 ifm-hydrate 加到 <html>，CSS 立刻把靜態層藏起
 *      來 —— 真人瀏覽器的畫面流程跟改動前完全相同（不會閃一下、不會有桌機版面在
 *      手機上先閃過）。沒 JS 的爬蟲不會跑到這行，看到的就是真內容。
 *   3. </body> 前的交接 shim 把 <x-dc>（內容來自 dc-template.js）插回原位、移除靜
 *      態層。這一步跑在 support.js 的 boot 之前是有保證的：boot 只會在
 *      DOMContentLoaded 之後、或 readyState !== 'loading' 時發生，而這兩件事都要
 *      等 body 解析完（也就是這支 inline script 跑完）才成立。
 *   4. 所以 support.js 照常 boot、照常掛 React：沒有二次渲染、沒有重複節點。
 *   5. dc-template.js 掛掉（404）時 shim 會拿掉 ifm-hydrate，退回「純靜態頁、連結
 *      走整頁跳轉」，不會白畫面。
 *
 * 用法：
 *   node scripts/prerender.mjs                 產生 dist/（專案的完整可部署複本）
 *   node scripts/prerender.mjs --out build     換個輸出目錄
 *   node scripts/prerender.mjs --in-place      直接寫進專案目錄（CI 專用，會覆蓋 index.html）
 *   node scripts/prerender.mjs --check         只比對、不寫檔（產出過期時 exit 1）
 *   CHROME_PATH=/usr/bin/google-chrome node scripts/prerender.mjs
 *
 * 產出「絕對不要 commit」—— 每次部署前重跑，就沒有「內容改了但忘記重跑」這種過期問題。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OG_IMAGE_ALT, OG_IMAGE_PATH, OG_IMAGE_SIZE, OG_LOCALE, ORGANIZATION,
  REQUIRED_HEAD_TAGS, FORBIDDEN_HEAD_TAGS,
  articleDescription, auditJsonLd, buildHeadNormalizeScript, buildJsonLd, expectedJsonLdTypes,
  fullWidthEquivalent, pngSize, serializeJsonLd,
} from './seo-head.mjs';
import {
  LLMS_CONTACT, LLMS_TAGLINE, STATIC_LASTMOD,
  buildLlmsTxt, buildRobotsTxt, buildSitemapXml,
} from './seo-files.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
/** 決定性自檢：重畫一次、比對 byte。預設只驗最容易出問題的首頁（有第三方 fetch），
 *  --stable-check 則是全部路由都驗一次（build 時間 ×2，上線前跑一次很值得）。 */
const STABLE_ALL = argv.includes('--stable-check');
/** SPEC §6-2 說 sitemap 不要放 xhtml:link（hreflang 已走 HTML <head>，三種方式
 *  同時做「there's no benefit in Search」）。留一個旗標是因為交辦單上寫「sitemap
 *  含 xhtml:link hreflang」—— 兩者衝突，預設照 SPEC，要改一個旗標就好。 */
const SITEMAP_HREFLANG = argv.includes('--sitemap-hreflang');
const VERBOSE = argv.includes('--verbose');
const IN_PLACE = argv.includes('--in-place');

function flagValue(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

const OUT = IN_PLACE ? ROOT : path.resolve(ROOT, flagValue('--out') || 'dist');
if (IN_PLACE && flagValue('--out')) throw new Error('--in-place 與 --out 不能同時用');

/** dist 模式要把整個站複製過去（不含這些）。api/ 不複製 —— Vercel 的 Serverless
 *  Functions 是從**專案根目錄**的 api/ 偵測，不在輸出目錄裡。 */
const COPY_EXCLUDE = new Set([
  '.git', '.github', '.vercel', '.worktrees', '.claude', '.vscode', 'node_modules',
  'dist', 'build', 'scripts', 'tests', 'docs', 'api', '.DS_Store',
  'standalone.html', 'supabase_schema.sql', 'DEPLOY.md', 'README.md',
  '.env', '.env.example', '.gitignore', 'package.json', 'package-lock.json',
]);

/* ─────────────────────────────── 常數 ─────────────────────────────── */

const TEMPLATE_FILE = 'dc-template.js';
const TEMPLATE_GLOBAL = '__IFM_DC_TEMPLATE';
const STATIC_LAYER_ID = 'ifm-prerendered';
const HYDRATE_CLASS = 'ifm-hydrate';
const MARKER = 'ifm-prerender'; // 部署後可以 curl <url> | grep 這個字串驗有沒有吃到預渲染檔

// 執行期才產生、絕對不可以烤進靜態檔的節點：index.html 的 inline script 每次載入
// 都會重建一份，烤進去會變成兩個 AI 助手浮球、兩條捲動進度條
const RUNTIME_ONLY_NODES = [
  '.ai-backdrop', '.ai-panel', '.ai-fab', '.ai-fab-tip', '.m-progress',
  // 🔴 首頁 hero 背景的世界地圖：index.html 的 drawMap() 用 d3 + topojson 去
  //    cdn.jsdelivr.net 抓 world-atlas 再畫成 SVG。它是**非同步的第三方網路請求**，
  //    序列化時抓不抓得到是賽跑 —— 實測同一份原始碼連跑兩次，en.html 一次 360 KB
  //    （有地圖）一次 182 KB（沒有），--check 就會亂報「產出過期」。
  //    這個容器是 aria-hidden="true" + pointer-events:none 的純裝飾，爬蟲不需要，
  //    而且靜態層在水合時整個會被交接 shim 刪掉、地圖由 drawMap() 重畫。
  //    所以：序列化前把它清掉 —— 產出變成決定性的，首頁也少 178 KB。
  'div[aria-hidden="true"][style*="pointer-events"] > svg',
];

// 捲動狀態 class：只反映「使用者捲到哪」，不是頁面內容
const SCROLL_STATE_CLASSES = ['m-scrolled', 'm-hide'];

/** 參數路由的 slug 從哪來。routing.js 新增動態路由（例如 /legal/:slug）而這裡沒補，
 *  discoverRoutes() 會主動報錯，不會默默少產檔。 */
const SLUG_SOURCES = {
  // routing.js 的 ARTICLE_RE 對應的 page 名稱 → 有哪些 slug
  article: () => require(path.join(ROOT, 'news.js')).all('zh').map((a) => a.slug),
  // /legal/:slug（條款頁）。這些函式是惰性的 —— routing.js 還沒宣告 page:'legal'
  // 之前完全不會被呼叫，所以 legal.js 還不存在也不會壞。
  legal: () => require(path.join(ROOT, 'legal.js')).all('zh').map((d) => d.slug),
};

/* ─────────────────────── 路由推導（不寫死路由清單） ─────────────────────── */

function readRoutingModule() {
  const modPath = path.join(ROOT, 'routing.js');
  delete require.cache[require.resolve(modPath)];
  return { api: require(modPath), src: fs.readFileSync(modPath, 'utf8') };
}

/** 取靜態頁清單。優先用 routing.js 自己匯出的 pathByPage（建議補上這個匯出），
 *  沒匯出就從原始碼還原 —— 但一定會逐條用 pathToPage()/pageToPath() 回推驗證，
 *  改名或改路徑會在這裡炸掉，不會默默漏頁。 */
function discoverStaticPaths(api, src) {
  let pathByPage = api.pathByPage;
  let via = 'routing.js 匯出的 pathByPage';

  if (!pathByPage) {
    const m = /var\s+pathByPage\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(src);
    if (!m) {
      throw new Error(
        'routing.js 找不到 pathByPage —— 路由清單推導不出來。\n' +
        '請在 routing.js 最後的 return 區塊補上 `pathByPage: pathByPage,`。'
      );
    }
    pathByPage = {};
    for (const line of m[1].split('\n')) {
      const kv = /^\s*([A-Za-z_$][\w$]*)\s*:\s*'([^']*)'/.exec(line);
      if (kv) pathByPage[kv[1]] = kv[2];
    }
    via = 'routing.js 原始碼（pathByPage 尚未匯出）';
  }

  const pages = Object.keys(pathByPage);
  if (!pages.length) throw new Error('pathByPage 是空的');

  for (const page of pages) {
    const p = pathByPage[page];
    const back = api.pathToPage(p);
    if (back !== page) throw new Error(`路由自檢失敗：pathToPage('${p}') = '${back}'，但 pathByPage 說是 '${page}'`);
    const fwd = api.pageToPath(page, api.DEFAULT_LANG, null);
    if (fwd !== p) throw new Error(`路由自檢失敗：pageToPath('${page}') = '${fwd}'，但 pathByPage 說是 '${p}'`);
  }
  return { pathByPage, pages, via };
}

/**
 * 🔴 SPEC §0-1：全站所有絕對網址只能有一個來源。
 * routing.js 的 `publicBaseUrl` 就是那個來源；建議在它最後的 return 區塊補上
 * `publicBaseUrl: publicBaseUrl,`，沒補就從原始碼還原（並在報表上提醒）。
 * 換網域＝改這一個值，robots.txt / sitemap.xml / llms.txt / 每頁的 canonical、
 * og:url、og:image、三條 hreflang 全部跟著換。
 */
function discoverBaseUrl(api, src) {
  let base = api.publicBaseUrl;
  let via = 'routing.js 匯出的 publicBaseUrl';
  if (!base) {
    const m = /var\s+publicBaseUrl\s*=\s*'([^']+)'/.exec(src);
    if (!m) throw new Error('routing.js 找不到 publicBaseUrl —— 絕對網址沒有來源，拒絕產出。');
    base = m[1];
    via = 'routing.js 原始碼（publicBaseUrl 尚未匯出）';
  }
  base = base.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(base)) throw new Error(`publicBaseUrl 不是乾淨的站根網址：${base}`);
  // 自檢：routing.js 自己算出來的 canonical 必須以它開頭
  const probe = api.canonicalUrlForPath('/about');
  if (!probe.startsWith(base)) throw new Error(`publicBaseUrl 自檢失敗：canonicalUrlForPath('/about') = ${probe}`);
  return { base, via };
}

/**
 * 中文那條 hreflang 的代碼。現況 routing.js 用 `zh-Hant`（Google 官方舉例之一，
 * 完全合法）。SPEC §3-2 建議改 `zh-TW`（也是官方舉例，地區鎖定更貼台灣），
 * ⚠️ 要改就 <link rel=alternate>、<html lang>、sitemap 三處同時改 —— 半套會互指
 * 不到。所以這裡**從 routing.js 讀**，不在這支寫死：改了那邊這裡自動跟上。
 */
function discoverHreflangZh(src) {
  const m = /\[\s*\[\s*'([^']+)'\s*,\s*alternates\.zh\s*\]/.exec(src);
  if (m) return m[1];
  const m2 = /var\s+htmlLangByLang\s*=\s*\{\s*zh\s*:\s*'([^']+)'/.exec(src);
  if (m2) return m2[1];
  throw new Error('routing.js 推導不出中文的 hreflang 代碼（syncMetadata 的 hreflangs 陣列）');
}

/** 語系清單：DEFAULT_LANG + PREFIXED_LANGS 的 key。 */
function discoverLangs(api, src) {
  const m = /var\s+PREFIXED_LANGS\s*=\s*\{([^}]*)\}/.exec(src);
  if (!m) throw new Error('routing.js 找不到 PREFIXED_LANGS');
  const prefixed = [];
  for (const part of m[1].split(',')) {
    const kv = /([A-Za-z_$][\w$]*)\s*:\s*'([^']*)'/.exec(part);
    if (kv) prefixed.push(kv[1]);
  }
  for (const lang of prefixed) {
    if (api.pageToPath('home', lang, null) === '/') throw new Error(`語系自檢失敗：pageToPath('home','${lang}') 沒有前綴`);
  }
  return [api.DEFAULT_LANG, ...prefixed];
}

/**
 * 哪些 page 吃 slug（＝有 /xxx/<slug> 這種參數形式）。
 *
 * 🔴 判準是**行為探測**，不是看它在不在 pathByPage。
 *    2026-09-24 真的踩到：條款頁的 `legal` **同時**是靜態頁（`/legal` 文件索引）
 *    **和**參數路由（`/legal/<slug>`）。舊版用「在 pathByPage 裡就當作純靜態」來
 *    判斷，於是 `/legal/terms`、`/legal/privacy` 與兩條英文版**被默默跳過**，
 *    而且因為沒有觸發任何錯誤，四條路由就這樣不見了 —— 正是這支腳本最該防的事。
 *
 *    改成問 routing.js 自己：給它一個 slug，吐出來的路徑會不會不一樣？
 *    會 → 這個 page 吃 slug。與 routing.js 怎麼實作無關。
 */
const SLUG_PROBE = '__ifm_slug_probe__';

function discoverSluggedPages(api, src, staticPages) {
  const candidates = new Set(staticPages);
  // 純參數路由（例如 article）不在 pathByPage 裡，從原始碼的 `page: 'xxx'` 撈出來
  for (const m of src.matchAll(/page\s*:\s*'([A-Za-z_$][\w$]*)'/g)) candidates.add(m[1]);

  const slugged = [];
  const staticOnly = [];
  for (const page of candidates) {
    const withSlug = api.pageToPath(page, api.DEFAULT_LANG, SLUG_PROBE);
    const without = api.pageToPath(page, api.DEFAULT_LANG, null);
    if (withSlug !== without && withSlug.endsWith('/' + SLUG_PROBE)) {
      slugged.push(page);
      // 吃 slug 的 page 若同時在 pathByPage 裡（例如 legal），它的無 slug 版本
      // 也是一條真路由（文件索引頁），兩種都要產。
    } else if (staticPages.includes(page)) {
      staticOnly.push(page);
    }
  }
  return { slugged, staticOnly };
}

function discoverRoutes() {
  const { api, src } = readRoutingModule();
  const { pages, via } = discoverStaticPaths(api, src);
  const langs = discoverLangs(api, src);
  const { slugged: dynamicPages } = discoverSluggedPages(api, src, pages);
  const { base: publicBaseUrl, via: baseVia } = discoverBaseUrl(api, src);
  const hreflangZh = discoverHreflangZh(src);

  for (const page of dynamicPages) {
    if (!SLUG_SOURCES[page]) {
      throw new Error(
        `routing.js 有吃 slug 的路由 page='${page}'（pageToPath('${page}', lang, slug) 會產出 /…/<slug>），\n` +
        `但 scripts/prerender.mjs 的 SLUG_SOURCES 沒有對應的 slug 來源。\n` +
        `請補上 ${page}: () => [...slug 陣列]，否則這些頁不會被預渲染。`
      );
    }
  }

  const routes = [];
  for (const lang of langs) {
    // pathByPage 裡的每一頁都有「無 slug」的那一條（legal 這種混合型也有：/legal 是文件索引）
    for (const page of pages) routes.push({ path: api.pageToPath(page, lang, null), lang, page, slug: null });
    for (const page of dynamicPages) {
      let slugs;
      try {
        slugs = SLUG_SOURCES[page]();
      } catch (err) {
        throw new Error(
          `動態路由 page='${page}' 的 slug 來源取不到：${err.message}\n` +
          `請確認 scripts/prerender.mjs 的 SLUG_SOURCES.${page} 指到正確的資料檔。`
        );
      }
      if (!Array.isArray(slugs) || !slugs.length) throw new Error(`動態路由 page='${page}' 的 slug 來源回傳空清單`);
      for (const slug of slugs) routes.push({ path: api.pageToPath(page, lang, slug), lang, page, slug });
    }
  }

  // 最後一道自檢：每條路由都要被 pathToRoute 解回同一組 (page, lang, slug)
  for (const r of routes) {
    const back = api.pathToRoute(r.path);
    if (back.page !== r.page || back.lang !== r.lang || (back.slug || null) !== r.slug) {
      throw new Error(`路由自檢失敗：${r.path} 解回 ${JSON.stringify(back)}，預期 ${JSON.stringify(r)}`);
    }
  }
  return { routes, langs, pages, dynamicPages, via, api, publicBaseUrl, baseVia, hreflangZh };
}

/* ─────────────────── 模板抽出（讓產出的 HTML 裡 {{ }} 歸零） ─────────────────── */

/** 跟 support.js 的 parseDcText() 同一種切法：取 <x-dc> 與最後一個 </x-dc> 之間的原文。 */
function sliceTemplate(html) {
  const open = /<x-dc(?:\s[^>]*)?>/.exec(html);
  if (!open) throw new Error('index.html 找不到 <x-dc>（這份 index.html 可能已經是預渲染產出了）');
  const close = html.lastIndexOf('</x-dc>');
  if (close === -1 || close < open.index) throw new Error('index.html 的 </x-dc> 位置不對');
  return html.slice(open.index + open[0].length, close);
}

/**
 * 🔴 把 <helmet> 裡的 <meta> / <link> / <style> 從模板裡拿掉。
 *
 * 為什麼一定要做：框架的 helmet manager 在每次載入時會把 <helmet> 的子節點
 * **appendChild 到 document.head**，而它的去重表（mounted）每次載入都是空的。
 * 預渲染的 <head> 已經帶著這些標籤的渲染結果，水合時框架再塞一次 ——
 * 實測 /restaurants 會變成：
 *     canonical ×2（第二條是原始碼裡寫死的 .../ 首頁網址）
 *     description ×2、og:url ×2、og:title ×2、Google Fonts 樣式表 ×2
 * 兩條 canonical、其中一條指向首頁，正是 PRIORITY.md 警告「會把子頁與整個英文版
 * 合併進首頁」的那個情境 —— Googlebot 會跑 JS，所以它看得到這個。
 *
 * 拿掉之後：
 *   · 不跑 JS 的爬蟲 → 看到 <head> 裡那一份（正確、逐頁不同）
 *   · 跑 JS 的瀏覽器 / Googlebot → 一樣只有那一份；SPA 換頁時由 index.html 的
 *     syncSeo() 與 routing.js 的 syncMetadata() 更新它（兩者都用
 *     document.querySelector，抓到的就是 <head> 裡這一份）
 *   · Google Fonts 樣式表也不再被載兩次
 */
function stripHelmetHeadTags(template) {
  const open = /<helmet(?:\s[^>]*)?>/i.exec(template);
  if (!open) return { template, stripped: [] };
  const closeAt = template.toLowerCase().indexOf('</helmet>', open.index);
  if (closeAt === -1) throw new Error('模板裡的 <helmet> 沒有收尾');

  const before = template.slice(0, open.index + open[0].length);
  const inner = template.slice(open.index + open[0].length, closeAt);
  const after = template.slice(closeAt);

  const stripped = [];
  let out = inner.replace(/<(meta|link)\b[^>]*>/gi, (tag) => { stripped.push(tag); return ''; });
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (tag) => { stripped.push(tag); return ''; });
  return { template: before + out + after, stripped };
}

/** 被拿掉的每一個標籤，在渲染產出的 <head> 裡必須找得到對應的那一個。
 *  未來有人在 <helmet> 加了新標籤而框架沒把它搬進 head，這裡會炸，不會默默掉資料。 */
function verifyStrippedTagsSurvive(strippedTags, html) {
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  // 原始碼寫的是 `…&family=…`，序列化出來是 `…&amp;family=…` —— 比對前先還原，
  // 否則 Google Fonts 那條會被誤判成「不見了」。
  const unescape = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const head = unescape(headMatch ? headMatch[1] : '');
  const missing = [];
  let wantStyles = 0;
  for (const tag of strippedTags) {
    if (/^<style/i.test(tag)) { wantStyles++; continue; }
    const key =
      /\bname\s*=\s*["']([^"']+)["']/i.exec(tag) ||
      /\bproperty\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (key) {
      const attr = /\bname\s*=/i.test(tag) ? 'name' : 'property';
      // twitter:title/description/image 是 seo-head.mjs 刻意刪掉的，不算遺失
      if (/^twitter:(title|description|image)$/i.test(key[1])) continue;
      if (!new RegExp(`${attr}="${key[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(head)) {
        missing.push(`<meta ${attr}="${key[1]}">`);
      }
      continue;
    }
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (rel && /canonical/i.test(rel[1])) {
      if (!/rel="canonical"/i.test(head)) missing.push('<link rel="canonical">');
      continue;
    }
    if (href && !head.includes(unescape(href[1]))) missing.push(`<link href="${href[1]}">`);
  }
  const gotStyles = (head.match(/<style\b/gi) || []).length;
  if (wantStyles && gotStyles < wantStyles) missing.push(`<style> 少了 ${wantStyles - gotStyles} 份`);
  return missing;
}

function buildTemplateFile(template) {
  return (
    '/* 由 scripts/prerender.mjs 產生，不要手改。\n' +
    '   原本在 index.html 的 <x-dc> 模板搬到這裡：預渲染出來的 HTML 就不再含 {{ }} 佔位符，\n' +
    '   不跑 JS 的 AI 爬蟲看到的是真內容；瀏覽器載入時由頁尾的 shim 把 <x-dc> 插回去，\n' +
    '   support.js 照常 boot。全站共用同一份，瀏覽器只下載一次。 */\n' +
    `window.${TEMPLATE_GLOBAL} = ${JSON.stringify(template)};\n`
  );
}

/* ────────────────────────── 預渲染專用的本機伺服器 ────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

/**
 * 刻意不讀已經產生的 .html：每一條路由都直接回「原始的 index.html」，
 * 所以重跑 prerender 不會把上一輪的產出再烤一次（double-bake）。
 * dc-template.js 也從記憶體供應，不必先落地。
 */
function startPrerenderServer({ routes, indexHtml, templateJs }) {
  const routeSet = new Set(routes.map((r) => r.path));
  const server = http.createServer((req, res) => {
    const clean = (req.url || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (clean === '/' + TEMPLATE_FILE) {
      res.writeHead(200, { 'Content-Type': MIME['.js'] });
      return res.end(templateJs);
    }
    if (clean === '/' || routeSet.has(clean)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(indexHtml);
    }
    const abs = path.join(ROOT, path.normalize(clean).replace(/^(\.\.[/\\])+/, ''));
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { 'Content-Type': MIME['.txt'] });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ───────────────────────────── 無頭 Chrome（CDP） ───────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('找不到 Chrome。請設 CHROME_PATH=/path/to/chrome');
}

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifm-prerender-'));
  const proc = spawn(chromeBinary(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
    '--disk-cache-size=1', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { proc.kill(); } catch { /* 已經死了 */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 沒關係 */ }
  };
  process.once('exit', cleanup);

  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch { /* 還沒起來 */ }
    await sleep(200);
  }
  if (!target) { cleanup(); throw new Error('Chrome 沒起來'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { returnByValue: true, expression, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('頁面內 JS 例外：' + JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result?.result?.value;
  };
  return { send, evaluate, close: () => { try { ws.close(); } catch { /* ignore */ } cleanup(); } };
}

/** 每個 document 建立前注入：鎖語系、清 storage、關掉「只有瀏覽器才有的狀態」來源。 */
function bootstrapScript(lang) {
  const tags = lang === 'en' ? ['en-US', 'en'] : ['zh-TW', 'zh'];
  return `
    Object.defineProperty(navigator, 'languages', { get: () => ${JSON.stringify(tags)} });
    Object.defineProperty(navigator, 'language', { get: () => ${JSON.stringify(tags[0])} });
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    /* index.html 只有一處 setInterval：首頁標題輪播（2.6 秒換一個詞）。不關掉的話，
       烤出來的會是「剛好停在第幾個詞」這種瀏覽器狀態。 */
    window.setInterval = function () { return 0; };

    /* 🔴 無頭 Chrome 不保證會跑 requestAnimationFrame（畫面沒有真的在合成）。
       首頁統計數字是 React state countP 由 rAF 從 0 推到 1，rAF 不跑就永遠卡在 0
       —— 靜態檔會吐出「0+ 合作供應商」「0+ 累積媒合需求」，對不跑 JS 的 AI 爬蟲
       來說那是**錯的數字**，比沒有更糟（SPEC §7-3 要的是具體、可驗證的數字）。
       這裡把 rAF 換成「下一個 tick、而且時間戳直接跳到很久以後」：每個 rAF 動畫
       一幀就到終點狀態，而且與真實耗時無關 → 產出仍然是決定性的。
       上限 500 次是怕有人寫了無限 rAF 迴圈把 build 拖住。 */
    var __rafCalls = 0;
    window.requestAnimationFrame = function (cb) {
      if (++__rafCalls > 500) return 0;
      return setTimeout(function () { cb(performance.now() + 1e7); }, 0);
    };
    window.cancelAnimationFrame = function (id) { clearTimeout(id); };

    window.__IFM_PRERENDERING = true;
  `;
}

/** 渲染完成的判準（全部成立才算完成） */
const READY_PROBE = `(() => {
  const root = document.getElementById('dc-root');
  if (!root || !root.children.length) return { ready: false, why: 'dc-root 還沒有內容' };
  const text = document.body.innerText || '';
  if (text.length < 300) return { ready: false, why: '內文太短（' + text.length + '）' };
  const unresolved = (text.match(/\\{\\{[^}]*\\}\\}/g) || []).length;
  if (unresolved) return { ready: false, why: '還有 ' + unresolved + ' 個未解析綁定' };
  if (!document.title) return { ready: false, why: '沒有 title' };
  // 首頁統計數字要跑完（0 → 3,000+）。卡在 0 就是 rAF 沒跑完，再等。
  const stats = [...document.querySelectorAll('.mc-statnum')].map((e) => e.textContent.trim());
  if (stats.length && stats.some((t) => /^0\+?$/.test(t))) return { ready: false, why: '統計數字還停在 0（' + stats.join('/') + '）' };
  return { ready: true };
})()`;

/**
 * 抓取前的正規化 + 交接接線。整段在同一個同步區塊裡做完才讀 outerHTML ——
 * React 18 是非同步渲染、enhancer 的 MutationObserver 有 60ms debounce，
 * 同步做完就不會被它們插隊改掉。
 */
function buildSerializeScript(originalScriptSrcs) {
  const cfg = JSON.stringify({
    layerId: STATIC_LAYER_ID, hydrateClass: HYDRATE_CLASS, marker: MARKER,
    templateFile: TEMPLATE_FILE, templateGlobal: TEMPLATE_GLOBAL,
    runtimeOnly: RUNTIME_ONLY_NODES, scrollState: SCROLL_STATE_CLASSES,
    originalScriptSrcs,
  });
  return `(() => {
  const C = ${cfg};
  const doc = document;
  const removed = [];

  // ⓪ 🔴 support.js 在 boot 時會自己 appendChild 一份 React / ReactDOM 的 CDN
  //    <script> 到 <head>。那幾個節點會被 outerHTML 一起吐出來，載入時 support.js
  //    又會再塞一次 —— **React 被載入兩份**，第二份覆蓋 window.React，hook 的
  //    dispatcher 變 null，整頁炸在「Cannot read properties of null (reading
  //    'useState')」。所以：head 裡任何不在原始 index.html 的 <script src> 一律拿掉。
  const allowed = new Set(C.originalScriptSrcs);
  for (const s of doc.querySelectorAll('head script[src]')) {
    const rel = new URL(s.src, location.href).pathname;
    if (!allowed.has(s.getAttribute('src')) && !allowed.has(rel) && !allowed.has(s.src)) {
      removed.push('head script ' + s.src);
      s.remove();
    }
  }

  // ① 執行期才產生的節點：AI 助手浮球/面板、捲動進度條 —— 烤進去會變兩份
  for (const sel of C.runtimeOnly) {
    for (const el of doc.querySelectorAll(sel)) { removed.push(sel); el.remove(); }
  }

  // ② 只有瀏覽器才有的狀態
  doc.documentElement.classList.remove('ifm-js');       // JS 才加的 class
  doc.body.style.removeProperty('overflow');            // AI 面板開啟時會鎖捲動
  for (const cls of C.scrollState) {
    for (const el of doc.querySelectorAll('.' + cls)) el.classList.remove(cls);
  }
  for (const el of doc.querySelectorAll('[tabindex="-1"]')) el.removeAttribute('tabindex'); // focus 管理留下的

  const dcRoot = doc.getElementById('dc-root');
  if (!dcRoot) throw new Error('找不到 #dc-root');
  dcRoot.removeAttribute('inert');
  dcRoot.removeAttribute('aria-hidden');

  // ③ #dc-root → #ifm-prerendered：靜態層不能叫 dc-root，否則 index.html 那支
  //    「等 #dc-root 出現」的 enhancer 會抓到它當成真的根，等真的 React 根掛上來
  //    之後它的 MutationObserver 就綁在被移除的節點上，再也不會觸發。
  dcRoot.id = C.layerId;
  dcRoot.setAttribute('data-generated-by', C.marker);

  // ④ <head>：有 JS 就把靜態層藏起來（真人瀏覽器的畫面流程與改動前完全相同），
  //    再掛上模板檔。兩者都插在 support.js 之前。
  const supportScript = doc.querySelector('script[src$="support.js"]');
  const anchor = supportScript || doc.head.lastElementChild;
  const style = doc.createElement('style');
  style.id = C.marker + '-style';
  style.textContent = 'html.' + C.hydrateClass + ' #' + C.layerId + '{display:none!important}';
  const flag = doc.createElement('script');
  flag.textContent = 'document.documentElement.classList.add(' + JSON.stringify(C.hydrateClass) + ')';
  const tpl = doc.createElement('script');
  tpl.src = '/' + C.templateFile;
  anchor.parentNode.insertBefore(style, anchor);
  anchor.parentNode.insertBefore(flag, anchor);
  anchor.parentNode.insertBefore(tpl, anchor);

  // ⑤ </body> 前的交接 shim：把 <x-dc> 插回原位、移除靜態層。
  //    它一定跑在 support.js 的 boot 之前 —— boot 只會在 DOMContentLoaded 之後、
  //    或 readyState !== 'loading' 時發生，而這兩件事都要等 body 解析完才成立。
  const shim = doc.createElement('script');
  shim.id = C.marker + '-handoff';
  shim.textContent = [
    '(function(){',
    '  var layer = document.getElementById(' + JSON.stringify(C.layerId) + ');',
    '  var tpl = window.' + C.templateGlobal + ';',
    '  if (typeof tpl !== "string" || !layer) {',
    '    /* 模板檔掛了 → 退回「純靜態頁」（連結走整頁跳轉），不要白畫面 */',
    '    document.documentElement.classList.remove(' + JSON.stringify(C.hydrateClass) + ');',
    '    return;',
    '  }',
    '  var dc = document.createElement("x-dc");',
    '  dc.innerHTML = tpl;',
    '  layer.parentNode.insertBefore(dc, layer);',
    '  layer.parentNode.removeChild(layer);',
    '})();',
  ].join('\\n');
  doc.body.appendChild(shim);

  return { removed, html: '<!DOCTYPE html>\\n' + doc.documentElement.outerHTML + '\\n' };
})()`;
}

/* ───────────────────────────── 產出檔案路徑 ───────────────────────────── */

/** Vercel `cleanUrls: true`：/restaurants 由 restaurants.html 供應（扁平檔名）。
 *  首頁維持 index.html（本來就有），其餘一律 <path>.html。 */
function outputFileFor(routePath) {
  if (routePath === '/') return 'index.html';
  return routePath.replace(/^\//, '') + '.html';
}

/* ─────────────────────────────── 產出驗證 ─────────────────────────────── */

const stripScripts = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const stripStyles = (html) => html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

/** <script> 有沒有被渲染結果改壞：比對「來源 index.html」與「產出」的 script 清單與順序。 */
function scriptFingerprint(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    out.push(src ? `src:${src[1]}` : `inline:${type ? type[1] : 'js'}:${m[2].length}:${djb2(m[2])}`);
  }
  return out;
}

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** 抓 <head> 裡所有 <script src> 的 src 原值。 */
function headScriptSrcs(html) {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const scope = head ? head[1] : html;
  return [...scope.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
}

const JSONLD_RE = /<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

function verifyOutput({ route, page, slug, lang, html, sourceScripts, originalScriptSrcs, publicBaseUrl }) {
  const problems = [];
  const visible = stripStyles(stripScripts(html));
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const head = headMatch ? headMatch[1] : '';

  // ── SPEC §4：JSON-LD 必須在靜態 <head>、每塊都是合法 JSON、型別剛好是這種頁面該有的 ──
  const jsonLdBlocks = [...head.matchAll(JSONLD_RE)].map((m) => m[1]);
  const jsonLdTotal = [...html.matchAll(JSONLD_RE)].length;
  if (jsonLdTotal !== jsonLdBlocks.length) problems.push('JSON-LD 跑到 <head> 之外（SPEC §4-1：一律放 <head>）');
  problems.push(...auditJsonLd(jsonLdBlocks, { publicBaseUrl, page, slug, lang }));

  // 🔴 head 裡不可以多出原始 index.html 沒有的 <script src>：
  //    support.js 注入的 React CDN 如果被烤進去，載入時會變成兩份 React。
  const allowed = new Set([...originalScriptSrcs, '/' + TEMPLATE_FILE]);
  const extra = headScriptSrcs(html).filter((s) => !allowed.has(s));
  if (extra.length) problems.push('head 多出 <script src>：' + extra.join(', '));

  // dc-script 的註解裡有幾處說明用的 {{ }}（不是綁定、在 <script> 裡，任何文字抽取器
  // 都讀不到）。<script> 之外一個都不該有。
  const bracesVisible = (visible.match(/\{\{/g) || []).length;
  const bracesTotal = (html.match(/\{\{/g) || []).length;
  if (bracesVisible) problems.push(`<script>/<style> 之外還有 ${bracesVisible} 個 {{`);

  if (!html.includes(`id="${STATIC_LAYER_ID}"`)) problems.push('沒有靜態層');
  if (!html.includes(`/${TEMPLATE_FILE}`)) problems.push('沒掛 dc-template.js');
  if (!html.includes(`${MARKER}-handoff`)) problems.push('沒有交接 shim');
  if (/<x-dc[\s>]/.test(stripScripts(html))) problems.push('還留著 <x-dc>（模板沒抽乾淨）');
  for (const sel of RUNTIME_ONLY_NODES) {
    // class 選擇器才能用字串比對驗；其他形態的選擇器各自有專屬檢查（見下面的世界地圖）
    if (!/^\.[\w-]+$/.test(sel)) continue;
    if (new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b`).test(html)) problems.push(`烤到執行期節點 ${sel}`);
  }
  // 首頁 hero 的世界地圖（第三方非同步請求畫出來的 SVG）不可以被烤進去 ——
  // 烤進去產出就不是決定性的。判準：aria-hidden 容器裡出現超長的 <path d>。
  if (/aria-hidden="true"[^>]*>\s*<svg[^>]*>[\s\S]{2000,}?<\/svg>/.test(html)) {
    problems.push('烤到 hero 世界地圖（非決定性的第三方 SVG）');
  }
  if (/<html[^>]*\bclass="[^"]*\bifm-js\b/.test(html)) problems.push('<html> 還帶著 ifm-js');

  // script 清單：產出必須包含來源的每一支、順序相同（只多出我們加的那幾支）
  const outScripts = scriptFingerprint(html);
  let cursor = 0;
  for (const want of sourceScripts) {
    const at = outScripts.indexOf(want, cursor);
    if (at === -1) { problems.push(`<script> 遺失或被改動：${want}`); break; }
    cursor = at + 1;
  }

  // ── SPEC §3：head 規格 ──────────────────────────────────────────
  for (const t of REQUIRED_HEAD_TAGS) if (!t.re.test(head)) problems.push(`<head> 缺 ${t.name}`);
  for (const t of FORBIDDEN_HEAD_TAGS) if (t.re.test(head)) problems.push(`<head> 出現不該有的 ${t.name}`);

  // 🔴 SPEC §3-0：canonical 只有在 <head> 裡才算數，而且每頁只能有一條。
  //    水合之後多冒出一條（框架把 <helmet> 再塞一次）曾經真的發生過，見
  //    stripHelmetHeadTags() 的註解。
  const canonCount = (html.match(/<link[^>]*rel="canonical"/gi) || []).length;
  if (canonCount !== 1) problems.push(`canonical 出現 ${canonCount} 次（必須剛好 1 次，且在 <head>）`);
  if (/<link[^>]*rel="canonical"/i.test(html.slice(html.indexOf('</head>')))) {
    problems.push('canonical 跑到 </head> 之外（Google 只接受 <head> 裡的）');
  }

  // 🔴 SPEC §0-1：SEO 用的絕對網址必須全部出自 publicBaseUrl。
  for (const m of head.matchAll(/(?:rel="canonical"[^>]*href|property="og:(?:url|image)"[^>]*content|rel="alternate"[^>]*href)="([^"]+)"/gi)) {
    if (!m[1].startsWith(publicBaseUrl + '/') && m[1] !== publicBaseUrl) {
      problems.push(`絕對網址不是出自 publicBaseUrl：${m[1]}`);
    }
  }

  const pick = (re) => (re.exec(html) || [])[1] || '';
  const title = pick(/<title>([\s\S]*?)<\/title>/i);
  const desc = pick(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const canonical = pick(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const htmlLang = pick(/<html\s+lang="([^"]*)"/i);
  if (!title) problems.push('沒有 title');
  if (!desc) problems.push('沒有 meta description');
  if (!canonical) problems.push('沒有 canonical');

  const hreflangs = [...head.matchAll(/rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/gi)].map((m) => [m[1], m[2]]);
  const ogTitle = pick(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
  const ogLocale = pick(/<meta\s+property="og:locale"\s+content="([^"]*)"/i);
  return {
    route, page, slug, bracesVisible, bracesTotal, title, desc, canonical, htmlLang, hreflangs, ogTitle, ogLocale,
    titleWidth: fullWidthEquivalent(title), descWidth: fullWidthEquivalent(desc),
    jsonLdBlocks: jsonLdBlocks.length,
    bytes: Buffer.byteLength(html), problems,
  };
}

/** dist 模式：把靜態站整份複製到輸出目錄（預渲染的 .html 之後再覆蓋上去）。 */
async function copyStaticTree(dest) {
  await fsp.rm(dest, { recursive: true, force: true });
  await fsp.mkdir(dest, { recursive: true });
  for (const name of await fsp.readdir(ROOT)) {
    if (COPY_EXCLUDE.has(name)) continue;
    await fsp.cp(path.join(ROOT, name), path.join(dest, name), { recursive: true });
  }
}

/* ─────────────────────────────── 主流程 ─────────────────────────────── */

async function main() {
  const t0 = Date.now();
  if (IN_PLACE && !CHECK_ONLY) {
    console.log('⚠️  --in-place：index.html 會被「預渲染後的首頁」覆蓋。');
    console.log('   這個模式是給 CI 的乾淨 checkout 用的，產出不要 commit。');
  }
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const template = sliceTemplate(indexHtml);
  // 模板裡的 <helmet> head 標籤要拿掉，否則水合時會被框架再塞一次（見函式註解）
  const { template: templateOut, stripped } = stripHelmetHeadTags(template);
  const templateJs = buildTemplateFile(templateOut);
  // 來源 script 清單不含 <x-dc> 模板裡的（模板整段被抽走了）
  const sourceScripts = scriptFingerprint(indexHtml.replace(template, ''));
  const originalScriptSrcs = headScriptSrcs(indexHtml);

  const { routes, langs, pages, dynamicPages, via, api, publicBaseUrl, baseVia, hreflangZh } = discoverRoutes();
  const i18n = require(path.join(ROOT, 'i18n.js'));
  const newsMod = require(path.join(ROOT, 'news.js'));
  const legalMod = require(path.join(ROOT, 'legal.js'));
  console.log(`路由來源：${via}`);
  console.log(`絕對網址來源：${baseVia} → ${publicBaseUrl}`);
  console.log(`語系 ${langs.join('/')}｜靜態頁 ${pages.length}｜動態頁 ${dynamicPages.join(',') || '（無）'}｜共 ${routes.length} 條路由`);
  console.log(`模板抽出：${(Buffer.byteLength(templateOut) / 1024).toFixed(0)} KB → ${TEMPLATE_FILE}（從 <helmet> 移出 ${stripped.length} 個 head 標籤）`);

  // og-image：每個語系一張（SPEC §3-5；英文頁用 og-image-en.png，中文頁維持 og-image.png）。
  // 🔴 找不到就直接失敗，不再默默退回中文圖 —— 英文頁的 og:image:alt 描述的是英文那張圖，
  //    退回中文圖就變成「中文圖配英文說明」。圖也必須真的是 1200×630：head 裡的
  //    og:image:width / height 寫的就是這兩個數字。
  //    （沒有列在 OG_IMAGE_PATH 的新語系一律用中文圖＋中文 alt，兩者仍然一致。）
  const ogImageFor = (lang) => OG_IMAGE_PATH[lang] || OG_IMAGE_PATH.zh;
  const ogAltFor = (lang) => (OG_IMAGE_PATH[lang] ? OG_IMAGE_ALT[lang] : OG_IMAGE_ALT.zh);
  for (const lang of langs) {
    const rel = ogImageFor(lang);
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) throw new Error(`找不到 ${rel}（${lang} 版的 og:image，SPEC §3-5）。這張圖要跟原始碼一起 commit。`);
    const { width, height } = pngSize(fs.readFileSync(abs));
    if (width !== OG_IMAGE_SIZE.width || height !== OG_IMAGE_SIZE.height) {
      throw new Error(`${rel} 是 ${width}×${height}，但 og:image:width/height 宣告的是 ${OG_IMAGE_SIZE.width}×${OG_IMAGE_SIZE.height}`);
    }
    if (!OG_IMAGE_ALT[lang] && OG_IMAGE_PATH[lang]) throw new Error(`${rel} 沒有對應的 OG_IMAGE_ALT.${lang}`);
  }
  console.log(`og:image：${langs.map((l) => `${l} → ${ogImageFor(l)}`).join('｜')}（皆為 ${OG_IMAGE_SIZE.width}×${OG_IMAGE_SIZE.height}）`);

  // JSON-LD 的 logo（SPEC §4-3）：站上現有的 logo.png，尺寸從檔案讀，不寫死。
  const logoAbs = path.join(ROOT, ORGANIZATION.logoPath);
  if (!fs.existsSync(logoAbs)) throw new Error(`找不到 ${ORGANIZATION.logoPath}（JSON-LD Organization.logo）`);
  const logo = { url: publicBaseUrl + ORGANIZATION.logoPath, ...pngSize(fs.readFileSync(logoAbs)) };
  if (logo.width < 112 || logo.height < 112) {
    console.log(`⚠️  ${ORGANIZATION.logoPath} 是 ${logo.width}×${logo.height}，低於 Google Organization logo 的最小 112×112 ——` +
      ' Google 可能不採用這張當 logo。要換成方形 logo 請業主提供（非阻擋條件）。');
  }

  const { server, port } = await startPrerenderServer({ routes, indexHtml, templateJs });
  const base = `http://127.0.0.1:${port}`;
  const chrome = await launchChrome();
  const serializeScript = buildSerializeScript(originalScriptSrcs);
  const results = [];
  const written = new Map(); // 相對路徑 → 內容

  try {
    await chrome.send('Page.enable');
    await chrome.send('Runtime.enable');
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    // 用 reduced-motion 跑：數字滾動動畫（會邊跑邊改 textContent）、進場動畫 class
    // 全部不啟動 —— 烤出來的是「靜止、完整」的畫面，不是動畫中途的某一格。
    await chrome.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    let lastLang = null;

    /** 載入一條路由、等渲染完成、正規化 head、回傳序列化後的 HTML。 */
    async function renderRoute(route) {
      if (route.lang !== lastLang) {
        await chrome.send('Emulation.setUserAgentOverride', {
          userAgent: '',
          acceptLanguage: route.lang === 'en' ? 'en-US,en' : 'zh-TW,zh',
        });
        await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: bootstrapScript(route.lang) });
        lastLang = route.lang;
      }

      await chrome.send('Page.navigate', { url: base + route.path });

      let ready = null;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        await sleep(150);
        try { ready = await chrome.evaluate(READY_PROBE); } catch { ready = null; }
        if (ready?.ready) break;
      }
      if (!ready?.ready) throw new Error(`${route.path} 渲染沒完成：${ready?.why || '逾時'}`);

      // 深層網址一律照網址渲染，不該被 applyPreferredLang 改掉
      const actual = await chrome.evaluate('location.pathname');
      if (route.path !== '/' && actual.replace(/\/+$/, '') !== route.path) {
        throw new Error(`${route.path} 被導去了 ${actual}`);
      }

      // ── SPEC §3：這一頁的 head 正規化（補 og:image:*、砍 twitter:*、
      //    中文文章頁換成自己的 description、絕對網址改由 publicBaseUrl 算）
      const other = route.lang === 'zh' ? 'en' : 'zh';
      const alt = api.alternateUrlsForPath(route.path);
      const canonical = publicBaseUrl + route.path;
      let description = null;
      let article = null;
      if (route.page === 'article') {
        article = newsMod.bySlug(route.slug, route.lang);
        if (!article) throw new Error(`${route.path} 找不到對應的文章（news.js）`);
        description = articleDescription(article, route.lang);
        if (!description) throw new Error(`${route.path} 算不出 description`);
      }
      let legalDoc = null;
      if (route.page === 'legal' && route.slug) {
        legalDoc = legalMod.bySlug(route.slug, route.lang);
        if (!legalDoc) throw new Error(`${route.path} 找不到對應的文件（legal.js）`);
      }
      // SPEC §4：這一頁的 JSON-LD（沒有的頁面回傳空陣列 → head 裡不會有任何 ld+json）
      const jsonLd = buildJsonLd({
        page: route.page, lang: route.lang, slug: route.slug, publicBaseUrl, canonical,
        dict: i18n.dict(route.lang), otherDict: i18n.dict(other),
        article, legalDoc, logo,
        urlFor: (page) => publicBaseUrl + api.pageToPath(page, route.lang, null),
      });
      await chrome.evaluate(buildHeadNormalizeScript({
        canonical,
        ogImage: publicBaseUrl + ogImageFor(route.lang),
        ogImageAlt: ogAltFor(route.lang),
        ogLocale: OG_LOCALE[route.lang] || OG_LOCALE.zh,
        ogLocaleAlt: OG_LOCALE[other] || OG_LOCALE.en,
        ogType: route.page === 'article' ? 'article' : 'website',
        alternates: alt,
        hreflangZh,
        description,
        jsonLd: jsonLd.map(serializeJsonLd),
      }));

      return await chrome.evaluate(serializeScript);
    }

    for (const route of routes) {
      const out = await renderRoute(route);
      const rel = outputFileFor(route.path);
      written.set(rel, out.html);
      const v = verifyOutput({
        route: route.path, page: route.page, slug: route.slug, lang: route.lang,
        html: out.html, sourceScripts, originalScriptSrcs, publicBaseUrl,
      });
      const lost = verifyStrippedTagsSurvive(stripped, out.html);
      if (lost.length) v.problems.push('從 <helmet> 移出的標籤在產出裡找不到：' + lost.join(', '));
      results.push(v);
      if (VERBOSE) console.log(`  ${route.path} → ${rel} (${(v.bytes / 1024).toFixed(0)} KB, 移除 ${out.removed.length} 個執行期節點)`);
    }
    /* ── 決定性自檢 ──────────────────────────────────────────────
       同一份原始碼跑兩次必須吐出一模一樣的 byte。不成立的話 `--check` 會在 CI
       亂報「產出過期」，更糟的是「這次部署有地圖、下次沒有」這種隨機差異。
       首頁有第三方 fetch（world-atlas），是最容易出問題的一條。 */
    const stableTargets = STABLE_ALL ? routes : routes.filter((r) => r.page === 'home');
    const unstable = [];
    for (const route of stableTargets) {
      const second = await renderRoute(route);
      if (second.html !== written.get(outputFileFor(route.path))) unstable.push(route.path);
    }
    if (unstable.length) {
      throw new Error(
        '產出不是決定性的（同一份原始碼跑兩次結果不同）：' + unstable.join(', ') + '\n' +
        '通常是頁面裡有非同步的第三方請求在賽跑，把那個節點加進 RUNTIME_ONLY_NODES。'
      );
    }
    console.log(`決定性自檢：${stableTargets.length} 條路由重畫後 byte 相同${STABLE_ALL ? '' : '（--stable-check 可驗全部）'}`);
  } finally {
    chrome.close();
    server.close();
  }

  written.set(TEMPLATE_FILE, templateJs);

  /* ── SPEC §5 / §6 / §8：三個站根檔，路由來源與上面同一份 ── */
  written.set('robots.txt', buildRobotsTxt({
    publicBaseUrl,
    updated: new Date().toISOString().slice(0, 10),
  }));
  written.set('sitemap.xml', buildSitemapXml({
    routes, publicBaseUrl, withHreflang: SITEMAP_HREFLANG,
    alternatesFor: (r) => api.alternateUrlsForPath(r.path),
    // 🔴 SPEC §6-3：lastmod 必須誠實。文章用 news.js 的發佈日；靜態頁預設省略
    //    （「沒把握的頁可以整個省略」），要填就填進 seo-files.mjs 的 STATIC_LASTMOD。
    lastmodFor: (r) => {
      if (r.page === 'article') return newsMod.bySlug(r.slug, r.lang)?.date || null;
      return STATIC_LASTMOD[r.page] || null;
    },
  }));
  written.set('llms.txt', buildLlmsTxt({
    publicBaseUrl, pages,
    dictFor: (lang) => i18n.dict(lang),
    pageToPath: (page, lang, slug) => api.pageToPath(page, lang, slug),
    tagline: LLMS_TAGLINE, contact: LLMS_CONTACT,
  }));

  /* 寫檔 / 過期檢查 */
  const stale = [];
  if (CHECK_ONLY) {
    for (const [rel, content] of written) {
      const abs = path.join(OUT, rel);
      const old = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (old !== content) stale.push(rel);
    }
  } else {
    if (!IN_PLACE) await copyStaticTree(OUT);
    for (const [rel, content] of written) {
      const abs = path.join(OUT, rel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, content, 'utf8');
    }
  }

  /* ── 跨路由檢查（單頁看不出來的那幾條 SPEC 硬規定）───────────── */
  const byRoute = new Map(results.map((r) => [r.route, r]));

  // SPEC §3-4 硬規定 1：每頁 title 必須不同。
  const byTitle = new Map();
  const byDesc = new Map();
  for (const r of results) {
    byTitle.set(r.title, [...(byTitle.get(r.title) || []), r.route]);
    byDesc.set(r.desc, [...(byDesc.get(r.desc) || []), r.route]);
  }
  const dupTitles = [...byTitle].filter(([, rs]) => rs.length > 1);
  const dupDescs = [...byDesc].filter(([, rs]) => rs.length > 1);
  for (const [t, rs] of dupTitles) {
    for (const route of rs) byRoute.get(route).problems.push(`<title> 與其他 ${rs.length - 1} 頁重複「${t.slice(0, 40)}…」`);
  }

  // SPEC §3-3：canonical 必須自我指涉（/en/about 指 /en/about，不是 /about）。
  // SPEC §3-2：三條 hreflang 必須含自己、雙向互指、而且每個語系版本那組完全相同。
  for (const route of routes) {
    const r = byRoute.get(route.path);
    if (!r) continue;
    const want = publicBaseUrl + route.path;
    if (r.canonical !== want) r.problems.push(`canonical 不是自我指涉：${r.canonical}（應為 ${want}）`);

    const set = Object.fromEntries(r.hreflangs);
    const alt = api.alternateUrlsForPath(route.path);
    for (const [code, href] of [[hreflangZh, alt.zh], ['en', alt.en], ['x-default', alt.xDefault]]) {
      if (set[code] !== href) r.problems.push(`hreflang ${code} = ${set[code] || '（缺）'}，應為 ${href}`);
    }
    if (!Object.values(set).includes(want)) r.problems.push('hreflang 沒有列出自己（self-referencing）');

    // 另一個語系那頁的三條 hreflang 必須一字不差相同
    const other = route.lang === 'zh' ? 'en' : 'zh';
    const otherPath = api.pageToPath(route.page, other, route.slug);
    const o = byRoute.get(otherPath);
    if (o && JSON.stringify(r.hreflangs) !== JSON.stringify(o.hreflangs)) {
      r.problems.push(`hreflang 那組與 ${otherPath} 不一致（Google：the set of links is identical for every version）`);
    }
  }

  /* 報表 */
  const bad = results.filter((r) => r.problems.length);

  console.log('\n' + '路徑'.padEnd(72) + '{{ lang     og:loc  標題全形  描述全形  title');
  for (const r of results) {
    console.log(
      (r.problems.length ? '❌ ' : '✅ ') + r.route.padEnd(69) +
      String(r.bracesVisible).padEnd(3) + (r.htmlLang || '?').padEnd(9) +
      (r.ogLocale || '?').padEnd(8) + String(r.titleWidth).padStart(6) + '   ' +
      String(r.descWidth).padStart(6) + '    ' + r.title.slice(0, 46)
    );
    for (const p of r.problems) console.log('     ↳ ' + p);
  }
  if (dupDescs.length) {
    console.log('\n⚠️  重複的 meta description（SPEC 沒把它列成硬門檻，但重複＝沒有差異化）：');
    for (const [d, rs] of dupDescs) console.log(`   ${rs.length} 頁共用「${d.slice(0, 50)}…」：${rs.slice(0, 4).join(' ')}${rs.length > 4 ? ' …' : ''}`);
  }
  // SPEC §3-4 的長度建議（不是硬門檻，超出只提醒）
  const longTitles = results.filter((r) => (r.htmlLang === 'en' ? r.title.length > 60 : r.titleWidth > 28));
  const shortDescs = results.filter((r) => (r.htmlLang === 'en' ? r.desc.length < 120 : r.descWidth < 50));
  if (longTitles.length) console.log(`\n⚠️  ${longTitles.length} 頁 title 超過 SPEC §3-4 的寬度建議：` + longTitles.slice(0, 5).map((r) => r.route).join(' '));
  if (shortDescs.length) console.log(`⚠️  ${shortDescs.length} 頁 description 低於 SPEC §3-4 的下限（zh 50 全形字 / en 120 字元）：` + shortDescs.slice(0, 6).map((r) => r.route).join(' '));

  // SPEC §4：JSON-LD 的分布（型別不對的頁面上面已經逐頁列成 ❌，這裡只是總覽）
  const ldSummary = new Map();
  for (const r of results) {
    const key = expectedJsonLdTypes(r.page, r.slug).join(' + ') || '不放';
    const e = ldSummary.get(key) || { routes: 0, blocks: 0 };
    e.routes += 1; e.blocks += r.jsonLdBlocks;
    ldSummary.set(key, e);
  }
  console.log('\nJSON-LD：' + [...ldSummary].map(([k, e]) => `${k} ${e.routes} 頁（${e.blocks} 個 <script>）`).join('｜'));

  console.log(`\n${results.length} 條路由｜${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (bad.length) { console.error(`❌ ${bad.length} 條有問題`); process.exit(1); }
  if (CHECK_ONLY) {
    if (stale.length) {
      console.error(`❌ 預渲染產出已過期（${stale.length} 個檔跟目前的原始碼不一致）：`);
      for (const s of stale.slice(0, 12)) console.error('   ' + s);
      if (stale.length > 12) console.error(`   …還有 ${stale.length - 12} 個`);
      console.error('   請跑 `npm run prerender` 後重新 commit。');
      process.exit(1);
    }
    console.log('✅ 預渲染產出與原始碼一致');
  } else {
    console.log(`✅ 已寫入 ${written.size} 個檔到 ${OUT}`);
  }
}

main().catch((err) => { console.error('\n❌ prerender 失敗：' + (err?.stack || err)); process.exit(1); });
