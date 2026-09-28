const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const i18n = require('../i18n.js');

const { dict } = i18n;
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const PRODUCT_BASE_URL = source.match(/window\.IFM_PRODUCT_BASE_URL = '([^']+)'/)[1];
const CJK = /[　-〿一-鿿＀-￯]/;

// 把 renderVals() 裡「產品站網址」與「常見問題」這兩段原始碼原封不動拿出來跑,
// 驗的是頁面真的會算出來的 qaItems,而不是測試自己抄一份邏輯。
const productUrlsSrc = source.match(/const productUrls = \{[\s\S]*?\n {4}\};/)[0];
const qaItemsSrc = source.match(/const qaItems = \(\(L\.qa && L\.qa\.items\) \|\| \[\]\)\.map\(\(item\) => \{[\s\S]*?\n {4}\}\);/)[0];

function renderQa(L) {
  const sandbox = { productBaseUrl: PRODUCT_BASE_URL, i18n, L };
  vm.runInNewContext(`${productUrlsSrc}\n${qaItemsSrc}\nthis.out = { productUrls, qaItems };`, sandbox);
  return sandbox.out;
}

test('Q1(供應商怎麼加入)照業主核定的新流程:先填申請表、不用先註冊,審核後收邀請信設密碼', () => {
  const zh = dict('zh').qa.items[0];
  assert.equal(zh.question, '我是食材供應商，該如何加入食材地圖，成為合作供應商？');
  assert.deepEqual(zh.paras, [
    '先填寫「申請供應商上架」表單，不需要先註冊帳號。平台審核通過後，會寄一封邀請信到你填寫的 Email，點信中的連結設定密碼，即可登入供應商後台，開始接收食材需求轉單。',
  ]);
  assert.equal(zh.linkText, '前往「申請供應商上架」表單');

  const en = dict('en').qa.items[0];
  assert.equal(en.paras.length, 1);
  for (const phrase of ['supplier application form', "don't need to create an account", 'invitation', 'set your password', 'supplier dashboard']) {
    assert.ok(en.paras[0].includes(phrase), `英文版要講到「${phrase}」`);
  }
  assert.equal(en.linkText, 'Go to the supplier application form');
  assert.doesNotMatch(en.paras[0] + en.linkText, CJK, '英文頁不能殘留中文');
});

test('Q1 的連結用佔位符,不在字典裡寫死產品站網域', () => {
  for (const lang of ['zh', 'en']) {
    assert.equal(dict(lang).qa.items[0].linkHref, '{supplierApplicationUrl}', `${lang}`);
  }
  assert.doesNotMatch(JSON.stringify(dict('zh').qa) + JSON.stringify(dict('en').qa), /dish-to-supply/);
});

test('Q1 的連結換成頁面上「申請供應商上架」按鈕同一個網址(產品站 /join),Q2 的外連不變', () => {
  for (const lang of ['zh', 'en']) {
    const { productUrls, qaItems } = renderQa(dict(lang));
    assert.equal(productUrls.supplierApplicationUrl, PRODUCT_BASE_URL + '/join');
    assert.equal(qaItems[0].linkHref, productUrls.supplierApplicationUrl, `${lang} Q1`);
    assert.equal(qaItems[0].hasLink, true, `${lang} Q1`);
    assert.equal(qaItems[1].linkHref, 'https://www.ifoodmap.com.tw/how/pointRule', `${lang} Q2`);
    assert.equal(qaItems[1].hasLink, true, `${lang} Q2`);
    assert.equal(qaItems.length, dict(lang).qa.items.length);
  }
  // 頁面上的按鈕與 FAQ 共用同一份 productUrls(renderVals() 回傳時整包攤開)
  assert.match(source, /\n {6}\.\.\.productUrls,\n/);
});

test('連結欄位空白或佔位符打錯時不顯示連結,不送出壞掉的 href', () => {
  const L = {
    qa: {
      items: [
        { question: 'a', paras: ['x'], linkHref: '', linkText: '' },
        { question: 'b', paras: ['y'], linkHref: '{supplierApplicationUrI}', linkText: 'typo' },
      ],
    },
  };
  const { qaItems } = renderQa(L);
  assert.deepEqual(qaItems.map((q) => q.hasLink), [false, false]);
});

test('markup 把 FAQ 的連結欄位渲染成 <a>', () => {
  const qaStart = source.indexOf('<!-- ============ PAGE: QA');
  const qa = source.slice(qaStart, source.indexOf('<!-- ============ PAGE: LEGAL'));
  assert.match(qa, /<sc-if value="\{\{ q\.hasLink \}\}">\s*<p><a href="\{\{ q\.linkHref \}\}"[^>]*>\{\{ q\.linkText \}\}<\/a><\/p>\s*<\/sc-if>/);
});

test('Q2(費用)的錯字已修正:即可收到、進一步', () => {
  const [para] = dict('zh').qa.items[1].paras;
  assert.match(para, /即可收到/);
  assert.match(para, /進一步/);
  assert.doesNotMatch(para, /及可以收到|近一步/);
});
