const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { dict } = require('../i18n.js');
const { renderMarkup } = require('./helpers/render.cjs');

// 站上文案已經全面改走字典(markup 綁 {{ L.x.y }},值在 i18n.js)。
// 把 zh 字典的值代回 markup,就還原成「中文版使用者真的看到的那份 HTML」——
// 底下每一條既有的中文文案斷言都原封不動跑在它上面,強度不變。
// 元件 script 不含綁定,渲染前後逐字相同,所以程式碼層的斷言一樣用 source。
const source = renderMarkup('zh');
// 首頁那些資料陣列(stats / flow / audiences / …)已經從 renderVals() 搬進字典
const homeData = dict('zh').home.data;
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

function assertHomeMetricsAndWorkflow(fragment, data) {
  // 數字目標仍在元件原始碼(不是文案);標籤與六步流程的文字已搬進字典
  for (const metric of ["target: 3000, suffix: '+'", "target: 12000, suffix: '+'", "target: 28"]) {
    assert.ok(fragment.includes(metric), `missing metric ${metric}`);
  }
  assert.deepEqual(data.stats, ['合作供應商（示意）', '累積媒合需求（示意）', '食材分類', '配送涵蓋']);
  assert.equal(data.statsNationwide, '全台');
  assert.deepEqual(
    data.flow.map((step) => step.title),
    ['填需求', '系統媒合', '收到報價', '比較洽談', '下單進貨', '雙邊評價'],
  );
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
    /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>建立餐廳帳號<\/a>/,
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
    /<a[^>]+href="\{\{\s*supplierApplicationUrl\s*\}\}"[^>]*>申請供應商上架<\/a>/g,
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
  // 登入平台不再放 header,改在 footer;手機選單則帶主要 CTA
  assert.match(fragment, /href="\{\{\s*loginUrl\s*\}\}"[^>]*>登入平台<\/a>/);
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
  assert.match(fragment, /var appRoot = document\.getElementById\('dc-root'\)/);
  assert.match(fragment, /appRoot\.inert = true/);
  assert.match(fragment, /appRoot\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(fragment, /backdrop\.classList\.add\('ai-show'\)/);
  assert.match(fragment, /appRoot\.inert = appRootWasInert/);
  assert.match(fragment, /appRoot\.removeAttribute\('aria-hidden'\)/);
  assert.match(fragment, /backdrop\.classList\.remove\('ai-show'\)/);
}

function assertAiAnnouncements(fragment) {
  // AI 助手的文案已經改由 txt() 依語系填,所以這裡只釘結構與宣告順序,不釘字串內容
  assert.match(fragment, /<label for="ai-assistant-input" class="ai-sr-only">/);
  assert.match(fragment, /<input id="ai-assistant-input"[^>]+class="ai-text"/);
  assert.match(fragment, /body\.setAttribute\('role', 'log'\)/);
  assert.match(fragment, /body\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(fragment, /body\.setAttribute\('aria-relevant', 'additions'\)/);
  assert.match(fragment, /body\.setAttribute\('aria-atomic', 'false'\)/);
  // 開場白要在 live region 宣告之前就進 DOM,否則一開頁就被念一次
  const greeting = fragment.indexOf("addMsg('bot'");
  const liveRegion = fragment.indexOf("body.setAttribute('aria-live', 'polite')");
  assert.ok(greeting >= 0 && liveRegion > greeting);
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

const componentStart = source.indexOf('<script type="text/x-dc" data-dc-script>');
const componentEnd = source.indexOf('</script>', componentStart);
const component = source.slice(componentStart, componentEnd);

// 圖片路徑、編號、日期這些「不是文字」的東西留在元件裡,靠陣列 index 跟字典對齊。
// 兩邊長度一旦不同,首頁就會少一格或多一格空白卡片 —— tests/i18n.test.cjs 會逐一擋。
function constArray(name) {
  const match = component.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `missing const ${name} in component script`);
  return Array.from(match[1].matchAll(/'([^']*)'/g), (m) => m[1]);
}
const categoryImgs = () => constArray('CATEGORY_IMGS');
const mobileMenuStart = header.indexOf('<sc-if value="{{ menuOpen }}">');
const mobileMenu = header.slice(mobileMenuStart, header.indexOf('</sc-if>', mobileMenuStart));

test('homepage presents the design-approved hero: rotating headline, subtitle, search and promises', () => {
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  assert.match(home, /B2B MATCHING ENGINE/);
  assert.match(home, /<h1[^>]*>\s*免費找到<span[^>]*>\{\{\s*rotating\s*\}\}<\/span>\s*<\/h1>/);
  assert.deepEqual(homeData.rotating, ['所有食材', '對的供應商', '第二家報價', '產地直送的好貨']);
  assert.match(home, /餐廳、團膳、學校、團購主都適用。<br>填一次需求，供應商主動來找你。/);
  assert.match(home, /placeholder="搜尋食材，例如：有機葉菜、火鍋肉片"/);
  assert.deepEqual(homeData.heroPromises, ['完全免費', '成交不抽成', '平均 4 小時有回覆']);
  assert.deepEqual(homeData.hotTags, ['蔬菜', '水果', '豬肉', '牛肉', '火鍋料', '米麵']);
  assert.match(component, /hotTags: list\('hotTags'\)\.map\(/);
  // 搜尋列與分類籤都要接進 AI 助手,不能是死的裝飾
  assert.match(home, /<form onSubmit="\{\{\s*askAI\s*\}\}" role="search"/);
  assert.match(home, /<button type="button" onClick="\{\{\s*t\.ask\s*\}\}"/);
  assert.match(source, /window\.IfmAI = \{/);
  assert.match(component, /handToAI\(keyword\) \{/);
  assert.match(header, /<a[^>]+href="\{\{\s*hrefContact\s*\}\}"[^>]*>填寫食材需求<\/a>/);
});

test('homepage hero draws the world map with d3 centred on Taiwan', () => {
  assert.match(source, /<script src="https:\/\/unpkg\.com\/d3@7\.9\.0\/dist\/d3\.min\.js"[^>]*integrity="sha384-[^"]+"/);
  assert.match(source, /<script src="https:\/\/unpkg\.com\/topojson-client@3\.1\.0\/dist\/topojson-client\.min\.js"[^>]*integrity="sha384-[^"]+"/);
  assert.match(home, /<div ref="\{\{\s*mapRef\s*\}\}" aria-hidden="true"/);
  assert.match(component, /world-atlas@2\.0\.2\/countries-110m\.json/);
  assert.match(component, /geoNaturalEarth1\(\)\.rotate\(\[-121, 0\]\)/);
  assert.match(component, /catch \(e\) \{/); // 地圖載不到不能讓頁面掛掉
});

test('public copy removes free registration and listing claims but keeps free matching', () => {
  assert.doesNotMatch(
    source,
    /餐廳免費註冊|免費建立餐廳帳號|供應商免費上架|免費申請供應商上架|免費上架申請|不收上架費|零成本/,
  );
  assert.match(source, /免費媒合|免費找到/);
});

test('product links derive from one canonical product base URL', () => {
  assert.equal((source.match(/https:\/\/dish-to-supply\.vercel\.app/g) || []).length, 1);
  assert.match(source, /IFM_PRODUCT_BASE_URL\s*=\s*'https:\/\/dish-to-supply\.vercel\.app'/);
  assert.match(source, /const productBaseUrl = window\.IFM_PRODUCT_BASE_URL;/);
  assert.match(source, /restaurantRegistrationUrl:\s*productBaseUrl \+ '\/register\/restaurant'/);
  assert.match(source, /supplierApplicationUrl:\s*productBaseUrl \+ '\/join'/);
  assert.match(source, /loginUrl:\s*productBaseUrl \+ '\/'/);
  assert.match(home, /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>免費註冊會員<\/a>/);
  assertMobileLogin(footer);
});

test('homepage retains design metrics and explains the six-step workflow', () => {
  assertHomeMetricsAndWorkflow(component, homeData);
  assert.match(home, /<sc-for list="\{\{\s*flowA\s*\}\}"/);
  assert.match(home, /<sc-for list="\{\{\s*flowB\s*\}\}"/);
  assert.match(home, /從需求到進貨，<span[^>]*>一條龍<\/span>/);
});

test('homepage names four audiences, twelve categories and three trust features from the design', () => {
  assert.deepEqual(
    homeData.audiences.map((audience) => audience.title),
    ['餐廳・餐酒館', '團膳・學校', '團購主・電商', '加工廠・通路'],
  );
  assert.deepEqual(
    homeData.categories,
    ['蔬菜', '水果', '海鮮', '肉品', '蛋品', '五穀雜糧', '南北雜貨', '加工食品', '火鍋料', '調味品', '酒與飲品', '包材耗材'],
  );
  // 分類文字住字典、圖片住元件,靠 index 對齊 —— 兩邊都要在,而且圖是 root-absolute
  assert.equal(categoryImgs().length, homeData.categories.length);
  for (const img of categoryImgs()) assert.match(img, /^\/assets\/cat-[a-z]+\.svg$/);
  assert.deepEqual(
    homeData.trust.map((feature) => feature.title),
    ['雙邊評價機制', '標章與檢驗連動', 'LINE 即時通知'],
  );
  assert.match(home, /任何有食材需求的人，<br>都適用/);
  assert.match(home, /過去找食材，<br>永遠是那幾家/);
});

test('homepage illustrations are real files and no design placeholder text leaks through', () => {
  const referenced = new Set([
    ...constArray('FLOW_IMGS'),
    ...constArray('CATEGORY_IMGS'),
    ...constArray('ARTICLE_IMGS'),
  ]);
  assert.ok(referenced.size >= 21, `expected 21 illustrations, found ${referenced.size}`);
  for (const absolute of referenced) {
    // root-absolute 才行:/en/xxx 底下 base 會變成 /en/,相對路徑會 404
    assert.match(absolute, /^\/assets\//, `illustration must be root-absolute: ${absolute}`);
    const rel = absolute.slice(1);
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', rel)), `missing illustration ${rel}`);
  }
  for (const placeholder of ['插圖：', '文章封面', '[ 餐廳採購情境照 ]', '[ 供應商出貨情境照 ]', '截圖']) {
    assert.ok(!home.includes(placeholder), `placeholder leaked: ${placeholder}`);
  }
  // 圖片都是裝飾,交給旁邊的文字說明
  assert.equal((home.match(/<img /g) || []).length, (home.match(/<img [^>]*alt=""/g) || []).length);
});

test('homepage shows three testimonials and three articles, then the closing CTA', () => {
  assert.deepEqual(homeData.testimonials.map((t) => t.who), ['林老闆', '陳主任', '王小姐']);
  assert.deepEqual(
    homeData.articlesTop.map((a) => a.title),
    ['如何做好餐飲食材採購：從規格書到驗收', '了解產銷履歷，加入溯源餐廳的行列', '使用在地食材，邁向從產地到餐桌'],
  );
  const news = home.indexOf('id="news"');
  const closing = home.indexOf('免費找到所有食材，<br>從填一張需求單開始');
  assert.ok(news >= 0 && closing > news);
  assert.match(home, /<section[^>]+id="how-it-works"[^>]*scroll-margin-top/);
  assert.match(home, /<section[^>]+id="news"[^>]*scroll-margin-top/);
});

test('mobile menu mirrors desktop destinations and the legacy drawer is no longer mounted', () => {
  // 內部連結的 href 現在一律是 {{ href* }} 綁定(才會帶語系前綴),所以比對「綁定名 + 文字」
  const linkPattern = /<a href="\{\{ (\w+) \}\}"[^>]*>([^<]+)<\/a>/g;
  const desktopLinks = Array.from(header.slice(0, mobileMenuStart).matchAll(linkPattern))
    .filter((m) => m[2] !== '食材地圖');
  const mobileLinks = Array.from(mobileMenu.matchAll(linkPattern));
  assert.equal(desktopLinks.length, 9); // 7 nav + 語言切換 + CTA
  assert.equal(mobileLinks.length, 9);
  assert.deepEqual(desktopLinks.map((m) => m[1] + m[2]), mobileLinks.map((m) => m[1] + m[2]));
  assert.match(header, /aria-expanded="\{\{\s*menuOpen\s*\}\}"/);
  assert.match(header, /aria-controls="ifm-mobile-menu"/);
  // 舊的注入式漢堡選單保留程式碼但不再掛到 body
  assert.doesNotMatch(drawer, /document\.body\.appendChild\(btn\);/);
  assert.doesNotMatch(drawer, /document\.body\.appendChild\(menu\);/);
});

test('content guards fail when home metrics or home workflow are removed', () => {
  assert.throws(() => assertHomeMetricsAndWorkflow(component.replace("target: 12000, suffix: '+'", ''), homeData));
  const renamedStep = {
    ...homeData,
    flow: homeData.flow.map((step) => (step.title === '系統媒合' ? { ...step, title: '媒合' } : step)),
  };
  assert.throws(() => assertHomeMetricsAndWorkflow(component, renamedStep));
  assert.throws(() => assertMobileLogin(footer.replace(/href="\{\{\s*loginUrl\s*\}\}"/, 'href="/"')));
});

test('small homepage labels meet WCAG AA contrast on the design palette', () => {
  // 設計稿用到的小字配色,全部量一次
  for (const [fg, bg] of [
    ['#5E6E65', '#FFFFFF'], // hero 標籤、卡片小字
    ['#4B5A52', '#FFFFFF'], // 內文
    ['#4B5A52', '#F7F9F8'], // 內文 on 灰底
    ['#0B6B40', '#F7F9F8'], // kicker
    ['#AFC0B6', '#0E1A14'], // 深色段內文
    ['#7FA490', '#0E1A14'], // 深色段 kicker
    ['#4E7460', '#EFF6F2'], // 流程卡文字
    ['#8A6118', '#FBF3E5'], // 流程卡文字(琥珀)
  ]) {
    assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
  }
  // 品牌綠 #128A54 在白底只有 ~4.3,不能當 13px 以下的文字色;只允許用在 aria-hidden 的裝飾符號(例如箭頭)
  const smallBrandGreen = Array.from(home.matchAll(/<[a-z]+[^>]*style="(?=[^"]*font-size:1[0-3](?:\.5)?px)(?=[^"]*color:#128A54)[^"]*"[^>]*>/g)).map((m) => m[0]);
  for (const tag of smallBrandGreen) assert.match(tag, /aria-hidden="true"/, `small brand-green text must be decorative: ${tag}`);
});

test('homepage CTAs expose stable focus, touch, responsive and reduced-motion rules', () => {
  assert.match(source, /\.platform-action:focus-visible/);
  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /@media\s*\(max-width:\s*768px\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(header, /min-height:48px/); // 手機選單項目的觸控高度
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
  const finalCta = restaurants.lastIndexOf('建立餐廳帳號');
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
    /<a[^>]+href="\{\{\s*restaurantRegistrationUrl\s*\}\}"[^>]*>建立餐廳帳號<\/a>/g,
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
  const finalCta = suppliers.lastIndexOf('申請供應商上架');
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
    /<a[^>]+href="\{\{\s*supplierApplicationUrl\s*\}\}"[^>]*>申請供應商上架<\/a>/,
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
  assert.match(contact, /<form[^>]+aria-labelledby="demand-form-title"[^>]+novalidate/);
  for (const id of ['company-name', 'contact-phone', 'contact-line', 'needed-items', 'need-detail']) {
    assert.match(contact, new RegExp(`<label[^>]+for="${id}"`));
    assert.match(contact, new RegExp(`<(?:input|textarea)[^>]+id="${id}"`));
  }
  assert.match(contact, /<input[^>]+id="contact-phone"[^>]+type="tel"/);
  assert.match(contact, /<button class="contact-submit" type="submit"[^>]+aria-live="polite"/);
  // 表單送出後由 index.html 尾端那段 script 寫進 Supabase。那段 script 正在被中英化改寫,
  // 所以合約釘在 markup 這邊「script 必須認得出來的錨點」:標題 id、欄位 name、送出鈕 class。
  assert.match(contact, /<form[^>]+aria-labelledby="demand-form-title"/);
  for (const field of ['company_name', 'contact_phone', 'contact_line', 'items_text', 'detail']) {
    assert.match(contact, new RegExp(`<(?:input|textarea)[^>]+name="${field}"`));
  }
  assert.equal((contact.match(/class="contact-submit"/g) || []).length, 1);
});

test('lead capture actually reaches Supabase and does not depend on any display text', () => {
  // 這幾條原本因為尾端 script 正在改寫而暫時拿掉,現在改完了補回來。
  // 需求單與 AI 助手的留名都要寫進 landing_leads,而且匿名寫入一定要 return=minimal ——
  // landing_leads 沒有 SELECT 政策,帶 RETURNING 會被 RLS 擋成 42501。
  assert.equal((source.match(/\/rest\/v1\/landing_leads/g) || []).length, 2);
  assert.equal((source.match(/'Prefer': 'return=minimal'/g) || []).length, 2);

  // 🔴 表單定位只能靠 id,不能靠畫面上的字。以前是比對「填寫食材需求」,
  // 英文版標題變成 Post a Request 之後會靜默失效、lead 直接收不到。
  assert.match(source, /el\.querySelector\('#demand-form-title'\)/);
  assert.doesNotMatch(source, /textContent\.indexOf\('填寫食材需求'\)/);

  // 順帶擋住同一類的回頭路:不准再用「比對畫面文字」來找元素
  const textMatchers = source.match(/textContent\.indexOf\('[^']*[\u4e00-\u9fff][^']*'\)/g) || [];
  assert.deepEqual(textMatchers, [], `不可用中文字面值定位元素:${textMatchers.join(', ')}`);
});

test('AI assistant calls all three proxy endpoints and always tells them the language', () => {
  for (const endpoint of ['/api/ai-chat', '/api/ai-menu', '/api/ai-extract']) {
    assert.match(source, new RegExp(endpoint.replace(/\//g, '\\/')), `缺少 ${endpoint}`);
  }
  // 每一個 request payload 都要帶 lang,否則英文訪客會拿到中文回覆 / 中文品名
  const payloads = source.match(/postJSON\('\/api\/ai-[a-z]+',\s*\{[^}]*\}/g) || [];
  assert.ok(payloads.length >= 2, '找不到 postJSON 的 AI 請求');
  for (const payload of payloads) {
    assert.match(payload, /lang:\s*curLang\(\)/, `這個請求沒帶 lang:${payload.slice(0, 80)}`);
  }
  // 直接用 fetch / sendBeacon 送的那兩個 ai-extract 也要帶
  assert.equal((source.match(/\{ messages: conv, lang: curLang\(\) \}/g) || []).length, 2);
  // lang 必須是「呼叫當下才取」的函式,不能是開機時抓一次存起來的變數
  assert.match(source, /function curLang\(\)[\s\S]{0,200}IfmI18n[\s\S]{0,80}current\(window\)/);
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

test('small contact and footer copy meets deterministic WCAG AA contrast', () => {
  assert.ok(contrastRatio('#5b6b62', '#ffffff') >= 4.5);
  assert.doesNotMatch(contact, /font-size:13px;color:#8a9a8f/);
  assert.match(contact, /font-size:13px;color:#5b6b62/);
  // footer:連結 13.5px 與版權/標籤 10.5–12px 兩種小字都要過 AA
  assert.ok(contrastRatio('#9FB0A6', '#0E1A14') >= 4.5);
  assert.ok(contrastRatio('#71867A', '#0E1A14') >= 4.5);
  assert.doesNotMatch(footer, /color:#6D8276/); // 設計稿原色 4.34,差一點不到 AA
  assert.match(footer, /font-size:13\.5px;text-decoration:none;font-weight:300/);
  assert.match(footer, /font-size:12px;color:#71867A/);
});

test('footer has three design columns with real internal and product destinations', () => {
  for (const group of ['SERVICE', 'COMPANY', 'SUPPORT']) {
    assert.match(footer, new RegExp(`<div[^>]*>${group}<\\/div>`));
  }
  // 內部連結走 {{ href* }} 綁定才會帶語系前綴;寫死 /restaurants 的話英文頁會跳回中文站
  for (const binding of ['hrefRestaurants', 'hrefSuppliers', 'hrefCases', 'hrefAbout', 'hrefContact']) {
    assert.match(footer, new RegExp(`<a href="\\{\\{ ${binding} \\}\\}"`));
  }
  assert.match(footer, /href="\{\{\s*loginUrl\s*\}\}"[^>]*>登入平台<\/a>/);
  assert.doesNotMatch(footer, /<span[^>]*>(?:常見問題|使用條款)<\/span>/); // 不留假連結
  assert.match(footer, /href="tel:0277045539"/);
  assert.match(footer, /href="mailto:ifoodmaptw@gmail\.com"/);
});

test('AI dialog closed and open states are keyboard-safe with mutation-sensitive guards', () => {
  assertAiDialogLifecycle(source);
  assert.throws(() => assertAiDialogLifecycle(source.replace("panel.inert = true;", '')));
  assert.throws(() => assertAiDialogLifecycle(source.replace("panel.removeAttribute('aria-hidden');", '')));
  assert.throws(() => assertAiDialogLifecycle(source.replace("if (e.key === 'Escape')", "if (e.key === 'Never')")));
  assert.throws(() => assertAiDialogLifecycle(source.replace("if (e.key !== 'Tab') return;", '')));
  assert.throws(() => assertAiDialogLifecycle(source.replace("appRoot.inert = true;", '')));
  assert.throws(() => assertAiDialogLifecycle(source.replace("backdrop.classList.add('ai-show');", '')));
});

test('AI input has a persistent label and new messages use a non-repeating live log', () => {
  assertAiAnnouncements(source);
  assert.throws(() => assertAiAnnouncements(source.replace('for="ai-assistant-input"', '')));
  assert.throws(() => assertAiAnnouncements(source.replace("body.setAttribute('role', 'log');", '')));
  assert.throws(() => assertAiAnnouncements(source.replace("body.setAttribute('aria-relevant', 'additions');", '')));
});

test('reduced-motion mode removes drawer, scrim, hamburger and AI FAB transitions', () => {
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.m-menu,[\s\S]*?\.m-scrim,[\s\S]*?\.m-hamburger span[\s\S]*?transition:\s*none\s*!important/s,
  );
  assert.match(
    source,
    // 泡泡是靜態轉 45° 的大頭針造型;reduced-motion 只需拿掉 hover/open 的縮放動效,
    // 保留 rotate(45deg) 這個沒有動作的基礎變形,否則會變回正方形
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.ai-fab\s*\{[^}]*transition:\s*none\s*!important[^}]*\}[\s\S]*?\.ai-fab:hover,[\s\S]*?\.ai-fab\.ai-open\s*\{[^}]*transform:\s*(?:none|rotate\(45deg\))\s*!important/s,
  );
});
