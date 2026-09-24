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
 *     ＋ JSON-LD（SPEC §4，範圍照 PRIORITY P2-1～P2-3）—— 由 buildJsonLd() 算好、
 *        在靜態 <head> 裡輸出。不是 runtime 注入：不跑 JS 的爬蟲也要看得到。
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
 * 每個語系一張分享圖（SPEC §3-5）。prerender.mjs 會檢查檔案存在、而且真的是
 * OG_IMAGE_SIZE —— head 的 og:image:width / height 寫死 1200×630，圖不對就是在騙爬蟲。
 *
 *   og-image.png     logo + 「AI 驅動的餐飲供應鏈媒合平台」／「從菜單到食材，智慧媒合最適合的供應商」
 *   og-image-en.png  同一張版型（同底圖、同 logo、同字體黑體-繁 Medium 40/26pt、同色、同基線），
 *                    只把兩行字換成英文字典的**現有文案**：
 *                      標題 = en.meta.pages.home.title 去掉品牌前綴「iFoodmap | 」
 *                      副標 = en.home.heroSubB
 *                    上半部（底色＋logo）與中文版逐像素相同。
 *
 * og:image:alt 照 ogp.me 要求描述「圖裡有什麼」，所以它綁的是**圖**、不是字典 ——
 * 換圖就要一起改 OG_IMAGE_ALT。
 */
export const OG_IMAGE_PATH = { zh: '/og-image.png', en: '/og-image-en.png' };
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_ALT = {
  zh: 'iFoodmap 食材地圖品牌圖：AI 驅動的餐飲供應鏈媒合平台',
  en: 'iFoodmap brand card: B2B Ingredient Sourcing for Restaurants and Suppliers',
};

export const OG_LOCALE = { zh: 'zh_TW', en: 'en_US' };

/** PNG 的寬高在 IHDR（byte 16–23，big-endian）。給 og-image / logo 的尺寸自檢用，不為此裝影像套件。 */
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      buf.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw new Error('不是 PNG（讀不到 IHDR）');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

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
 * @param {string[]} [cfg.jsonLd]     已經 serializeJsonLd() 過的 JSON-LD，每個元素一個 <script>
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

  // ⑤ SPEC §4-1：JSON-LD 一律在 <head>、由 build 輸出。先清掉舊的（重跑不會疊兩份），
  //    再照順序補上。type="application/ld+json" 不會被執行，也不在交接 shim 的處理範圍。
  for (const el of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
    el.remove(); notes.push('removed stale ld+json');
  }
  for (const text of C.jsonLd || []) {
    const s = document.createElement('script');
    s.setAttribute('type', 'application/ld+json');
    s.textContent = text;
    head.appendChild(s);
    notes.push('added ld+json');
  }

  return notes;
})()`;
}

/* ─────────────────────────────── JSON-LD（SPEC §4） ─────────────────────────────── */

/**
 * 做它是為了 Google 的 rich results 與實體消歧（站名、知識面板、麵包屑），
 * **不是**為了被 AI 引用（SPEC §4-1b、PRIORITY §5 有準因果的反證）。
 *
 * 範圍照 PRIORITY.md 的 P2-1～P2-3：
 *   /、/en          Organization + WebSite（P2-1）＋ SPEC §4-3 範本裡同一個 @graph 的
 *                   WebPage 節點 —— 頁面語系（inLanguage）只能掛在它身上：Organization
 *                   不在 inLanguage 的適用型別裡，WebSite 的 @id 又是兩個語系共用的同一個實體。
 *   /news/:slug     Article（P2-3）＋ BreadcrumbList（P2-2）
 *   /legal/:slug    BreadcrumbList（P2-2）
 *   其他頁          不放（/news、/legal 是索引頁，麵包屑只會剩一層，而 Google 要求至少兩層）
 *
 * ❌ 不做（SPEC §4-6、PRIORITY §5 查證過影響為 0 或為負）：FAQPage、QAPage、
 *    WebSite.potentialAction（SearchAction，2024-11 已全球下架）、Product（沒有價格，有政策風險）。
 *    auditJsonLd() 會擋，有人加回來 build 會失敗。
 */

/**
 * SPEC §0-3：業主已確認、而且每一頁頁尾都看得到的資料（Google 政策禁止標記頁面上看不到的內容）。
 * 名稱不在這裡 —— 用字典的 meta.siteName（zh「iFoodmap 食材地圖」、en「iFoodmap」），
 * 跟 og:site_name 同一個來源。
 */
export const ORGANIZATION = {
  email: 'ifoodmaptw@gmail.com',
  // SPEC §4-3 註 1：telephone 要含國碼與區碼（頁面上顯示的是 02-7704-5539）
  telephone: '+886-2-7704-5539',
  sameAs: [
    'https://www.facebook.com/iFoodmap',
    // SPEC §0-3／§4-3 註 5：sameAs 用去掉 ?oat_content=url 的版本（追蹤參數會讓同一個實體
    // 多出一個 URL 變體）。頁面上的 LINE 按鈕仍然用帶參數的完整連結，不受影響。
    'https://line.me/R/ti/p/@750yvxki',
  ],
  // 站上現有的 logo（192×56）。⚠️ 低於 Google Organization logo 的最小 112×112，
  // prerender 每次 build 都會提醒；要換成方形 logo 請業主提供，不要自己做一張。
  logoPath: '/logo.png',
};

/**
 * 🔴 SPEC §0-2：待業主確認的欄位，確認前**整欄不寫**（不是漏掉）。
 *    address 連 addressCountry / addressLocality 也不寫 —— 那是從同一筆未驗證的地址推出來的。
 *    auditJsonLd() 會擋：有人先填了未確認的值，build 直接失敗。
 */
export const PENDING_OWNER_FIELDS = ['legalName', 'taxID', 'address', 'foundingDate', 'numberOfEmployees'];
export const FORBIDDEN_JSONLD_TYPES = ['FAQPage', 'QAPage', 'Product', 'SearchAction'];
export const FORBIDDEN_JSONLD_KEYS = ['potentialAction'];

/** SPEC §4-7 規則 5：inLanguage 用 BCP 47。⚠️ 跟 hreflang 的代碼（zh-Hant）是兩回事，不要互套。 */
export const JSONLD_IN_LANGUAGE = { zh: 'zh-Hant-TW', en: 'en' };

const SCHEMA_CONTEXT = 'https://schema.org';

/** 這種頁面該有哪些 JSON-LD 型別（最外層節點，排序後）。prerender 的產出檢查與測試共用。 */
export function expectedJsonLdTypes(page, slug) {
  if (page === 'home') return ['Organization', 'WebPage', 'WebSite'];
  if (page === 'article') return ['Article', 'BreadcrumbList'];
  if (page === 'legal' && slug) return ['BreadcrumbList'];
  return [];
}

/**
 * 算出一頁的 JSON-LD。回傳陣列，每個元素輸出成一個 <script type="application/ld+json">。
 *
 * @id 規則（SPEC §4-7）：
 *   跨語系是同一個實體 → 共用 @id：Organization `<base>/#organization`、WebSite `<base>/#website`
 *   跨語系是不同頁面   → 用該語系自己的網址：WebPage `<canonical>`、Article `<canonical>#article`、
 *                        BreadcrumbList `<canonical>#breadcrumb`
 *
 * @param {object} o
 * @param {string} o.page            routing.js 的 page（home / article / legal / …）
 * @param {string} o.lang            zh / en
 * @param {string|null} o.slug
 * @param {string} o.publicBaseUrl   routing.js 的 publicBaseUrl（不帶結尾斜線）—— 全部網址的唯一來源
 * @param {string} o.canonical       這一頁的 canonical（絕對網址）
 * @param {object} o.dict            這個語系的 i18n 字典
 * @param {object} o.otherDict       另一個語系的字典（alternateName 用另一個語系的站名）
 * @param {object|null} o.article    news.js 的文章（文章頁才需要）
 * @param {object|null} o.legalDoc   legal.js 的文件（/legal/:slug 才需要）
 * @param {(page: string) => string} o.urlFor  同語系某個索引頁的絕對網址（麵包屑的上一層）
 * @param {{url: string, width: number, height: number}} o.logo
 * @returns {object[]}
 */
export function buildJsonLd(o) {
  const { page, lang, slug, publicBaseUrl, canonical, dict, otherDict, article, legalDoc, urlFor, logo } = o;
  const root = publicBaseUrl + '/';
  const orgId = root + '#organization';
  const siteId = root + '#website';
  const inLanguage = JSONLD_IN_LANGUAGE[lang];
  if (!inLanguage) throw new Error(`JSON-LD：沒有 ${lang} 的 inLanguage 代碼（JSONLD_IN_LANGUAGE）`);
  const siteName = dict?.meta?.siteName;
  if (!siteName) throw new Error(`JSON-LD：${lang} 字典沒有 meta.siteName`);
  // zh 頁：name「iFoodmap 食材地圖」、alternateName「iFoodmap」（= SPEC §4-3 範本）；en 頁反過來
  const altName = otherDict?.meta?.siteName;
  const alternate = altName && altName !== siteName ? { alternateName: altName } : {};

  if (page === 'home') {
    const home = dict.meta.pages?.home;
    if (!home?.title || !home?.description) throw new Error(`JSON-LD：${lang} 字典沒有 meta.pages.home`);
    return [{
      '@context': SCHEMA_CONTEXT,
      '@graph': [
        {
          '@type': 'Organization',
          '@id': orgId,
          name: siteName,
          ...alternate,
          url: root,
          logo: { '@type': 'ImageObject', url: logo.url, width: logo.width, height: logo.height },
          // 用首頁自己的 meta description（字典現有文案），不另外寫一段
          description: home.description,
          email: ORGANIZATION.email,
          telephone: ORGANIZATION.telephone,
          sameAs: [...ORGANIZATION.sameAs],
        },
        {
          '@type': 'WebSite',
          '@id': siteId,
          name: siteName,
          ...alternate,
          url: root,
          publisher: { '@id': orgId },
          // ❌ 刻意沒有 potentialAction（SPEC §4-3 註 3）
        },
        {
          '@type': 'WebPage',
          '@id': canonical,
          url: canonical,
          name: home.title,
          inLanguage,
          isPartOf: { '@id': siteId },
          about: { '@id': orgId },
        },
      ],
    }];
  }

  if (page === 'article') {
    if (!article?.title) throw new Error(`JSON-LD：${canonical} 找不到文章`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(article.date || ''))) {
      throw new Error(`JSON-LD：${canonical} 的發佈日不是 YYYY-MM-DD：${article.date}`);
    }
    return [
      {
        '@context': SCHEMA_CONTEXT,
        '@type': 'Article',
        '@id': canonical + '#article',
        headline: article.title,
        // SPEC §4-4：圖要代表文章內容、不要用 logo —— 所以沒有封面就整欄不寫
        ...(article.cover ? { image: [publicBaseUrl + article.cover] } : {}),
        // news.js 只有日期（沒有時間），照實寫 YYYY-MM-DD。SPEC 建議的 +08:00 要有時間才掛得上去，
        // 補一個 T00:00:00 等於編一個不存在的發佈時刻。dateModified 同理：沒有資料就不寫。
        datePublished: article.date,
        author: { '@type': 'Organization', name: siteName, url: root },
        publisher: { '@id': orgId },
        inLanguage,
      },
      breadcrumbList(canonical, [[dict.nav?.news, urlFor('news')], [article.title]]),
    ];
  }

  if (page === 'legal' && slug) {
    if (!legalDoc?.title) throw new Error(`JSON-LD：${canonical} 找不到法律文件`);
    return [breadcrumbList(canonical, [[dict.legal?.indexTitle, urlFor('legal')], [legalDoc.title]])];
  }

  return [];
}

/**
 * SPEC §4-5：最後一項（這一頁自己）只放 name + position —— Google：「If item isn't included
 * for the last item, Google uses the URL of the containing page.」但它不能省：
 * BreadcrumbList 至少要兩個 ListItem。
 */
function breadcrumbList(pageUrl, trail) {
  for (const [name] of trail) if (!name) throw new Error(`JSON-LD：${pageUrl} 的麵包屑有一層沒有名稱`);
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    '@id': pageUrl + '#breadcrumb',
    itemListElement: trail.map(([name, item], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      ...(item ? { item } : {}),
    })),
  };
}

/**
 * 塞進 <script> 的 JSON：把 < > & 與 U+2028/2029 換成 \\uXXXX。
 * 標題裡萬一出現「</script>」也不會把 <head> 截斷；JSON 解析後字元完全一樣。
 */
export function serializeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

/** 會放網址的欄位（sameAs 刻意不在內 —— 它本來就指向站外）。 */
const URL_KEYS = new Set(['@id', 'url', 'item', 'image']);

/**
 * 檢查一頁的 JSON-LD（prerender 的產出驗證與測試共用）。回傳問題清單，空陣列＝通過。
 * @param {string[]} rawBlocks  每個 <script type="application/ld+json"> 的原文
 * @param {{publicBaseUrl: string, page: string, slug: string|null, lang: string}} ctx
 */
export function auditJsonLd(rawBlocks, { publicBaseUrl, page, slug, lang }) {
  const problems = [];
  const docs = [];
  rawBlocks.forEach((raw, i) => {
    try { docs.push(JSON.parse(raw)); } catch (err) { problems.push(`JSON-LD 第 ${i + 1} 塊不是合法 JSON：${err.message}`); }
  });

  const onBase = (u) => u === publicBaseUrl || u.startsWith(publicBaseUrl + '/');
  const walk = (value, visit) => {
    if (Array.isArray(value)) { for (const v of value) walk(v, visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [k, v] of Object.entries(value)) { visit(k, v); walk(v, visit); }
  };

  const nodes = [];
  for (const doc of docs) {
    if (doc?.['@context'] !== SCHEMA_CONTEXT) problems.push(`JSON-LD 的 @context 不是 ${SCHEMA_CONTEXT}`);
    nodes.push(...(Array.isArray(doc?.['@graph']) ? doc['@graph'] : [doc]));
    walk(doc, (k, v) => {
      if (k === '@type' && FORBIDDEN_JSONLD_TYPES.includes(v)) problems.push(`JSON-LD 出現不該做的 ${v}（SPEC §4-6）`);
      if (FORBIDDEN_JSONLD_KEYS.includes(k)) problems.push(`JSON-LD 出現不該做的 ${k}（SPEC §4-6）`);
      if (PENDING_OWNER_FIELDS.includes(k)) problems.push(`JSON-LD 出現待業主確認的 ${k}（SPEC §0-2：確認前整欄不寫）`);
      if (URL_KEYS.has(k)) {
        for (const u of [].concat(v)) {
          if (typeof u === 'string' && !onBase(u)) problems.push(`JSON-LD 的 ${k} 不是出自 publicBaseUrl：${u}`);
        }
      }
    });
  }

  const got = nodes.map((n) => n?.['@type']).sort();
  const want = expectedJsonLdTypes(page, slug).slice().sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    problems.push(`JSON-LD 型別是 [${got.join(', ')}]，應為 [${want.join(', ')}]`);
  }

  for (const n of nodes) {
    const type = n?.['@type'];
    if (type === 'Organization') {
      if ('inLanguage' in n) problems.push('Organization 不該有 inLanguage（不在適用型別，SPEC §4-7）');
      for (const key of ['@id', 'name', 'url', 'logo']) if (!n[key]) problems.push(`Organization 缺 ${key}`);
      if (n.logo && !onBase(n.logo.url || '')) problems.push('Organization.logo 不是出自 publicBaseUrl');
      if (n.telephone && !/^\+886-/.test(n.telephone)) problems.push('Organization.telephone 要含國碼（+886-…，SPEC §4-3 註 1）');
      for (const u of [].concat(n.sameAs || [])) if (/[?#]/.test(u)) problems.push(`sameAs 不要帶查詢參數：${u}（SPEC §4-3 註 5）`);
    }
    if (type === 'WebSite') {
      for (const key of ['@id', 'name', 'url']) if (!n[key]) problems.push(`WebSite 缺 ${key}`);
    }
    if (type === 'WebPage' || type === 'Article') {
      if (n.inLanguage !== JSONLD_IN_LANGUAGE[lang]) problems.push(`${type}.inLanguage 是 ${n.inLanguage}，應為 ${JSONLD_IN_LANGUAGE[lang]}`);
    }
    if (type === 'Article') {
      if (typeof n.headline !== 'string' || !n.headline.trim()) problems.push('Article 缺 headline');
      if (!Array.isArray(n.image) || !n.image.length) problems.push('Article 缺 image');
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(n.datePublished || ''))) problems.push('Article 缺 datePublished（ISO 8601）');
      if (!n.author?.name || !n.author?.url) problems.push('Article.author 要有 name 與 url');
    }
    if (type === 'BreadcrumbList') {
      const items = n.itemListElement || [];
      if (items.length < 2) problems.push(`BreadcrumbList 只有 ${items.length} 層（Google 要求至少 2 個 ListItem）`);
      items.forEach((it, i) => {
        if (it?.['@type'] !== 'ListItem' || it.position !== i + 1 || !it.name) problems.push(`BreadcrumbList 第 ${i + 1} 層格式不對`);
        if (i < items.length - 1 && !it.item) problems.push(`BreadcrumbList 第 ${i + 1} 層缺 item（只有最後一層可以省略）`);
      });
    }
  }
  return problems;
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
