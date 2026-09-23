const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// bento 不規則排版的「幾何前提」測試。
//
// 為什麼要有這一支:2026-09-23 線上真的出過卡片互相疊在一起的 bug。
// 原因不是 markup 寫錯,是 CSS 的兩個數字互相矛盾:
//     .ifm-bento { gap:22px }   .bt-rise { margin-top:-44px }
// grid 的列距只有 22px,但 rise 卡往上位移 44px —— 多出來的 22px 直接戳進上一列。
// 只要上下兩列有任何一張卡共用欄位(例如 bt-7 在欄 6–12、下一列 bt-7 在欄 1–7,
// 共用欄 6–7),那兩張卡就會實際重疊 22px。四個頁面共八組,CSS 不會報錯、
// 測試當時也抓不到,只有用瀏覽器量 getBoundingClientRect() 的交集才看得見。
//
// 這支測試把那個幾何前提釘死,讓人改 gap 或改位移時立刻失敗。
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function bentoBlock() {
  const i = source.indexOf('.ifm-bento {');
  assert.ok(i > -1, '找不到 .ifm-bento 規則');
  return source.slice(i, i + 1200);
}

test('bento 的 gap 由 --bt-gap 提供(位移才能綁在同一個數字上)', () => {
  const block = bentoBlock();
  assert.match(block, /--bt-gap:\s*(\d+)px/, '.ifm-bento 必須定義 --bt-gap');
  assert.match(block, /gap:\s*var\(--bt-gap\)/, 'gap 必須讀 var(--bt-gap),不要另外寫死數字');
});

test('bt-rise 的負位移必須小於 gap,否則卡片會戳進上一列', () => {
  const block = bentoBlock();
  const gap = Number(block.match(/--bt-gap:\s*(\d+)px/)[1]);

  const riseRule = source.match(/\.bt-rise\s*\{([^}]*)\}/);
  assert.ok(riseRule, '找不到 .bt-rise 規則');
  const rise = riseRule[1];

  // 允許兩種寫法:綁比例(推薦,改 gap 不會算錯)或直接寫死 px。
  const ratio = rise.match(/calc\(\s*var\(--bt-gap\)\s*\*\s*-?([\d.]+)\s*\)/);
  const fixed = rise.match(/margin-top:\s*-(\d+(?:\.\d+)?)px/);

  let riseAmount;
  if (ratio) {
    riseAmount = gap * Number(ratio[1]);
    assert.ok(Number(ratio[1]) < 1,
      `bt-rise 的比例是 ${ratio[1]},必須 < 1 才保證小於 gap`);
  } else {
    assert.ok(fixed, '.bt-rise 必須是 calc(var(--bt-gap) * -n) 或 margin-top:-Npx');
    riseAmount = Number(fixed[1]);
  }

  assert.ok(riseAmount < gap,
    `bt-rise 往上位移 ${riseAmount}px 但列距只有 ${gap}px —— ` +
    `會戳進上一列 ${(riseAmount - gap).toFixed(1)}px,共用欄位的卡片就會重疊`);
});

test('bt-drop 是正值(往下推不會影響上一列,列高會自己長高)', () => {
  const dropRule = source.match(/\.bt-drop\s*\{([^}]*)\}/);
  assert.ok(dropRule, '找不到 .bt-drop 規則');
  assert.doesNotMatch(dropRule[1], /margin-top:\s*-/,
    'bt-drop 不可以是負值 —— 那等於另一個 bt-rise,會有一樣的重疊問題');
});

test('markup 用到的每個 bt-N 都要有對應的 CSS 規則', () => {
  // 踩過:bt-3 被用在 markup 但 CSS 沒定義,那些卡靜默縮成一欄寬、文字被擠成直書。
  const used = new Set();
  for (const m of source.matchAll(/\bbt-(\d+)\b/g)) used.add(m[1]);
  for (const n of used) {
    assert.match(source, new RegExp(`\\.bt-${n}\\s*\\{[^}]*grid-column`),
      `markup 用了 bt-${n},但 CSS 沒有 .bt-${n} 的 grid-column 規則`);
  }
});

test('手機版把位移歸零(窄螢幕錯落只會變成莫名其妙的空白)', () => {
  assert.match(source, /\.bt-rise,\s*\.bt-drop\s*\{\s*margin-top:\s*0/,
    '手機 media query 裡要有 .bt-rise, .bt-drop { margin-top:0 }');
});
