'use strict';

// index.html 的 markup 已經全面改成 {{ L.xxx.yyy }} 綁定。
// 這支 helper 把綁定用指定語系的字典值代回去,還原成「使用者真的會看到的那份 HTML」。
// 既有的中文文案斷言因此可以原封不動跑在 renderMarkup('zh') 上 —— 強度不變。
const fs = require('node:fs');
const path = require('node:path');

const { dict } = require('../../i18n.js');

const INDEX_PATH = path.resolve(__dirname, '..', '..', 'index.html');
const BINDING = /\{\{ L\.([A-Za-z0-9_.]+) \}\}/g;

const rawSource = fs.readFileSync(INDEX_PATH, 'utf8');

// 綁定只存在於 markup。<script> 裡的 {{ }} 不會被樣板引擎插值(那裡是 JS,
// 目前唯一一處是元件 script 開頭的註解在示範綁定語法),所以掃描時整段跳過。
const scriptRanges = (() => {
  const ranges = [];
  const openTag = /<script\b[^>]*>/g;
  let match;
  while ((match = openTag.exec(rawSource))) {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = rawSource.indexOf('</script>', bodyStart);
    ranges.push([bodyStart, bodyEnd === -1 ? rawSource.length : bodyEnd]);
  }
  return ranges;
})();

function insideScript(index) {
  return scriptRanges.some(([start, end]) => index >= start && index < end);
}

function lookup(values, keyPath) {
  return keyPath.split('.').reduce(
    (node, key) => (node == null ? undefined : node[key]),
    values,
  );
}

const cache = new Map();

// 讀 index.html,把 markup 裡每個 {{ L.x.y }} 換成 dict(lang) 的值,回傳字串。
// 任何一個 key 在字典裡查不到(或不是字串)就直接丟錯 —— 那正是「畫面上那行字消失」的成因,
// 不能靜靜地留著 {{ }} 佔位字串混過去。
function renderMarkup(lang) {
  if (cache.has(lang)) return cache.get(lang);

  const values = dict(lang);
  const missing = [];
  const rendered = rawSource.replace(BINDING, (whole, keyPath, offset) => {
    if (insideScript(offset)) return whole;
    const value = lookup(values, keyPath);
    if (typeof value !== 'string') {
      missing.push(keyPath);
      return whole;
    }
    return value;
  });

  if (missing.length) {
    throw new Error(
      `dict('${lang}') 少了 ${missing.length} 個 markup 綁定的 key: ${[...new Set(missing)].join(', ')}`,
    );
  }

  cache.set(lang, rendered);
  return rendered;
}

// markup 裡出現過的每一個 L.* key(去重、保留原始順序)
function bindingKeys() {
  const keys = [];
  const scan = new RegExp(BINDING.source, 'g');
  let match;
  while ((match = scan.exec(rawSource))) {
    if (insideScript(match.index)) continue;
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

module.exports = { INDEX_PATH, bindingKeys, rawSource, renderMarkup };
