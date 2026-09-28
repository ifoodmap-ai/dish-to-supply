/**
 * robots.txt / sitemap.xml / llms.txt（SPEC.md §5 / §6 / §8）
 * ---------------------------------------------------------------------------
 * 三個檔都從 routing.js 的路由表 + publicBaseUrl 產生，沒有任何手維護的清單 ——
 * 新增路由只要改 routing.js，這三個檔下一次 build 就跟著對。
 *
 * 由 scripts/prerender.mjs 匯入（build 時一起產），也可以單獨跑：
 *   node scripts/seo-files.mjs            印出三個檔的內容，不寫檔
 */

/* ────────────────────────────── robots.txt ────────────────────────────── */

/**
 * SPEC §5：策略是「全開」，最大化被 AI 引擎引用的機會。
 *
 * 🔴 每個具名群組都自帶完整規則 —— Google 只套用「最相符的那一組」，
 *    寫了 `User-agent: GPTBot` 那組，GPTBot 就完全不看 `User-agent: *`。
 * 🔴 不要加 Crawl-delay（Google 不支援、RFC 9309 沒有這個欄位）。
 * 🔴 不要憑空加 Disallow —— RFC 9309：列出路徑等於公開那些路徑。
 * 🔴 不要寫 `LLMs-txt:` 之類的自創指令（沒有任何 crawler 會讀）。
 */
const ROBOT_GROUPS = [
  ['預設：全部允許', ['*']],
  ['傳統搜尋引擎', ['Googlebot', 'Googlebot-Image', 'bingbot']],
  ['Google 生成式 AI（訓練 + Gemini grounding）', ['Google-Extended']],
  ['OpenAI / ChatGPT', ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot']],
  ['Anthropic / Claude', ['Claude-SearchBot', 'Claude-User', 'ClaudeBot']],
  ['Perplexity', ['PerplexityBot', 'Perplexity-User']],
  ['Apple（Siri / Spotlight）', ['Applebot', 'Applebot-Extended']],
  ['Amazon / Alexa', ['Amzn-SearchBot', 'Amzn-User', 'Amazonbot']],
  ['Meta', ['meta-externalagent']],
  ['開放資料集', ['CCBot']],
];

export function buildRobotsTxt({ publicBaseUrl, updated }) {
  const lines = [
    '# robots.txt — iFoodmap 食材地圖',
    '# 由 scripts/prerender.mjs 產生，不要手改（改 scripts/seo-files.mjs）。',
    '# 策略：最大化搜尋引擎與 AI 引擎的收錄與引用。',
    `# 更新日：${updated}`,
    '# ⚠️ Google 對特定 user-agent 只套用「最相符的那一組」，不會回頭讀 User-agent: *，',
    '#    因此每個具名群組都必須自帶完整規則。',
    '',
  ];
  for (const [label, agents] of ROBOT_GROUPS) {
    lines.push(`# ---------- ${label} ----------`);
    for (const a of agents) {
      lines.push(`User-agent: ${a}`);
      lines.push('Allow: /');
      lines.push('');
    }
  }
  lines.push('# ---------- Sitemap（ping 端點已廢止，這是官方僅存兩種提交方式之一）----------');
  lines.push(`Sitemap: ${publicBaseUrl}/sitemap.xml`);
  lines.push('');
  return lines.join('\n');
}

/* ────────────────────────────── sitemap.xml ────────────────────────────── */

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 🔴 SPEC §6-3：**禁止用 build 時間戳自動塞全站 lastmod。**
 *    Google 逐字：「if your page changed 7 years ago, but you're telling us in the
 *    lastmod element that it changed yesterday, eventually we're not going to
 *    believe you anymore」。
 *    - 文章頁 → 用 news.js 的 date（文章實際發佈日）
 *    - 靜態頁 → 預設**整個省略**（SPEC：沒把握就省略）。真的要填就寫進
 *      STATIC_LASTMOD，而且要是「該頁最後一次實質改版日」，手動維護。
 */
export const STATIC_LASTMOD = {
  // 例： home: '2026-09-23',
};

/**
 * SPEC §6-2：只放 <loc> 與（誠實的）<lastmod>。
 *   ❌ changefreq / priority —— Google 官方逐字「doesn't use ... at all」
 *   ❌ xhtml:link hreflang —— SPEC §3-2 已選「HTML <head>」那一種做法，
 *      三種方式同時做「there's no benefit in Search」，只會多一份會不同步的資料。
 *      （要開的話傳 withHreflang: true，見 PLAN.md 對這條的說明。）
 */
export function buildSitemapXml({ routes, publicBaseUrl, lastmodFor, withHreflang = false, alternatesFor }) {
  const seen = new Set();
  const entries = [];
  for (const r of routes) {
    const loc = publicBaseUrl + r.path;
    if (seen.has(loc)) continue;
    seen.add(loc);
    entries.push({ route: r, loc, lastmod: lastmodFor(r) || null });
  }

  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  out.push(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' +
    (withHreflang ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '') + '>'
  );
  for (const e of entries) {
    const bits = [`<loc>${xmlEscape(e.loc)}</loc>`];
    if (e.lastmod) bits.push(`<lastmod>${xmlEscape(e.lastmod)}</lastmod>`);
    if (withHreflang) {
      const alt = alternatesFor(e.route);
      bits.push(`<xhtml:link rel="alternate" hreflang="zh-Hant" href="${xmlEscape(alt.zh)}"/>`);
      bits.push(`<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(alt.en)}"/>`);
      bits.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(alt.xDefault)}"/>`);
    }
    out.push('  <url>' + bits.join('') + '</url>');
  }
  out.push('</urlset>');
  out.push('');
  return out.join('\n');
}

/* ─────────────────────────────── llms.txt ─────────────────────────────── */

/**
 * SPEC §8：**這個做了幾乎沒用。** Ahrefs 量到 137,210 個網域裡 97% 的 llms.txt
 * 在觀察月份零請求；Google 官方明說 Google Search 不使用它、「will neither harm
 * nor help」。做它的唯一理由是成本低、零風險，而且 coding agent 真的會讀。
 *
 * 所以：從路由表 + i18n 的 meta.pages 自動產生（零維護），不做 llms-full.txt，
 * 不為它建 pipeline，也不要在回報裡把它講成有效果。
 */
export function buildLlmsTxt({ publicBaseUrl, pages, dictFor, pageToPath, tagline, contact }) {
  const lines = [];
  lines.push('# iFoodmap 食材地圖');
  lines.push('');
  lines.push('> ' + tagline);
  lines.push('');
  lines.push('聯絡：' + contact);
  lines.push('');
  lines.push('## 主要頁面');
  const zh = dictFor('zh');
  for (const page of pages) {
    const m = zh.meta?.pages?.[page];
    if (!m) continue;
    const name = String(m.title).split(/[｜|]/)[0].trim();
    lines.push(`- [${name}](${publicBaseUrl}${pageToPath(page, 'zh', null)})：${m.description}`);
  }
  lines.push('');
  lines.push('## English');
  const en = dictFor('en');
  for (const page of pages) {
    const m = en.meta?.pages?.[page];
    if (!m) continue;
    const name = String(m.title).split(/[|｜]/)[0].trim();
    lines.push(`- [${name}](${publicBaseUrl}${pageToPath(page, 'en', null)}): ${m.description}`);
  }
  lines.push('');
  return lines.join('\n');
}

export const LLMS_TAGLINE =
  '台灣的 B2B 食材採購媒合平台，串接餐廳、團膳、學校與團購主的食材需求，' +
  '與全台食材供應商、產地、加工廠、批發商。提供需求媒合、報價比較、訂單與出貨管理。';
export const LLMS_CONTACT = '02-7704-5539｜ifoodmaptw@gmail.com';
