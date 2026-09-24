// 從抓下來的文章資料產生 news.js(UMD,node 與瀏覽器都能用)。
// 用法:node scripts/build-news.mjs <articles.json> <articles.en.json> [out=news.js]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 中文文章沒填 excerpt 時從內文開頭截。規則與 prerender.mjs 共用同一份實作,靜態 head 與 SPA 換頁時的
// syncSeo() 才會拿到一樣的描述(否則 Googlebot 水合後會被蓋回新聞列表那段共用文案)。
import { autoExcerpt } from './seo-head.mjs';

const [zhPath, enPath, outPath = 'news.js'] = process.argv.slice(2);

// 站台根目錄(scripts/ 的上一層),用來從 /assets/news/*.jpg 讀圖片實際尺寸
const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 讀 JPEG 的 SOF 標記拿長寬。0xC4(DHT)/0xC8(JPG)/0xCC(DAC) 長得像 SOF 但不是,要跳過。
function jpegSize(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(`不是 JPEG:${file}`);
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error(`找不到 SOF:${file}`);
}

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
  // 封面原本在樣板裡寫死 width=960 height=540,但 17 篇裡有 16 篇不是 16:9(最極端 1024×1024),
  // 宣告錯的長寬比會在圖載入的瞬間把整篇往下推 —— 等於 width/height 反過來製造 CLS。
  const coverSize = cover ? jpegSize(path.join(SITE_ROOT, cover)) : null;
  const body = (blocks) => blocks.map((b) => {
    const out = { type: b.type };
    if (b.type === 'ul') out.items = b.items || [];
    else if (b.type === 'img') {
      out.src = `/assets/news/${String(b.src).replace(/\.[^.]+$/, '')}.jpg`;
      out.alt = b.alt || '';
      // 內文圖的長寬要寫進資料,樣板才綁得到 width/height。沒有的話瀏覽器在圖載入前
      // 不知道要留多少位置,文章讀到一半會被推下去(CLS)。七張圖的比例還不一樣,
      // 所以不能用一個寫死的 aspect-ratio 蓋過去 —— 只能逐張讀實際像素。
      const d = jpegSize(path.join(SITE_ROOT, out.src));
      out.w = d.w; out.h = d.h;
    }
    else out.text = b.text || '';
    if (b.links && b.links.length) out.links = b.links.map((l) => ({ text: l.text, href: l.href }));
    return out;
  });
  const zhBlocks = body(a.blocks || []);
  const enBlocks = body(e.blocks || []);
  return {
    id: a.id, slug, date: a.date, cover,
    coverW: coverSize && coverSize.w, coverH: coverSize && coverSize.h,
    zh: { title: a.title, excerpt: a.excerpt || autoExcerpt(zhBlocks, 'zh'), category: a.category, blocks: zhBlocks },
    en: { title: e.title, excerpt: e.excerpt || autoExcerpt(enBlocks, 'en'), category: e.category, blocks: enBlocks },
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
      id: article.id, slug: article.slug, date: article.date,
      cover: article.cover, coverW: article.coverW, coverH: article.coverH,
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
