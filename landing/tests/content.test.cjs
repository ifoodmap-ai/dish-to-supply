const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const homeStart = source.indexOf('<!-- ============ PAGE: HOME ============ -->');
const homeEnd = source.indexOf('<!-- ============ PAGE: RESTAURANTS ============ -->');
const home = source.slice(homeStart, homeEnd);
const restaurantsStart = source.indexOf('<!-- ============ PAGE: RESTAURANTS ============ -->');
const restaurantsEnd = source.indexOf('<!-- ============ PAGE: SUPPLIERS ============ -->');
const restaurants = source.slice(restaurantsStart, restaurantsEnd);
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

function assertRestaurantCapabilities(fragment) {
  for (const capability of ['AI 菜單分析', '成本與採購', '訂單與收貨', '團隊管理']) {
    assert.match(fragment, new RegExp(`<h2[^>]*>${capability}<\\/h2>`));
  }
}

function assertRestaurantRegistrationCta(fragment) {
  assert.match(
    fragment,
    /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>免費建立餐廳帳號<\/a>/,
  );
}

function assertMobileLogin(fragment) {
  assert.match(fragment, /login\.href = window\.IFM_PRODUCT_BASE_URL \+ '\/'/);
  assert.match(fragment, /login\.textContent = '登入平台'/);
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
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
  assert.match(home, /<h2 id="product-demo-heading"[^>]*>產品功能示意畫面<\/h2>/);
  assert.match(home, /<section class="platform-mock-grid" aria-labelledby="product-demo-heading">/);
  assert.match(home, /<article class="platform-mock"[^>]+aria-labelledby="restaurant-demo-title"/);
  assert.match(home, /<h3 id="restaurant-demo-title"[^>]*>餐廳採購總覽<\/h3>/);
  assert.match(home, /<article class="platform-mock"[^>]+aria-labelledby="supplier-demo-title"/);
  assert.match(home, /<h3 id="supplier-demo-title"[^>]*>供應商營運總覽<\/h3>/);
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
  const casesHeading = home.indexOf('案例成果');
  const finalCta = home.indexOf('現在就從適合你的入口開始');
  assert.ok(casesHeading >= 0 && finalCta > casesHeading);
  assert.match(home, /成果依業態、採購規模與執行期間而異。/);
  assert.match(home, /平台現有公開數據/);

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
  const caseMarker = home.indexOf('案例成果');
  const caseStart = home.lastIndexOf('<section', caseMarker);
  const caseEnd = home.indexOf('</section>', caseMarker) + '</section>'.length;
  const homeWithoutCases = home.slice(0, caseStart) + home.slice(caseEnd);
  const drawerWithoutLogin = drawer.replace(/var login = document\.createElement\('a'\);[\s\S]*?menu\.appendChild\(login\);/, '');

  assert.throws(() => assertHomeMetricsAndWorkflow(homeWithoutStats));
  assert.throws(() => assertApprovedCases(homeWithoutCases));
  assert.throws(() => assertMobileLogin(drawerWithoutLogin));
});

test('small homepage labels and outcome captions meet WCAG AA contrast', () => {
  for (const background of ['#ffffff', '#f8faf8', '#f3f7f3']) {
    assert.ok(contrastRatio('#166534', background) >= 4.5);
  }
  assert.ok(contrastRatio('#5b6b62', '#ffffff') >= 4.5);
  assert.doesNotMatch(home, /style="(?=[^"]*font-size:1[23]px)(?=[^"]*color:#1f9e4e)[^"]*"/);
  assert.doesNotMatch(home, /font-size:12px;color:#748278/);
  assert.match(home, /style="(?=[^"]*font-size:13px)(?=[^"]*color:#166534)[^"]*"/);
  for (const caption of [
    '完成供應商比較',
    '食材採購成本',
    '穩定合作供應商',
    '斷貨次數',
    '回購率提升',
    '顧客評價',
  ]) {
    assert.match(home, new RegExp(`font-size:12px;color:#5b6b62[^"]*">${caption}`));
  }
});

test('homepage CTAs expose stable focus, touch, responsive and reduced-motion rules', () => {
  assert.match(source, /\.platform-action:focus-visible/);
  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /@media\s*\(max-width:\s*768px\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('restaurant solution page follows the approved story and section order', () => {
  assert.ok(restaurantsStart >= 0 && restaurantsEnd > restaurantsStart);
  assert.match(restaurants, />iFoodmap for Restaurants</);
  assert.match(restaurants, /<h1[^>]*>[^<]*從菜單分析到完成收貨[^<]*<\/h1>/);
  assertRestaurantRegistrationCta(restaurants);

  const hero = restaurants.indexOf('從菜單分析到完成收貨');
  const pains = restaurants.indexOf('餐廳採購，不該靠人脈與零散訊息');
  const workflow = restaurants.indexOf('從菜單與需求，一路走到收貨');
  const capabilities = restaurants.indexOf('id="restaurant-capabilities"');
  const cases = restaurants.indexOf('餐廳採購的實際成果');
  const finalCta = restaurants.lastIndexOf('免費建立餐廳帳號');
  assert.ok(hero >= 0 && pains > hero);
  assert.ok(workflow > pains && capabilities > workflow);
  assert.ok(cases > capabilities && finalCta > cases);
});

test('restaurant page names four accurate pains and a menu-to-receiving workflow', () => {
  for (const pain of [
    '仰賴人工與同行詢問',
    '規格與價格資訊不完整',
    '比價耗費大量時間',
    '訂單與收貨難追蹤',
  ]) {
    assert.match(restaurants, new RegExp(pain));
  }
  for (const step of ['整理菜單與需求', '確認食材與規格', '比較供應商與價格', '建立訂單並確認收貨']) {
    assert.match(restaurants, new RegExp(step));
  }
});

test('restaurant page presents four product-grounded capabilities with labelled example mockups', () => {
  assertRestaurantCapabilities(restaurants);
  for (const detail of [
    '辨識菜色與食材',
    '確認或編輯分析結果',
    '菜色食材成本',
    '供應商價格比較',
    '替代食材與當季參考',
    '採購與訂單狀態',
    '確認收貨',
    '事件履歷',
    '分店',
    'owner',
    'manager',
    'purchaser',
    '收貨地點與時段',
  ]) {
    assert.match(restaurants, new RegExp(detail, 'i'));
  }
  assert.equal(
    (restaurants.match(/產品功能示意畫面 · 示例資料/g) || []).length,
    4,
  );
  assert.match(restaurants, /<article[^>]+aria-labelledby="restaurant-analyze-title"/);
  assert.match(restaurants, /<article[^>]+aria-labelledby="restaurant-cost-title"/);
  assert.match(restaurants, /<article[^>]+aria-labelledby="restaurant-orders-title"/);
  assert.match(restaurants, /<article[^>]+aria-labelledby="restaurant-team-title"/);
});

test('restaurant page retains the approved restaurant outcomes and qualifier', () => {
  for (const approvedCase of approvedCases.slice(0, 2)) {
    for (const text of approvedCase) assert.match(restaurants, new RegExp(text.replace('+', '\\+')));
  }
  assert.doesNotMatch(restaurants, new RegExp(approvedCases[2][0]));
  assert.match(restaurants, /成果依業態、採購規模與執行期間而異。/);
});

test('restaurant fragment excludes legacy placeholders and unsupported marketing', () => {
  assert.doesNotMatch(restaurants, /\{\{\s*servicesFull\s*\}\}/);
  assert.doesNotMatch(restaurants, /repeating-linear-gradient/);
  assert.doesNotMatch(restaurants, /\[[^\]]*(?:介面|示意|實拍)[^\]]*\]/);
  assert.doesNotMatch(restaurants, /Our services|ERP|LINE@|LINE 即時|自動補貨|量身打造/);
});

test('restaurant content guards fail if capabilities or registration CTA are removed', () => {
  const withoutCapabilities = restaurants.replace(
    /<section[^>]+id="restaurant-capabilities"[\s\S]*?<\/section>/,
    '',
  );
  const withoutRegistrationCta = restaurants.replace(
    /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>免費建立餐廳帳號<\/a>/g,
    '',
  );
  assert.throws(() => assertRestaurantCapabilities(withoutCapabilities));
  assert.throws(() => assertRestaurantRegistrationCta(withoutRegistrationCta));
});
