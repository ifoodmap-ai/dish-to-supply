const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const homeStart = source.indexOf('<!-- ============ PAGE: HOME ============ -->');
const homeEnd = source.indexOf('<!-- ============ PAGE: RESTAURANTS ============ -->');
const home = source.slice(homeStart, homeEnd);

test('homepage presents the approved two-sided platform message and actions', () => {
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  assert.match(home, />AI 驅動的 B2B 食材採購平台</);
  assert.match(home, /<h1[^>]*>讓每一筆食材採購，都更快找到對的人<\/h1>/);
  assert.match(
    home,
    /iFoodmap 串接餐廳需求與全台食材供應商，從智慧媒合、報價比較到訂單管理，讓採購與接單都更有效率。/,
  );
  for (const label of ['餐廳免費註冊', '供應商免費上架', '登入平台']) {
    assert.match(source, new RegExp(label));
  }
});

test('product links derive from one canonical product base URL', () => {
  assert.match(source, /const productBaseUrl = 'https:\/\/dish-to-supply\.vercel\.app';/);
  assert.match(source, /restaurantRegistrationUrl:\s*productBaseUrl \+ '\/register\/restaurant'/);
  assert.match(source, /supplierApplicationUrl:\s*productBaseUrl \+ '\/join'/);
  assert.match(source, /loginUrl:\s*productBaseUrl \+ '\/'/);
  assert.match(home, /href="\{\{\s*restaurantRegistrationUrl\s*\}\}"/);
  assert.match(home, /href="\{\{\s*supplierApplicationUrl\s*\}\}"/);
  assert.doesNotMatch(home, /https:\/\/dish-to-supply\.vercel\.app/);
});

test('homepage retains approved metrics and explains the four-step workflow', () => {
  for (const metric of ['3,000+', '2,500+', '28 類', '24hr']) {
    assert.match(source, new RegExp(metric.replace('+', '\\+')));
  }
  for (const step of [
    '餐廳提出需求',
    'AI 標準化與媒合',
    '供應商線上報價',
    '完成採購與履歷',
  ]) {
    assert.match(source, new RegExp(step));
  }
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

test('homepage CTAs expose stable focus, touch, responsive and reduced-motion rules', () => {
  assert.match(source, /\.platform-action:focus-visible/);
  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /@media\s*\(max-width:\s*768px\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
