const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routing = require('../routing.js');

// 形象站正式網域(2026-09-29 起是業主的 ifoodmap.ai)。
// 程式裡網址只寫在 routing.js 的 publicBaseUrl;這支測試是刻意「再寫一次」的地方,
// 把 routing.js、index.html 靜態 <head>、vercel.json 轉址三邊釘在同一個值上,換網域漏改一處就會紅。
const OFFICIAL = 'https://ifoodmap.ai';
// Vercel 自動配給專案的網址。換網域之後它唯一的用途是 vercel.json 的轉址來源。
const OLD_HOST = 'ifoodmap-landing.vercel.app';

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('publicBaseUrl 是正式網域:https、乾淨的站根、不帶結尾斜線', () => {
  assert.equal(routing.publicBaseUrl, OFFICIAL);
  assert.equal(routing.canonicalUrlForPath('/'), `${OFFICIAL}/`);
  assert.equal(routing.canonicalUrlForPath('/en/news/some-slug'), `${OFFICIAL}/en/news/some-slug`);
});

test('index.html 靜態 <head> 的絕對網址全部跟 routing.js 算的一樣', () => {
  // 預渲染會重寫這幾條;但沒跑到預渲染的部署(例如手動 vercel deploy)、本機 npx serve,
  // 還有 JS 跑起來之前,讀到的都是這裡的預設值。
  const html = read('index.html');
  const pick = (re) => {
    const m = re.exec(html);
    assert.ok(m, `index.html 找不到 ${re}`);
    return m[1];
  };
  const home = routing.canonicalUrlForPath('/');
  const alt = routing.alternateUrlsForPath('/');
  assert.equal(pick(/<link rel="canonical" href="([^"]+)">/), home);
  assert.equal(pick(/<meta property="og:url" content="([^"]+)">/), home);
  assert.equal(pick(/<link rel="alternate" hreflang="zh-Hant" href="([^"]+)">/), alt.zh);
  assert.equal(pick(/<link rel="alternate" hreflang="en" href="([^"]+)">/), alt.en);
  assert.equal(pick(/<link rel="alternate" hreflang="x-default" href="([^"]+)">/), alt.xDefault);
  assert.equal(pick(/<meta property="og:image" content="([^"]+)">/), `${routing.publicBaseUrl}/og-image.png`);
  assert.equal(pick(/<meta name="twitter:image" content="([^"]+)">/), `${routing.publicBaseUrl}/og-image.png`);
});

test('會被部署出去的檔案裡不再出現舊網址(vercel.json 的轉址來源除外)', () => {
  const SKIP_DIRS = new Set(['.git', '.vercel', '.worktrees', '.claude', 'node_modules', 'dist', 'build', 'tests', 'docs', 'scripts']);
  const TEXT = /\.(html|js|mjs|cjs|json|txt|xml|svg|webmanifest)$/;
  const hits = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(abs);
      } else if (TEXT.test(ent.name) && rel !== 'vercel.json' && fs.readFileSync(abs, 'utf8').includes(OLD_HOST)) {
        hits.push(rel);
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});

test('vercel.json:舊網址整站 308 轉到正式網域的同一路徑', () => {
  const config = JSON.parse(read('vercel.json'));
  const hostRedirects = (config.redirects || []).filter((r) => (r.has || []).some((h) => h.type === 'host'));
  assert.equal(hostRedirects.length, 1, '只該有一條依 host 轉址的規則');
  // 整條釘死:多一個欄位(statusCode、missing…)或少一個都要紅。
  //   permanent: true → Vercel 回 308(保留 method 與 body;搜尋引擎視為永久搬家)。
  //   /:path* → /:path*:整段路徑原樣帶過去(Vercel 文件的 /blog/:path* → /news/:path* 同一種寫法)。
  //   query 不寫在 destination:Vercel 會自己把原本的 ?query 接到 Location 後面
  //   (2026-09-29 對舊網址的 trailingSlash / cleanUrls 兩種 308 實測都有保留,它們跟這條是同一種 route)。
  assert.deepEqual(hostRedirects[0], {
    source: '/:path*',
    has: [{ type: 'host', value: '^ifoodmap-landing\\.vercel\\.app$' }],
    destination: `${routing.publicBaseUrl}/:path*`,
    permanent: true,
  });
  assert.doesNotMatch(hostRedirects[0].destination, /[?#]/);
});

test('host 條件剛好等於舊網址:preview 部署、正式網域、www 都不會被轉走', () => {
  const config = JSON.parse(read('vercel.json'));
  const rule = config.redirects.find((r) => (r.has || []).some((h) => h.type === 'host'));
  const { value } = rule.has[0];
  // Vercel 把 has 的字串值當正規表示式;官方 CLI 的「host 等於」條件也是編成 ^跳脫後的值$ 這個形狀。
  // 點號一定要跳脫,否則 . 會配任何字元。「片段搜尋」與「整串比對」兩種解讀都驗,兩種都要成立。
  const readings = [new RegExp(value), new RegExp(`^(?:${value})$`)];
  const mustNotMatch = [
    'ifoodmap.ai',
    'www.ifoodmap.ai',
    'ifoodmap-landing-git-main-example-team.vercel.app', // 分支 preview
    'ifoodmap-landing-a1b2c3d4e-example-team.vercel.app', // 單次部署網址
    'dish-to-supply.vercel.app',
    'ifoodmap-admin.vercel.app',
    'ifoodmap-landingXvercelXapp',
    `x${OLD_HOST}`,
    `${OLD_HOST}.example.test`,
  ];
  for (const re of readings) {
    assert.ok(re.test(OLD_HOST), `${re} 應該比對到 ${OLD_HOST}`);
    for (const host of mustNotMatch) assert.ok(!re.test(host), `${re} 不該比對到 ${host}`);
    // 目的地的 host 絕對不能又符合條件,否則會無限轉址
    assert.ok(!re.test(new URL(rule.destination.replace('/:path*', '/')).host));
  }
  // www.ifoodmap.ai → ifoodmap.ai 刻意不寫在這裡,交給 Vercel 的網域設定(Redirect to ifoodmap.ai):
  // 網域層的轉址在部署的路由之前就生效,這裡再寫一條只是死碼;而如果有人把網域設定改成
  // 「ifoodmap.ai 轉到 www」,這裡的 www → apex 就會跟它互轉成無限迴圈,整站打不開。
});

test('任何一條轉到正式網域的規則都必須限定來源 host,而且不能比對到正式網域本身(防無限轉址)', () => {
  const config = JSON.parse(read('vercel.json'));
  const officialHost = new URL(routing.publicBaseUrl).host;
  for (const r of config.redirects || []) {
    // 站內相對路徑的轉址(/old → /new)不在這條的範圍
    if (!/^https?:\/\//.test(r.destination) || new URL(r.destination).host !== officialHost) continue;
    const hostConds = (r.has || []).filter((h) => h.type === 'host');
    assert.ok(hostConds.length, `${r.source} → ${r.destination} 沒有 host 條件:正式網域上的請求也會被轉,無限迴圈`);
    for (const h of hostConds) {
      assert.equal(typeof h.value, 'string', `${r.source} 的 host 條件請用字串(正規表示式)`);
      assert.ok(!new RegExp(h.value).test(officialHost), `${r.source} 的 host 條件 ${h.value} 會比對到 ${officialHost}`);
    }
  }
});
