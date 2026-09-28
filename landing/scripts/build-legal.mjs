// 從 legal.zh.json / legal.en.json 產生 legal.js(UMD,node 與瀏覽器都能用)。
// 用法:node build-legal.mjs <legal.zh.json> <legal.en.json> [out=legal.js]
//
// 比照 scripts/build-news.mjs:兩個語系共用同一個 slug,/legal/x 與 /en/legal/x 是同一份文件,
// hreflang 才指得對。中文是法律上有效力的版本,英文只是譯本(效力聲明在 dict 的 L.legal.prevail)。
import fs from 'node:fs';

const [zhPath, enPath, outPath = 'legal.js'] = process.argv.slice(2);
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// 顯示順序 = 這個陣列的順序,也是「其他條款」互連列的順序。
const ORDER = ['terms', 'privacy'];

const docs = ORDER.map((slug) => {
  const z = zh[slug], e = en[slug];
  if (!z) throw new Error(`中文版缺少 ${slug}`);
  if (!e) throw new Error(`英文版缺少 ${slug}`);
  if (z.blocks.length !== e.blocks.length)
    throw new Error(`${slug}:中英 block 數不一致 zh=${z.blocks.length} en=${e.blocks.length}`);
  z.blocks.forEach((b, i) => {
    const eb = e.blocks[i];
    if (b.type !== eb.type) throw new Error(`${slug} block#${i}:型別不一致 ${b.type} vs ${eb.type}`);
    if (b.type === 'ol' && b.items.length !== eb.items.length)
      throw new Error(`${slug} block#${i}:ol 項數不一致 ${b.items.length} vs ${eb.items.length}`);
  });
  const body = (blocks) => blocks.map((b) =>
    b.type === 'ol' || b.type === 'ul' ? { type: b.type, items: b.items } : { type: b.type, text: b.text });
  return {
    slug,
    updated: z.updated || null,
    zh: { title: z.title, summary: z.summary, blocks: body(z.blocks) },
    en: { title: e.title, summary: e.summary, blocks: body(e.blocks) },
  };
});

const module_ = `(function (root, factory) {
  var legal = factory();
  if (typeof module === 'object' && module.exports) module.exports = legal;
  if (root) root.IfmLegal = legal;
})(typeof window !== 'undefined' ? window : null, function () {
  /* ==== 由 scripts/build-legal.mjs 從舊站 ifoodmap.com.tw/pages/code/ 擷取後產生,不要手改 ====
     中文版是原文逐字照抄(法律上有效力的版本),英文版是譯本。
     兩個語系共用同一個 slug,所以 /legal/x 與 /en/legal/x 是同一份文件,hreflang 才指得對。
     條號(第一條、一、)保留在文字裡,ol 用 list-style:none 呈現 —— 條號會被交叉引用
     (例如第九條提到「第十八條」),自動編號一旦跟原文對不上就是改了法律文件。 */
  var DOCS = ${JSON.stringify(docs, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n')};

  function pick(doc, lang) {
    var body = doc[lang === 'en' ? 'en' : 'zh'];
    return {
      slug: doc.slug, updated: doc.updated,
      title: body.title, summary: body.summary, blocks: body.blocks,
    };
  }

  return {
    all: function (lang) { return DOCS.map(function (d) { return pick(d, lang); }); },
    bySlug: function (slug, lang) {
      for (var i = 0; i < DOCS.length; i++) if (DOCS[i].slug === slug) return pick(DOCS[i], lang);
      return null;
    },
    count: DOCS.length,
    _raw: DOCS,
  };
});
`;
fs.writeFileSync(outPath, module_);
console.log(`OK ${outPath}:${docs.length} 份文件`);
docs.forEach((d) => console.log(`  ${d.slug.padEnd(10)} updated=${d.updated || '(無)'}  blocks=${d.zh.blocks.length}`));
