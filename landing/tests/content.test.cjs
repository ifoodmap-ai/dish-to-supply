const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const homeStart = source.indexOf('<!-- ============ PAGE: HOME ============ -->');
const homeEnd = source.indexOf('<!-- ============ PAGE: RESTAURANTS ============ -->');
const home = source.slice(homeStart, homeEnd);
const headerStart = source.indexOf('<!-- ============ HEADER ============ -->');
const headerEnd = source.indexOf('<!-- ============ PAGE: HOME ============ -->');
const header = source.slice(headerStart, headerEnd);
const drawerStart = source.indexOf('// ---- 漢堡選單');
const drawerEnd = source.indexOf('// ④ 滾動進度條', drawerStart);
const drawer = source.slice(drawerStart, drawerEnd);

const approvedCases = [
  ['單店餐廳，告別到處問價的日子', '透過一次需求媒合，快速對接三家蔬果供應商，穩定取得當季食材。', '3 天', '−15%'],
  ['大量供餐，採購來源更穩定', '同時對接多家供應商，降低單一來源斷貨風險，供餐更有保障。', '5+', '0'],
  ['產地直送，建立消費者信任', '對接具產銷履歷的產地供應商，商品故事與品質都更有說服力。', '+28%', '4.9★'],
];

function assertHomeMetricsAndWorkflow(fragment) {
  for (const metric of ['3,000+', '2,500+', '28 類', '24hr']) {
    assert.match(fragment, new RegExp(metric.replace('+', '\\+')));
  }
  for (const step of [
    '餐廳提出需求',
    'AI 標準化與媒合',
    '供應商線上報價',
    '完成採購與履歷',
  ]) {
    assert.match(fragment, new RegExp(`<h3[^>]*>${step}<\\/h3>`));
  }
}

function assertApprovedCases(fragment) {
  for (const approvedCase of approvedCases) {
    for (const text of approvedCase) assert.match(fragment, new RegExp(text.replace('+', '\\+')));
  }
}

function assertMobileLogin(fragment) {
  assert.match(fragment, /login\.href = window\.IFM_PRODUCT_BASE_URL \+ '\/'/);
  assert.match(fragment, /login\.textContent = '登入平台'/);
}

test('homepage presents the approved two-sided platform message and actions', () => {
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  assert.match(home, />AI 驅動的 B2B 食材採購平台</);
  assert.match(home, /<h1[^>]*>讓每一筆食材採購，都更快找到對的人<\/h1>/);
  assert.match(
    home,
    /iFoodmap 串接餐廳需求與全台食材供應商，從智慧媒合、報價比較到訂單管理，讓採購與接單都更有效率。/,
  );
  for (const label of ['餐廳免費註冊', '供應商免費上架']) {
    assert.match(home, new RegExp(label));
  }
  assert.match(header, />登入平台<\/a>/);
});

test('product links derive from one canonical product base URL', () => {
  assert.equal((source.match(/https:\/\/dish-to-supply\.vercel\.app/g) || []).length, 1);
  assert.match(source, /IFM_PRODUCT_BASE_URL\s*=\s*'https:\/\/dish-to-supply\.vercel\.app'/);
  assert.match(source, /const productBaseUrl = window\.IFM_PRODUCT_BASE_URL;/);
  assert.match(source, /restaurantRegistrationUrl:\s*productBaseUrl \+ '\/register\/restaurant'/);
  assert.match(source, /supplierApplicationUrl:\s*productBaseUrl \+ '\/join'/);
  assert.match(source, /loginUrl:\s*productBaseUrl \+ '\/'/);
  assert.match(home, /href="\{\{\s*restaurantRegistrationUrl\s*\}\}"/);
  assert.match(home, /href="\{\{\s*supplierApplicationUrl\s*\}\}"/);
  assert.match(header, /href="\{\{\s*loginUrl\s*\}\}"[^>]*>登入平台<\/a>/);
  assertMobileLogin(drawer);
});

test('homepage retains approved metrics and explains the four-step workflow', () => {
  assertHomeMetricsAndWorkflow(home);
});

test('homepage gives both roles equal capabilities and real product CTAs', () => {
  for (const capability of [
    '菜單成本',
    '比價採購',
    '訂單收貨',
    '商機媒合',
    '線上報價',
    '出貨管理',
    '菜單分析',
    '成本管理',
    '訂單與收貨',
    '商機雷達',
    '接單出貨',
    '定價與需求預測',
  ]) {
    assert.match(home, new RegExp(capability));
  }

  assert.match(home, /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>餐廳免費註冊/);
  assert.match(home, /<a[^>]+href="\{\{\s*supplierApplicationUrl\s*\}\}"[^>]*>供應商免費上架/);
});

test('homepage uses semantic labelled product mockups without old scene placeholders', () => {
  assert.match(home, /aria-label="產品功能示意畫面"/);
  assert.match(home, /(?:示例|示範)/);
  for (const restaurantItem of ['成本 KPI', '待處理訂單', '供應商比較']) {
    assert.match(home, new RegExp(restaurantItem));
  }
  for (const supplierItem of ['新商機', '報價狀態', '需求預測']) {
    assert.match(home, new RegExp(supplierItem));
  }
  assert.doesNotMatch(home, /\[ 餐廳採購情境照 \]/);
  assert.doesNotMatch(home, /\[ 供應商出貨情境照 \]/);
  assert.doesNotMatch(home, /截圖/);
});

test('homepage renders all three approved outcome cases before the final dual CTA', () => {
  const casesHeading = home.indexOf('實際使用成果');
  const finalCta = home.indexOf('現在就從適合你的入口開始');
  assert.ok(casesHeading >= 0 && finalCta > casesHeading);

  assertApprovedCases(home);
});

test('mobile drawer mirrors desktop destinations and uses the shared external login', () => {
  const expectedLinks = [
    ["平台介紹", "home"],
    ["餐廳方案", "restaurants"],
    ["供應商方案", "suppliers"],
    ["成功案例", "cases"],
    ["關於我們", "about"],
  ];
  for (const [label, page] of expectedLinks) {
    assert.match(drawer, new RegExp(`\\{ label: '${label}', page: '${page}' \\}`));
  }
  assert.doesNotMatch(drawer, /label: '聯絡我們'/);
  assert.doesNotMatch(drawer, /免費媒合需求/);
  assert.doesNotMatch(drawer, /cta\.href = '\/contact'/);
  assert.match(drawer, /login\.addEventListener\('click'/);
  assert.match(drawer, /if \(isModifiedClick\(event\)\) return;/);
});

test('content guards fail when home stats, home cases, or mobile login are removed', () => {
  const homeWithoutStats = home.replace(/<section aria-label="平台服務數據"[\s\S]*?<\/section>/, '');
  const caseMarker = home.indexOf('實際使用成果');
  const caseStart = home.lastIndexOf('<section', caseMarker);
  const caseEnd = home.indexOf('</section>', caseMarker) + '</section>'.length;
  const homeWithoutCases = home.slice(0, caseStart) + home.slice(caseEnd);
  const drawerWithoutLogin = drawer.replace(/var login = document\.createElement\('a'\);[\s\S]*?menu\.appendChild\(login\);/, '');

  assert.throws(() => assertHomeMetricsAndWorkflow(homeWithoutStats));
  assert.throws(() => assertApprovedCases(homeWithoutCases));
  assert.throws(() => assertMobileLogin(drawerWithoutLogin));
});

test('homepage CTAs expose stable focus, touch, responsive and reduced-motion rules', () => {
  assert.match(source, /\.platform-action:focus-visible/);
  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /@media\s*\(max-width:\s*768px\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
