const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 文章頁的 og:image 是「那篇自己的封面」做成的 1200×630 分享圖(scripts/build-og-covers.mjs 產生,
// commit 在 assets/news/og/)。prerender 在 CI 裡找不到圖會讓整個部署失敗 —— 這裡提早在
// npm test 就擋下來:新增文章或換封面卻忘了跑 build-og-covers,測試會先紅。
const ROOT = path.join(__dirname, '..');
const news = require('../news.js');

test('每篇文章的封面都有一張 1200×630 的分享圖', async () => {
  const { ogPathForCover, jpegSize } = await import(path.join(ROOT, 'scripts/seo-head.mjs'));
  const covers = new Set(news.all('zh').concat(news.all('en')).map((a) => a.cover).filter(Boolean));
  assert.ok(covers.size > 0, 'news.js 裡沒有任何封面');
  for (const cover of covers) {
    const rel = ogPathForCover(cover);
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `缺分享圖 ${rel}(封面 ${cover})—— 跑 node scripts/build-og-covers.mjs 再 commit`);
    const { width, height } = jpegSize(fs.readFileSync(abs));
    assert.deepEqual({ width, height }, { width: 1200, height: 630 },
      `${rel} 必須剛好 1200×630:og:image:width/height 宣告的就是這兩個數字,圖不對等於在騙爬蟲`);
  }
});

test('中英兩篇共用同一張封面,所以也共用同一張分享圖', async () => {
  const { ogPathForCover } = await import(path.join(ROOT, 'scripts/seo-head.mjs'));
  for (const zh of news.all('zh')) {
    const en = news.all('en').find((e) => e.slug === zh.slug);
    assert.ok(en, `${zh.slug} 沒有英文版`);
    assert.equal(ogPathForCover(en.cover), ogPathForCover(zh.cover), `${zh.slug} 中英分享圖不一致`);
  }
});

test('assets/news/og/ 裡沒有對不到任何文章的孤兒圖', async () => {
  const { ogPathForCover } = await import(path.join(ROOT, 'scripts/seo-head.mjs'));
  const want = new Set(news.all('zh').map((a) => path.basename(ogPathForCover(a.cover))));
  const have = fs.readdirSync(path.join(ROOT, 'assets/news/og')).filter((f) => f.endsWith('.jpg'));
  const orphan = have.filter((f) => !want.has(f));
  assert.deepEqual(orphan, [], `這些分享圖已經沒有對應的文章,刪掉:${orphan.join(', ')}`);
});
