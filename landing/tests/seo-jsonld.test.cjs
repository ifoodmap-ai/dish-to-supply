const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { dict } = require('../i18n.js');
const news = require('../news.js');
const legal = require('../legal.js');
const routing = require('../routing.js');

// SPEC §4 的 JSON-LD（範圍照 PRIORITY P2-1～P2-3）。seo-head.mjs 是 ESM，用動態 import 載。
const load = () => import('../scripts/seo-head.mjs');
const ROOT = path.join(__dirname, '..');
const BASE = routing.publicBaseUrl;
const LOGO = { url: BASE + '/logo.png', width: 192, height: 56 };
const STATIC_PAGES = Object.keys(routing.pathByPage);

function build(mod, page, lang, slug = null) {
  const other = lang === 'zh' ? 'en' : 'zh';
  const routePath = routing.pageToPath(page, lang, slug);
  return mod.buildJsonLd({
    page, lang, slug, publicBaseUrl: BASE,
    canonical: routing.canonicalUrlForPath(routePath),
    dict: dict(lang), otherDict: dict(other),
    article: page === 'article' ? news.bySlug(slug, lang) : null,
    legalDoc: page === 'legal' && slug ? legal.bySlug(slug, lang) : null,
    urlFor: (p) => BASE + routing.pageToPath(p, lang, null),
    logo: LOGO,
  });
}

/** 跟 prerender 的產出檢查同一支：序列化成 <script> 內文後再驗。 */
function audit(mod, blocks, page, lang, slug = null) {
  return mod.auditJsonLd(blocks.map(mod.serializeJsonLd), { publicBaseUrl: BASE, page, slug, lang });
}

function everyRoute() {
  const out = [];
  for (const lang of ['zh', 'en']) {
    for (const page of STATIC_PAGES) out.push({ page, lang, slug: null });
    for (const a of news.all(lang)) out.push({ page: 'article', lang, slug: a.slug });
    for (const d of legal.all(lang)) out.push({ page: 'legal', lang, slug: d.slug });
  }
  return out;
}

test('every route produces JSON-LD that passes the build-time audit (valid JSON, right types, URLs on publicBaseUrl)', async () => {
  const mod = await load();
  for (const r of everyRoute()) {
    const blocks = build(mod, r.page, r.lang, r.slug);
    assert.deepEqual(audit(mod, blocks, r.page, r.lang, r.slug), [], `${r.lang} ${r.page} ${r.slug || ''}`);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(mod.serializeJsonLd(b)));
  }
});

test('Organization + WebSite live only on the two home pages; other static pages carry no JSON-LD', async () => {
  const mod = await load();
  for (const lang of ['zh', 'en']) {
    for (const page of STATIC_PAGES) {
      const blocks = build(mod, page, lang);
      if (page === 'home') {
        assert.equal(blocks.length, 1);
        assert.deepEqual(blocks[0]['@graph'].map((n) => n['@type']), ['Organization', 'WebSite', 'WebPage']);
      } else {
        assert.deepEqual(blocks, [], `${lang} ${page} 不該有 JSON-LD`);
      }
    }
  }
});

test('home JSON-LD: shared entity @ids across languages, per-language WebPage, confirmed contact data only', async () => {
  const mod = await load();
  const [zh] = build(mod, 'home', 'zh');
  const [en] = build(mod, 'home', 'en');
  const pick = (doc, type) => doc['@graph'].find((n) => n['@type'] === type);

  // SPEC §4-7：跨語系同一個實體 → 共用 @id；不同頁面 → 各自的網址
  assert.equal(pick(zh, 'Organization')['@id'], BASE + '/#organization');
  assert.equal(pick(en, 'Organization')['@id'], BASE + '/#organization');
  assert.equal(pick(zh, 'WebSite')['@id'], BASE + '/#website');
  assert.equal(pick(en, 'WebSite')['@id'], BASE + '/#website');
  assert.equal(pick(zh, 'WebPage')['@id'], BASE + '/');
  assert.equal(pick(en, 'WebPage')['@id'], BASE + '/en');
  assert.equal(pick(zh, 'WebPage').inLanguage, 'zh-Hant-TW');
  assert.equal(pick(en, 'WebPage').inLanguage, 'en');
  assert.equal(pick(zh, 'WebPage').name, dict('zh').meta.pages.home.title);
  assert.equal(pick(en, 'WebPage').name, dict('en').meta.pages.home.title);

  const org = pick(zh, 'Organization');
  assert.equal(org.name, 'iFoodmap 食材地圖');
  assert.equal(org.alternateName, 'iFoodmap');
  assert.equal(org.url, BASE + '/');
  assert.equal(org.telephone, '+886-2-7704-5539');
  assert.equal(org.email, 'ifoodmaptw@gmail.com');
  assert.deepEqual(org.sameAs, ['https://www.facebook.com/iFoodmap', 'https://line.me/R/ti/p/@750yvxki']);
  assert.deepEqual(org.logo, { '@type': 'ImageObject', ...LOGO });
  assert.equal(org.description, dict('zh').meta.pages.home.description);
  assert.equal(pick(en, 'Organization').name, 'iFoodmap');
  assert.equal(pick(en, 'Organization').description, dict('en').meta.pages.home.description);
  assert.ok(!('inLanguage' in org), 'Organization 不在 inLanguage 的適用型別');

  // SPEC §0-2：待業主確認的欄位整欄不寫
  for (const doc of [zh, en]) {
    const text = JSON.stringify(doc);
    for (const key of mod.PENDING_OWNER_FIELDS) assert.ok(!text.includes(`"${key}"`), `不該出現 ${key}`);
    assert.ok(!text.includes('potentialAction'), 'WebSite 不該有 potentialAction');
  }
});

test('article pages: Article + BreadcrumbList built from news.js, dates as published, cover as image', async () => {
  const mod = await load();
  for (const lang of ['zh', 'en']) {
    for (const a of news.all(lang)) {
      const url = BASE + routing.pageToPath('article', lang, a.slug);
      const [article, crumbs] = build(mod, 'article', lang, a.slug);
      assert.equal(article['@type'], 'Article');
      assert.equal(article['@id'], url + '#article');
      assert.equal(article.headline, a.title);
      assert.deepEqual(article.image, [BASE + a.cover]);
      assert.equal(article.datePublished, a.date);
      assert.equal(article.inLanguage, lang === 'zh' ? 'zh-Hant-TW' : 'en');
      assert.deepEqual(article.author, { '@type': 'Organization', name: dict(lang).meta.siteName, url: BASE + '/' });
      assert.deepEqual(article.publisher, { '@id': BASE + '/#organization' });

      assert.equal(crumbs['@type'], 'BreadcrumbList');
      assert.equal(crumbs['@id'], url + '#breadcrumb');
      assert.deepEqual(crumbs.itemListElement, [
        { '@type': 'ListItem', position: 1, name: dict(lang).nav.news, item: BASE + routing.pageToPath('news', lang, null) },
        { '@type': 'ListItem', position: 2, name: a.title },
      ]);
    }
  }
});

test('legal documents get a two-level BreadcrumbList; the /legal index itself gets none', async () => {
  const mod = await load();
  for (const lang of ['zh', 'en']) {
    assert.deepEqual(build(mod, 'legal', lang, null), []);
    for (const d of legal.all(lang)) {
      const [crumbs, ...rest] = build(mod, 'legal', lang, d.slug);
      assert.deepEqual(rest, []);
      assert.deepEqual(crumbs.itemListElement, [
        { '@type': 'ListItem', position: 1, name: dict(lang).legal.indexTitle, item: BASE + routing.pageToPath('legal', lang, null) },
        { '@type': 'ListItem', position: 2, name: d.title },
      ]);
    }
  }
});

test('the audit rejects the schema PRIORITY §5 rules out, unconfirmed owner data and foreign URLs', async () => {
  const mod = await load();
  const [home] = build(mod, 'home', 'zh');
  const tamper = (fn) => { const doc = JSON.parse(JSON.stringify(home)); fn(doc); return mod.auditJsonLd([JSON.stringify(doc)], { publicBaseUrl: BASE, page: 'home', slug: null, lang: 'zh' }); };
  const org = (doc) => doc['@graph'][0];
  const site = (doc) => doc['@graph'][1];

  assert.ok(tamper((d) => { site(d).potentialAction = { '@type': 'SearchAction' }; }).some((p) => /potentialAction/.test(p)));
  assert.ok(tamper((d) => { d['@graph'].push({ '@type': 'FAQPage' }); }).some((p) => /FAQPage/.test(p)));
  assert.ok(tamper((d) => { d['@graph'].push({ '@type': 'Product', name: 'x' }); }).some((p) => /Product/.test(p)));
  assert.ok(tamper((d) => { org(d).address = { '@type': 'PostalAddress', addressCountry: 'TW' }; }).some((p) => /address/.test(p)));
  assert.ok(tamper((d) => { org(d).taxID = '00000000'; }).some((p) => /taxID/.test(p)));
  assert.ok(tamper((d) => { org(d).url = 'https://www.ifoodmap.com.tw/'; }).some((p) => /publicBaseUrl/.test(p)));
  assert.ok(tamper((d) => { org(d).sameAs = ['https://line.me/R/ti/p/@750yvxki?oat_content=url']; }).some((p) => /sameAs/.test(p)));
  assert.ok(mod.auditJsonLd(['{not json'], { publicBaseUrl: BASE, page: 'home', slug: null, lang: 'zh' }).some((p) => /合法 JSON/.test(p)));
  // 不該有 JSON-LD 的頁面多了一塊，也算錯
  assert.ok(mod.auditJsonLd([JSON.stringify(home)], { publicBaseUrl: BASE, page: 'about', slug: null, lang: 'zh' }).some((p) => /型別/.test(p)));
});

test('serialized JSON-LD cannot close its own <script> tag', async () => {
  const mod = await load();
  const text = mod.serializeJsonLd({ headline: '</script><script>alert(1)</script> & more' });
  assert.ok(!text.includes('<') && !text.includes('>') && !text.includes('&'));
  assert.equal(JSON.parse(text).headline, '</script><script>alert(1)</script> & more');
});

test('each language has its own 1200×630 share image, and the English alt text is English', async () => {
  const mod = await load();
  for (const [lang, rel] of Object.entries(mod.OG_IMAGE_PATH)) {
    const size = mod.pngSize(fs.readFileSync(path.join(ROOT, rel)));
    assert.deepEqual(size, mod.OG_IMAGE_SIZE, `${rel} 必須是 1200×630`);
    assert.ok(mod.OG_IMAGE_ALT[lang], `${rel} 要有 og:image:alt`);
  }
  assert.equal(mod.OG_IMAGE_PATH.zh, '/og-image.png');
  assert.equal(mod.OG_IMAGE_PATH.en, '/og-image-en.png');
  assert.doesNotMatch(mod.OG_IMAGE_ALT.en, /[\u3400-\u9fff]/, '英文頁的 og:image:alt 不該有中文');
  // 英文圖上的標題是 en.meta.pages.home.title 去掉品牌前綴（字典現有文案），alt 描述的是同一行字。
  // 這條失敗＝字典的英文首頁標題改了，但 og-image-en.png 還是舊字：要重做英文分享圖並更新 OG_IMAGE_ALT.en。
  const enTitle = dict('en').meta.pages.home.title.split('|').slice(1).join('|').trim();
  assert.ok(mod.OG_IMAGE_ALT.en.includes(enTitle),
    `OG_IMAGE_ALT.en 應描述 og-image-en.png 上的標題「${enTitle}」—— 字典改了就要重做英文分享圖`);
});
