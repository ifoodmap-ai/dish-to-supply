/**
 * 每條路由的 <head> 規格（SPEC.md §3）
 * ---------------------------------------------------------------------------
 * 這支只負責「算出每頁的 head 應該長怎樣」，不碰 DOM、不碰檔案，好單獨測。
 * 真正動 DOM 的是 buildHeadNormalizeScript() 回傳的那段字串 —— 它在無頭 Chrome
 * 的頁面裡跑，跑完才取 outerHTML。
 *
 * 為什麼是「正規化」而不是「從頭產生」：
 *   這站的 <helmet> 在瀏覽器渲染時就會被框架搬進 <head>，index.html 的 syncSeo()
 *   與 routing.js 的 syncMetadata() 也已經把 title / description / canonical /
 *   og:url / og:locale / hreflang / html lang 逐頁算好了。所以渲染完成當下，
 *   <head> 其實**已經是這一頁自己的 head**。這支要做的是補上程式沒做、且 SPEC
 *   有要求的那幾項，並砍掉 SPEC 判定該砍的：
 *     ＋ og:image:width / og:image:height / og:image:alt   （SPEC §3-5，缺了第一
 *        個分享連結的人很可能看不到圖）
 *     ＋ og:locale:alternate                               （SPEC §3-1）
 *     － twitter:title / twitter:description / twitter:image（SPEC §3-5，X 會自動
 *        fallback 到 og:*，兩邊各寫一份只是兩倍不同步風險）
 *     ✎ 中文文章頁的 description（SPEC §3-4；news.js 的 zh 文章 17 篇全都沒有
 *        excerpt，runtime 會退回「最新消息」那句共用文案 → 18 頁同一句）
 *     ✎ 所有絕對網址改由 publicBaseUrl 算出（SPEC §0-1）
 */

/* ───────────────────────── SPEC §3-4 文章頁 description ───────────────────────── */

/** 全形等效字數：中日韓字 + 全形標點算 1，拉丁字元算 0.5（SPEC §3-4 的換算式）。 */
export function fullWidthEquivalent(text) {
  let n = 0;
  for (const ch of String(text)) {
    n += /[⺀-鿿豈-﫿︰-｠￠-￦]/.test(ch) ? 1 : 0.5;
  }
  return Math.round(n);
}

/** 文章正文攤平成一段純文字（blocks 只有 p 與 ul 兩種）。 */
export function articleBodyText(article) {
  const out = [];
  for (const b of article?.blocks || []) {
    if (b.type === 'p' && b.text) out.push(String(b.text));
    else if (b.type === 'ul' && Array.isArray(b.items)) out.push(b.items.map(String).join('；'));
  }
  return out.join('\n');
}

/**
 * 從內文自動截一段摘要（SPEC §3-4 的長度規則）。
 *   zh  正文前 70–80 個全形字，**切在句號**
 *   en  first 150–160 characters, cut at sentence end
 * 切不到句子邊界時退而求其次切在逗號／頓號，再不行就硬切並補「…」——
 * 寧可短一點，也不要吐出半句話。
 *
 * 🔴 這支被**兩個地方**呼叫，是同一份實作：
 *   1. `scripts/build-news.mjs`：產 `news.js` 時把算出來的字寫進 zh 的 `excerpt`
 *      欄位（跟封面尺寸那批一樣，之後重跑會自動帶）。這是**正式的產生點** ——
 *      寫進資料之後，runtime 的 `syncSeo()`（`found.excerpt || page.description`）
 *      在 SPA 換頁時也會拿到對的描述，不只是預渲染的靜態 head 對。
 *   2. `scripts/prerender.mjs`：烤靜態 head 時再算一次當安全網。`news.js` 的
 *      excerpt 一旦補上，這裡就會直接用那個值（見 articleDescription()），
 *      兩邊不會打架。
 *
 * @param {Array} blocks  news.js 的 blocks（{type:'p',text} / {type:'ul',items} / {type:'img'}）
 * @param {'zh'|'en'} lang
 */
export function autoExcerpt(blocks, lang) {
  const body = articleBodyText({ blocks }).replace(/\s+/g, ' ').trim();
  if (!body) return '';
  if (lang === 'en') return cutAt(body, 120, 160, /[.!?](?=\s|$)/g, /[,;](?=\s)/g);
  // 中文：全形等效 70–80 字 ≈ 字元數也差不多（正文幾乎全是中文）
  return cutAt(body, 55, 80, /[。！？]/g, /[，、；]/g);
}

/**
 * 這一頁的 description。**有 excerpt 就用 excerpt** —— 業主寫的（或
 * `build-news.mjs` 算好寫進去的）永遠優先，這裡只負責在沒有時補上。
 * 英文版 17 篇本來就都有 excerpt，所以英文永遠走 excerpt 這條。
 */
export function articleDescription(article, lang) {
  const excerpt = (article?.excerpt || '').trim();
  if (excerpt) return excerpt;
  return autoExcerpt(article?.blocks || [], lang);
}

function cutAt(text, min, max, hardRe, softRe) {
  if (text.length <= max) return text;
  const window = text.slice(0, max + 1);
  const lastOf = (re) => {
    let at = -1, m;
    re.lastIndex = 0;
    while ((m = re.exec(window))) at = m.index + m[0].length;
    return at;
  };
  const hard = lastOf(hardRe);
  if (hard >= min) return text.slice(0, hard).trim();
  const soft = lastOf(softRe);
  if (soft >= min) return text.slice(0, soft).replace(/[，、；,;]\s*$/, '').trim() + '…';
  return text.slice(0, max).trim() + '…';
}

/* ─────────────────────────────── og:image ─────────────────────────────── */

/**
 * og:image 的 alt 照 ogp.me 要求描述「圖裡有什麼」。
 * ⚠️ og-image.png 是中文版（logo + 中文標語）。SPEC §3-5 要求英文版另做
 * og-image-en.png；還沒有的話英文頁只能沿用中文圖，alt 也就照實寫。
 */
export const OG_IMAGE_ALT = {
  zh: 'iFoodmap 食材地圖品牌圖：AI 驅動的餐飲供應鏈媒合平台',
  en: 'iFoodmap brand card: AI-powered B2B ingredient sourcing for restaurants and suppliers',
};

export const OG_LOCALE = { zh: 'zh_TW', en: 'en_US' };

/* ─────────────────────── 在頁面裡跑的那段正規化腳本 ─────────────────────── */

/**
 * @param {object} cfg
 * @param {string} cfg.canonical      這一頁的 canonical（絕對網址，來自 publicBaseUrl）
 * @param {string} cfg.ogImage        絕對網址
 * @param {string} cfg.ogImageAlt
 * @param {string} cfg.ogLocale       zh_TW / en_US
 * @param {string} cfg.ogLocaleAlt    另一個語系的 og:locale
 * @param {string} cfg.ogType         website / article
 * @param {{zh:string,en:string,xDefault:string}} cfg.alternates  hreflang 的三條 href
 * @param {string} cfg.hreflangZh     zh 那條的 hreflang 值（維持現況 zh-Hant）
 * @param {string|null} cfg.description  非 null 就覆寫 description / og:description
 */
export function buildHeadNormalizeScript(cfg) {
  const C = JSON.stringify(cfg);
  return `(() => {
  const C = ${C};
  const head = document.head;
  const notes = [];

  const q = (sel) => head.querySelector(sel);
  const qa = (sel) => [...head.querySelectorAll(sel)];

  // ① SPEC §3-5：twitter:title / description / image 刪掉（X 會自動 fallback 到 og:*）
  for (const sel of ['meta[name="twitter:title"]','meta[name="twitter:description"]','meta[name="twitter:image"]',
                     'meta[property="twitter:title"]','meta[property="twitter:description"]','meta[property="twitter:image"]']) {
    for (const el of qa(sel)) { el.remove(); notes.push('removed ' + sel); }
  }

  // ② 絕對網址一律從 publicBaseUrl 算出來（SPEC §0-1 / §3-3）
  const setAttr = (sel, attr, value) => {
    const el = q(sel);
    if (el) { if (el.getAttribute(attr) !== value) notes.push('rewrote ' + sel); el.setAttribute(attr, value); }
    return el;
  };
  setAttr('link[rel="canonical"]', 'href', C.canonical);
  setAttr('meta[property="og:url"]', 'content', C.canonical);
  setAttr('meta[property="og:image"]', 'content', C.ogImage);
  setAttr('link[rel="alternate"][hreflang="' + C.hreflangZh + '"]', 'href', C.alternates.zh);
  setAttr('link[rel="alternate"][hreflang="en"]', 'href', C.alternates.en);
  setAttr('link[rel="alternate"][hreflang="x-default"]', 'href', C.alternates.xDefault);
  setAttr('meta[property="og:locale"]', 'content', C.ogLocale);
  setAttr('meta[property="og:type"]', 'content', C.ogType);

  // ③ 補上 SPEC §3-1 / §3-5 要求但程式沒產的幾個 og 標籤。
  //    插在 og:image 後面，讓同一組 og:image* 待在一起（Meta 的 crawler 依出現順序
  //    把 width/height/alt 配給前一個 og:image）。
  const anchor = q('meta[property="og:image"]') || q('link[rel="canonical"]') || head.lastElementChild;
  let after = anchor;
  const upsert = (property, content) => {
    let el = q('meta[property="' + property + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      after.parentNode.insertBefore(el, after.nextSibling);
      notes.push('added ' + property);
    }
    el.setAttribute('content', content);
    after = el;
  };
  upsert('og:image:width', '1200');
  upsert('og:image:height', '630');
  upsert('og:image:alt', C.ogImageAlt);
  upsert('og:locale:alternate', C.ogLocaleAlt);

  // ④ description：中文文章頁 runtime 會退回「最新消息」那句共用文案（zh 的 17 篇
  //    文章全都沒有 excerpt），這裡照 SPEC §3-4 換成文章自己的摘要。
  if (C.description) {
    for (const sel of ['meta[name="description"]', 'meta[property="og:description"]']) {
      const el = q(sel);
      if (el) { el.setAttribute('content', C.description); notes.push('desc ' + sel); }
    }
  }

  return notes;
})()`;
}

/* ───────────────────── 產出檢查用：head 必備標籤清單 ───────────────────── */

/** verifyOutput() 會逐條檢查這些標籤存在且在 <head> 裡。 */
export const REQUIRED_HEAD_TAGS = [
  { name: 'title', re: /<title>[^<]+<\/title>/i },
  { name: 'meta description', re: /<meta\s+name="description"\s+content="[^"]+"/i },
  { name: 'canonical', re: /<link\s+rel="canonical"\s+href="[^"]+"/i },
  { name: 'og:title', re: /<meta\s+property="og:title"\s+content="[^"]+"/i },
  { name: 'og:description', re: /<meta\s+property="og:description"\s+content="[^"]+"/i },
  { name: 'og:url', re: /<meta\s+property="og:url"\s+content="[^"]+"/i },
  { name: 'og:image', re: /<meta\s+property="og:image"\s+content="[^"]+"/i },
  { name: 'og:image:width', re: /<meta\s+property="og:image:width"\s+content="1200"/i },
  { name: 'og:image:height', re: /<meta\s+property="og:image:height"\s+content="630"/i },
  { name: 'og:image:alt', re: /<meta\s+property="og:image:alt"\s+content="[^"]+"/i },
  { name: 'og:locale', re: /<meta\s+property="og:locale"\s+content="(zh_TW|en_US)"/i },
  { name: 'og:locale:alternate', re: /<meta\s+property="og:locale:alternate"\s+content="(zh_TW|en_US)"/i },
  { name: 'og:site_name', re: /<meta\s+property="og:site_name"\s+content="[^"]+"/i },
  { name: 'og:type', re: /<meta\s+property="og:type"\s+content="[^"]+"/i },
  { name: 'twitter:card', re: /<meta\s+name="twitter:card"\s+content="summary_large_image"/i },
];

/** SPEC §3-5 / §3-7：出現就是錯。 */
export const FORBIDDEN_HEAD_TAGS = [
  { name: 'twitter:title（應 fallback 到 og:title）', re: /twitter:title/i },
  { name: 'twitter:description', re: /twitter:description/i },
  { name: 'twitter:image', re: /twitter:image/i },
  { name: 'noindex', re: /content="[^"]*\bnoindex\b/i },
  { name: 'nosnippet', re: /\bnosnippet\b/i },
  { name: 'max-snippet:0', re: /max-snippet:0/i },
];
