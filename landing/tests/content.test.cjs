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
const suppliersStart = source.indexOf('<!-- ============ PAGE: SUPPLIERS ============ -->');
const suppliersEnd = source.indexOf('<!-- ============ PAGE: CASES ============ -->');
const suppliers = source.slice(suppliersStart, suppliersEnd);
const casesStart = source.indexOf('<!-- ============ PAGE: CASES ============ -->');
const casesEnd = source.indexOf('<!-- ============ PAGE: ABOUT ============ -->');
const cases = source.slice(casesStart, casesEnd);
const aboutStart = source.indexOf('<!-- ============ PAGE: ABOUT ============ -->');
const aboutEnd = source.indexOf('<!-- ============ PAGE: CONTACT ============ -->');
const about = source.slice(aboutStart, aboutEnd);
const contactStart = source.indexOf('<!-- ============ PAGE: CONTACT ============ -->');
const contactEnd = source.indexOf('<!-- ============ FOOTER ============ -->');
const contact = source.slice(contactStart, contactEnd);
const footerStart = source.indexOf('<!-- ============ FOOTER ============ -->');
const footerEnd = source.indexOf('</footer>', footerStart) + '</footer>'.length;
const footer = source.slice(footerStart, footerEnd);
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

function assertRestaurantCapabilityOrder(fragment) {
  const capabilityStart = fragment.indexOf('<section id="restaurant-capabilities"');
  const capabilityEnd = fragment.indexOf('<section aria-labelledby="restaurant-cases-title"', capabilityStart);
  const capabilityFragment = fragment.slice(capabilityStart, capabilityEnd);
  const headings = [...capabilityFragment.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)]
    .map((match) => match[1]);
  assert.deepEqual(headings, ['AI 菜單分析', '成本與採購', '訂單與收貨', '團隊管理']);
}

function assertRestaurantRegistrationCta(fragment) {
  assert.match(
    fragment,
    /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>免費建立餐廳帳號<\/a>/,
  );
}

function assertReducedMotionSkipLink(fragment) {
  assert.match(fragment, /\.skip-link\s*\{[^}]*transition:\s*none[^}]*\}/s);
}

function assertReducedMotionRevealVisibility(fragment) {
  assert.match(
    fragment,
    /\[data-reveal\]\s*\{[^}]*opacity:\s*1\s*!important[^}]*\}/s,
  );
}

function assertRestaurantOverflowRegions(fragment) {
  const labels = [
    '菜單分析示意表，可左右捲動',
    '成本比較示意表，可左右捲動',
    '團隊權限示意表，可左右捲動',
  ];
  assert.equal((fragment.match(/class="restaurant-mock-scroll"/g) || []).length, labels.length);
  assert.equal((fragment.match(/class="restaurant-mock-scroll"[^>]*tabindex="0"/g) || []).length, labels.length);
  assert.equal((fragment.match(/class="restaurant-mock-scroll"[^>]*role="region"/g) || []).length, labels.length);
  for (const label of labels) {
    assert.match(
      fragment,
      new RegExp(`<div class="restaurant-mock-scroll"[^>]*aria-label="${label}"[^>]*>`),
    );
  }
}

function assertSupplierCapabilities(fragment) {
  for (const capability of ['商機雷達', '報價與接單', '定價與預測', '客戶經營']) {
    assert.match(fragment, new RegExp(`<h2[^>]*>${capability}<\\/h2>`));
  }
}

function assertSupplierCapabilityOrder(fragment) {
  const capabilityStart = fragment.indexOf('<section id="supplier-capabilities"');
  const capabilityEnd = fragment.indexOf('<section aria-labelledby="supplier-outcomes-title"', capabilityStart);
  const capabilityFragment = fragment.slice(capabilityStart, capabilityEnd);
  const headings = [...capabilityFragment.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)]
    .map((match) => match[1]);
  assert.deepEqual(headings, ['商機雷達', '報價與接單', '定價與預測', '客戶經營']);
}

function assertSupplierApplicationCtas(fragment) {
  const ctas = fragment.match(
    /<a[^>]+href="\{\{\s*supplierApplicationUrl\s*\}\}"[^>]*>免費申請供應商上架<\/a>/g,
  ) || [];
  assert.equal(ctas.length, 2);
}

function assertSupplierOverflowRegions(fragment) {
  const labels = [
    '商機與品項缺口示意表，可左右捲動',
    '報價與訂單狀態示意表，可左右捲動',
    '定價與需求預測示意表，可左右捲動',
    '客戶與評價示意表，可左右捲動',
  ];
  assert.equal((fragment.match(/class="supplier-mock-scroll"/g) || []).length, labels.length);
  assert.equal((fragment.match(/class="supplier-mock-scroll"[^>]*tabindex="0"/g) || []).length, labels.length);
  assert.equal((fragment.match(/class="supplier-mock-scroll"[^>]*role="region"/g) || []).length, labels.length);
  for (const label of labels) {
    assert.match(
      fragment,
      new RegExp(`<div class="supplier-mock-scroll"[^>]*aria-label="${label}"[^>]*>`),
    );
  }
}

function assertMobileLogin(fragment) {
  assert.match(fragment, /login\.href = window\.IFM_PRODUCT_BASE_URL \+ '\/'/);
  assert.match(fragment, /login\.textContent = '登入平台'/);
}

function assertAiDialogLifecycle(fragment) {
  assert.match(fragment, /panel\.id = 'ai-assistant-dialog'/);
  assert.equal((fragment.match(/panel\.setAttribute\('aria-hidden', 'true'\)/g) || []).length, 2);
  assert.equal((fragment.match(/panel\.inert = true/g) || []).length, 2);
  assert.match(fragment, /panel\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(fragment, /panel\.inert = true/);
  assert.match(fragment, /fab\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(fragment, /function openPanel\(\)[\s\S]*?panel\.removeAttribute\('aria-hidden'\)[\s\S]*?panel\.inert = false[\s\S]*?fab\.setAttribute\('aria-expanded', 'true'\)/);
  assert.match(fragment, /function closePanel\(\)[\s\S]*?panel\.setAttribute\('aria-hidden', 'true'\)[\s\S]*?panel\.inert = true[\s\S]*?fab\.setAttribute\('aria-expanded', 'false'\)[\s\S]*?fab\.focus\(\)/);
  assert.match(fragment, /if \(e\.key === 'Escape'\)[\s\S]*?closePanel\(\)/);
  assert.match(fragment, /if \(e\.key !== 'Tab'\) return;/);
  assert.match(fragment, /last\.focus\(\)/);
  assert.match(fragment, /first\.focus\(\)/);
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
  assertRestaurantCapabilityOrder(restaurants);
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

test('restaurant capability order guard fails when adjacent capabilities are swapped', () => {
  const costStart = restaurants.indexOf('<article class="restaurant-capability restaurant-capability--reverse"');
  const ordersStart = restaurants.indexOf('<article class="restaurant-capability"', costStart + 1);
  const teamStart = restaurants.indexOf('<article class="restaurant-capability restaurant-capability--reverse"', ordersStart + 1);
  const cost = restaurants.slice(costStart, ordersStart);
  const orders = restaurants.slice(ordersStart, teamStart);
  const swapped = restaurants.slice(0, costStart) + orders + cost + restaurants.slice(teamStart);
  assert.throws(() => assertRestaurantCapabilityOrder(swapped));
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

test('restaurant in-page capability target clears the sticky header', () => {
  assert.match(restaurants, /href="#restaurant-capabilities"/);
  assert.match(source, /#restaurant-capabilities\s*\{[^}]*scroll-margin-top:\s*96px/s);
});

test('every route shares one keyboard skip target and one main landmark', () => {
  assert.equal((source.match(/<main\b/g) || []).length, 1);
  assert.equal((source.match(/<\/main>/g) || []).length, 1);
  assert.match(
    source,
    /<a class="skip-link" href="#main-content">跳到主要內容<\/a>[\s\S]*?<!-- ============ HEADER ============ -->/,
  );
  assert.match(source, /<main id="main-content" tabindex="-1">/);
  assert.match(source, /#main-content\s*\{[^}]*scroll-margin-top:\s*96px/s);
  assert.match(source, /\.skip-link:focus-visible\s*\{/);

  const mainStart = source.indexOf('<main id="main-content" tabindex="-1">');
  const mainEnd = source.indexOf('</main>', mainStart);
  for (const marker of [
    'PAGE: HOME',
    'PAGE: RESTAURANTS',
    'PAGE: SUPPLIERS',
    'PAGE: CASES',
    'PAGE: ABOUT',
    'PAGE: CONTACT',
  ]) {
    const markerPosition = source.indexOf(marker);
    assert.ok(markerPosition > mainStart && markerPosition < mainEnd);
  }
});

test('skip link disables its transition for reduced-motion users', () => {
  const reducedMotionStart = source.indexOf('@media (prefers-reduced-motion:reduce)');
  const reducedMotionEnd = source.indexOf('</style>', reducedMotionStart);
  const reducedMotion = source.slice(reducedMotionStart, reducedMotionEnd);
  assertReducedMotionSkipLink(reducedMotion);

  const withoutSkipRule = reducedMotion.replace(
    /\.skip-link\s*\{[^}]*transition:\s*none[^}]*\}/s,
    '',
  );
  assert.throws(() => assertReducedMotionSkipLink(withoutSkipRule));
});

test('reduced-motion users keep reveal content visible without animation', () => {
  const reducedMotionStart = source.indexOf('@media (prefers-reduced-motion:reduce)');
  const reducedMotionEnd = source.indexOf('</style>', reducedMotionStart);
  const reducedMotion = source.slice(reducedMotionStart, reducedMotionEnd);
  assertReducedMotionRevealVisibility(reducedMotion);

  const withoutVisibleReveal = reducedMotion.replace(
    /opacity:\s*1\s*!important/,
    '',
  );
  assert.throws(() => assertReducedMotionRevealVisibility(withoutVisibleReveal));
});

test('only horizontally overflowing restaurant mockups are labelled keyboard regions', () => {
  assertRestaurantOverflowRegions(restaurants);
  assert.match(source, /\.restaurant-mock-scroll:focus-visible\s*\{/);

  const withoutFirstTabStop = restaurants.replace(
    /(<div class="restaurant-mock-scroll"[^>]*?) tabindex="0"/,
    '$1',
  );
  assert.throws(() => assertRestaurantOverflowRegions(withoutFirstTabStop));
});

test('supplier solution page follows the approved story and uses two canonical join actions', () => {
  assert.ok(suppliersStart >= 0 && suppliersEnd > suppliersStart);
  assert.equal((suppliers.match(/<h1\b/g) || []).length, 1);
  assert.match(suppliers, />iFoodmap for Suppliers</);
  assert.match(suppliers, /<h1[^>]*>從商品上架到商機、報價與出貨<\/h1>/);
  assertSupplierApplicationCtas(suppliers);
  assert.match(suppliers, /href="#supplier-capabilities"/);

  const hero = suppliers.indexOf('從商品上架到商機、報價與出貨');
  const pains = suppliers.indexOf('好商品，不該埋沒在零散詢價裡');
  const workflow = suppliers.indexOf('從被看見，到報價、接單與持續經營');
  const capabilities = suppliers.indexOf('id="supplier-capabilities"');
  const outcomes = suppliers.indexOf('供應商經營的成果參考');
  const finalCta = suppliers.lastIndexOf('免費申請供應商上架');
  assert.ok(hero >= 0 && pains > hero);
  assert.ok(workflow > pains && capabilities > workflow);
  assert.ok(outcomes > capabilities && finalCta > outcomes);
});

test('supplier page names four pains and an accurate lead-to-relationship workflow', () => {
  for (const pain of [
    '需求分散，難以及時發現',
    '報價與交期反覆確認',
    '定價缺少市場依據',
    '客戶回購狀況難掌握',
  ]) {
    assert.match(suppliers, new RegExp(pain));
  }
  for (const step of ['建立商品目錄', '接收匹配商機', '回覆報價並確認訂單', '出貨並累積客戶關係']) {
    assert.match(suppliers, new RegExp(step));
  }
});

test('supplier page presents four product-grounded capabilities with semantic example mockups', () => {
  assertSupplierCapabilities(suppliers);
  assertSupplierCapabilityOrder(suppliers);
  for (const detail of [
    '需求單自動媒合',
    '品項缺口分析',
    '近 90 天',
    '回覆報價',
    '交期、付款條件與替代品項',
    '待確認',
    '確認出貨',
    '同區同品項行情',
    '下週備貨建議',
    '近 13 週需求量趨勢',
    '下單頻率',
    '回購狀況',
    '可能流失',
    '交易評價',
    '商店評價',
  ]) {
    assert.match(suppliers, new RegExp(detail));
  }
  assert.equal((suppliers.match(/產品功能示意畫面 · 示例資料/g) || []).length, 4);
  for (const id of [
    'supplier-leads-title',
    'supplier-quotes-title',
    'supplier-pricing-title',
    'supplier-customers-title',
  ]) {
    assert.match(suppliers, new RegExp(`<article[^>]+aria-labelledby="${id}"`));
  }
});

test('supplier capability order guard fails when adjacent capabilities are swapped', () => {
  const leadsStart = suppliers.indexOf('<article class="supplier-capability"');
  const quotesStart = suppliers.indexOf('<article class="supplier-capability supplier-capability--reverse"', leadsStart);
  const pricingStart = suppliers.indexOf('<article class="supplier-capability"', quotesStart + 1);
  const leads = suppliers.slice(leadsStart, quotesStart);
  const quotes = suppliers.slice(quotesStart, pricingStart);
  const swapped = suppliers.slice(0, leadsStart) + quotes + leads + suppliers.slice(pricingStart);
  assert.throws(() => assertSupplierCapabilityOrder(swapped));
});

test('supplier outcomes distinguish public metrics from examples and include a qualifier', () => {
  for (const metric of ['2,500+', '28 類', '24hr']) {
    assert.match(suppliers, new RegExp(metric.replace('+', '\\+')));
  }
  assert.match(suppliers, /平台現有公開數據/);
  assert.match(suppliers, /示例資料，非特定客戶實績/);
  assert.match(suppliers, /成果依品項、服務區域、供應能力與執行期間而異。/);
});

test('supplier fragment excludes placeholders and unsupported automation claims', () => {
  assert.doesNotMatch(suppliers, /頁面準備中|repeating-linear-gradient/);
  assert.doesNotMatch(suppliers, /\[[^\]]*(?:介面|示意|實拍)[^\]]*\]/);
  assert.doesNotMatch(suppliers, /ERP|LINE@|自動接單|自動報價|自動出貨|保證成交|即時預測/);
});

test('supplier content guards fail if capabilities or either join action are removed', () => {
  const withoutCapabilities = suppliers.replace(
    /<section[^>]+id="supplier-capabilities"[\s\S]*?<\/section>/,
    '',
  );
  const withoutFirstCta = suppliers.replace(
    /<a[^>]+href="\{\{\s*supplierApplicationUrl\s*\}\}"[^>]*>免費申請供應商上架<\/a>/,
    '',
  );
  assert.throws(() => assertSupplierCapabilities(withoutCapabilities));
  assert.throws(() => assertSupplierApplicationCtas(withoutFirstCta));
});

test('supplier in-page capability target and keyboard-scrollable mockups are accessible', () => {
  assert.match(source, /#supplier-capabilities\s*\{[^}]*scroll-margin-top:\s*96px/s);
  assertSupplierOverflowRegions(suppliers);
  assert.match(source, /\.supplier-mock-scroll:focus-visible\s*\{/);

  const withoutFirstTabStop = suppliers.replace(
    /(<div class="supplier-mock-scroll"[^>]*?) tabindex="0"/,
    '$1',
  );
  assert.throws(() => assertSupplierOverflowRegions(withoutFirstTabStop));
});

test('site shell exposes one header, labelled desktop and mobile navigation, and one footer', () => {
  assert.equal((source.match(/<header\b/g) || []).length, 1);
  assert.equal((source.match(/<\/header>/g) || []).length, 1);
  assert.equal((source.match(/<footer\b/g) || []).length, 1);
  assert.equal((source.match(/<\/footer>/g) || []).length, 1);
  assert.match(source, /<nav aria-label="主要導覽"[^>]*>/);
  assert.match(source, /document\.createElement\('nav'\)/);
  assert.match(source, /menu\.setAttribute\('aria-label', '行動版主選單'\)/);

  const headerEnd = source.indexOf('</header>');
  const mainStart = source.indexOf('<main id="main-content"');
  const mainEnd = source.indexOf('</main>', mainStart);
  const footerStart = source.indexOf('<footer');
  assert.ok(headerEnd >= 0 && mainStart > headerEnd);
  assert.ok(mainEnd > mainStart && footerStart > mainEnd);
});

test('supporting pages use one H1 each and contain no placeholder content', () => {
  for (const [name, fragment] of [['cases', cases], ['about', about], ['contact', contact]]) {
    assert.ok(fragment.length > 0, `${name} fragment exists`);
    assert.equal((fragment.match(/<h1\b/g) || []).length, 1, `${name} has one H1`);
    assert.doesNotMatch(fragment, /頁面準備中|合作夥伴 \d|媒體 \d|\[[^\]]*(?:實拍|介面|示意)[^\]]*\]/);
  }
});

test('cases page preserves approved evidence and distinguishes restaurant and supplier outcomes', () => {
  assert.match(cases, /<h1[^>]*>餐廳與供應商，如何一起改善採購成果<\/h1>/);
  assertApprovedCases(cases);
  assert.match(cases, /餐廳端成果/);
  assert.match(cases, /供應商合作成果/);
  assert.match(cases, /改善層級/);
  assert.equal((cases.match(/成果依業態、採購規模與執行期間而異。/g) || []).length, 1);
  assert.doesNotMatch(cases, /保證(?:降低|提升|成交|達成)|一定(?:降低|提升|成交)/);
});

test('about page explains the two-sided platform and retains exactly three approved values', () => {
  assert.match(about, /<h1[^>]*>讓餐廳需求與供應能力，更有效率地相遇<\/h1>/);
  assert.match(about, /雙邊 B2B 食材採購平台/);
  assert.match(about, /餐廳/);
  assert.match(about, /供應商/);
  for (const value of ['高效媒合', '公平透明', '在地永續']) {
    assert.match(about, new RegExp(`<h3[^>]*>${value}<\\/h3>`));
  }
  assert.equal((about.match(/class="about-value-card"/g) || []).length, 3);
  assert.doesNotMatch(about, /成立於|團隊成員|合作夥伴|媒體報導/);
});

test('contact page retains delegated lead contract and exposes accessible fields and status', () => {
  assert.equal((contact.match(/填寫食材需求/g) || []).length, 1);
  assert.match(contact, /<h2 id="demand-form-title"[^>]*>填寫食材需求<\/h2>/);
  assert.match(contact, /role="form" aria-labelledby="demand-form-title"/);
  for (const id of ['company-name', 'contact-phone', 'contact-line', 'needed-items', 'need-detail']) {
    assert.match(contact, new RegExp(`<label[^>]+for="${id}"`));
    assert.match(contact, new RegExp(`<(?:input|textarea)[^>]+id="${id}"`));
  }
  assert.match(contact, /role="button"[^>]+tabindex="0"[^>]+aria-live="polite"/);
  assert.match(source, /\/rest\/v1\/landing_leads/);
  assert.match(source, /function findDemandCard\(node\)/);
  assert.match(source, /h\.textContent\.indexOf\('填寫食材需求'\)/);
  for (const endpoint of ['/api/ai-chat', '/api/ai-menu', '/api/ai-extract']) {
    assert.match(source, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
});

test('metadata consistently describes the approved two-sided platform', () => {
  const title = 'iFoodmap 食材地圖｜餐廳與供應商的 B2B 食材採購平台';
  const description = 'iFoodmap 以 AI 串接餐廳需求與全台食材供應商，整合智慧媒合、報價比較、訂單、出貨與採購管理。';
  assert.match(source, new RegExp(`<title>${title}<\\/title>`));
  assert.match(source, new RegExp(`<meta name="description" content="${description}">`));
  assert.match(source, new RegExp(`<meta property="og:title" content="${title}">`));
  assert.match(source, new RegExp(`<meta property="og:description" content="${description}">`));
  assert.match(source, new RegExp(`<meta name="twitter:title" content="${title}">`));
  assert.match(source, new RegExp(`<meta name="twitter:description" content="${description}">`));
  assert.match(source, /<link rel="canonical" href="https:\/\/ifoodmap-landing\.vercel\.app\/">/);
});

test('footer has four useful audiences with real internal and product destinations', () => {
  for (const group of ['餐廳', '供應商', '公司', '客服']) {
    assert.match(footer, new RegExp(`<div[^>]+class="footer-group-title"[^>]*>${group}<\\/div>`));
  }
  for (const route of ['/restaurants', '/suppliers', '/cases', '/about', '/contact']) {
    assert.match(footer, new RegExp(`href="${route}"`));
  }
  assert.match(footer, /href="\{\{\s*restaurantRegistrationUrl\s*\}\}"/);
  assert.match(footer, /href="\{\{\s*supplierApplicationUrl\s*\}\}"/);
  assert.match(footer, /href="\{\{\s*loginUrl\s*\}\}"/);
  assert.doesNotMatch(footer, /<span[^>]*>(?:常見問題|使用條款)<\/span>/);
});

test('AI dialog closed and open states are keyboard-safe with mutation-sensitive guards', () => {
  assertAiDialogLifecycle(source);
  assert.throws(() => assertAiDialogLifecycle(source.replace("panel.inert = true;", '')));
  assert.throws(() => assertAiDialogLifecycle(source.replace("panel.removeAttribute('aria-hidden');", '')));
  assert.throws(() => assertAiDialogLifecycle(source.replace("if (e.key === 'Escape')", "if (e.key === 'Never')")));
  assert.throws(() => assertAiDialogLifecycle(source.replace("if (e.key !== 'Tab') return;", '')));
});
