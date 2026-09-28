const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dict, format } = require('../i18n.js');

// 頁尾版權的年份要每年自動更新(業主 2026-09-28)。以前是寫死的「© 2026 iFoodMap」,明年就過期。
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('版權格式照舊站:©{year} by ifoodmap 食材地圖 All rights are reserved.', () => {
  assert.equal(dict('zh').footer.copyright, '©{year} by ifoodmap 食材地圖 All rights are reserved.');
  // 英文頁不能殘留中文,品牌名在英文站一律是 ifoodmap
  assert.equal(dict('en').footer.copyright, '©{year} by ifoodmap All rights are reserved.');
  assert.equal(format(dict('zh').footer.copyright, { year: 2031 }), '©2031 by ifoodmap 食材地圖 All rights are reserved.');
});

test('年份是程式算的,不是寫死的', () => {
  assert.match(html, /copyrightText:[\s\S]{0,160}new Date\(\)\.getFullYear\(\)/, 'renderVals 要用 new Date().getFullYear() 算年份');
  assert.match(html, /\{\{\s*copyrightText\s*\}\}/, '頁尾要綁 {{ copyrightText }}');
  assert.doesNotMatch(html, /©\s*20\d\d\s*iFood/i, '頁尾不可以再出現寫死年份的版權字串');
});

test('每年 1/1 自動重建,讓爬蟲看到的靜態 HTML 年份也會換', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(wf, /schedule:\s*\n\s*-\s*cron:\s*'5 16 31 12 \*'/, 'deploy.yml 要有每年 12/31 16:05 UTC(= 台北 1/1 00:05)的排程');
});
