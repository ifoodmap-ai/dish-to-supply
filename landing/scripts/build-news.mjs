// 從抓下來的文章資料產生 news.js(UMD,node 與瀏覽器都能用)。
// 用法:node scripts/build-news.mjs <articles.json> <articles.en.json> [out=news.js]
import fs from 'node:fs';
import path from 'node:path';

const [zhPath, enPath, outPath = 'news.js'] = process.argv.slice(2);
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const enById = new Map(en.map((a) => [a.id, a]));

// slug 由英文標題產生 —— 兩個語系共用同一個 slug,/news/x 與 /en/news/x 才會是同一篇,
// hreflang 也才指得對。中文標題做不出可讀的 slug。
const STOP = new Set(['a','an','the','of','to','in','for','and','or','on','with','how','what','is','are','your','you','from','at','by']);
function slugify(title, id) {
  const words = String(title).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w));
  const base = (kept.length >= 3 ? kept : words).slice(0, 7).join('-').slice(0, 60).replace(/-+$/, '');
  return base || `article-${id}`;
}

// 舊站有一篇內文是空的(id=18「果汁製備新選擇：冷凍水果包」,原始碼的 .ck-area 就是空的)。
// 點進去只會看到標題,對讀者沒有價值,所以不搬進列表。資料本身沒有丟,要救回來把這行拿掉即可。
const skipped = zh.filter((a) => !(a.blocks || []).length);
if (skipped.length) {
  console.log(`略過 ${skipped.length} 篇沒有內文的文章:` + skipped.map((a) => `#${a.id} ${a.title}`).join(', '));
}

const seen = new Map();
const articles = zh.filter((a) => (a.blocks || []).length).map((a) => {
  const e = enById.get(a.id);
  if (!e) throw new Error(`英文版缺少 id=${a.id}`);
  let slug = slugify(e.title, a.id);
  if (seen.has(slug)) { const n = seen.get(slug) + 1; seen.set(slug, n); slug = `${slug}-${n}`; }
  else seen.set(slug, 1);
  const cover = a.coverImage ? `/assets/news/${a.coverImage.replace(/\.[^.]+$/, '')}.jpg` : null;
  const body = (blocks) => blocks.map((b) => {
    const out = { type: b.type };
    if (b.type === 'ul') out.items = b.items || [];
    else if (b.type === 'img') { out.src = `/assets/news/${String(b.src).replace(/\.[^.]+$/, '')}.jpg`; out.alt = b.alt || ''; }
    else out.text = b.text || '';
    if (b.links && b.links.length) out.links = b.links.map((l) => ({ text: l.text, href: l.href }));
    return out;
  });
  return {
    id: a.id, slug, date: a.date, cover,
    zh: { title: a.title, excerpt: a.excerpt || '', category: a.category, blocks: body(a.blocks || []) },
    en: { title: e.title, excerpt: e.excerpt || '', category: e.category, blocks: body(e.blocks || []) },
    editorialNote: e.editorialNote || a.editorialNote || null,
  };
}).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id)); // 新到舊

const module_ = `(function (root, factory) {
  var news = factory();
  if (typeof module === 'object' && module.exports) module.exports = news;
  if (root) root.IfmNews = news;
})(typeof window !== 'undefined' ? window : null, function () {
  /* ==== 由 scripts/build-news.mjs 從舊站 ifoodmap.com.tw/news 擷取後產生,不要手改 ====
     每篇兩個語系共用同一個 slug(由英文標題產生),所以 /news/x 與 /en/news/x 是同一篇,
     hreflang 才指得對。日期新到舊排序。 */
  var ARTICLES = ${JSON.stringify(articles, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n')};

  function pick(article, lang) {
    var body = article[lang === 'en' ? 'en' : 'zh'];
    return {
      id: article.id, slug: article.slug, date: article.date, cover: article.cover,
      title: body.title, excerpt: body.excerpt, category: body.category, blocks: body.blocks,
    };
  }

  return {
    all: function (lang) { return ARTICLES.map(function (a) { return pick(a, lang); }); },
    bySlug: function (slug, lang) {
      for (var i = 0; i < ARTICLES.length; i++) if (ARTICLES[i].slug === slug) return pick(ARTICLES[i], lang);
      return null;
    },
    latest: function (lang, n) { return ARTICLES.slice(0, n || 3).map(function (a) { return pick(a, lang); }); },
    count: ARTICLES.length,
    _raw: ARTICLES,
  };
});
`;
fs.writeFileSync(outPath, module_);
console.log(`OK ${outPath}:${articles.length} 篇`);
console.log(articles.slice(0, 5).map((a) => `  ${a.date}  ${a.slug}`).join('\n'));
