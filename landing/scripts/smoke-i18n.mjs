// 16 條公開網址 × 真實瀏覽器,逐條檢查:語系、title、有沒有未解析的 {{ }}、有沒有橫向溢出、
// 英文頁有沒有殘留中文、內部連結前綴對不對
import { spawn } from 'node:child_process';
const BASE = process.argv[2];
const ROUTES = [
  ['/', 'zh'], ['/restaurants', 'zh'], ['/suppliers', 'zh'], ['/cases', 'zh'], ['/about', 'zh'], ['/contact', 'zh'],
  ['/en', 'en'], ['/en/restaurants', 'en'], ['/en/suppliers', 'en'], ['/en/cases', 'en'], ['/en/about', 'en'], ['/en/contact', 'en'],
  ['/news', 'zh'], ['/en/news', 'en'],
  ['/qa', 'zh'], ['/en/qa', 'en'],
];
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/smoke-${port}`, '--window-size=1280,900','about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find(t=>t.type==='page'); if (target) break; } catch {} await sleep(250); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width:1280, height:900, deviceScaleFactor:1, mobile:false });
// 固定用「瀏覽器偏好英文」來跑 —— 這樣中文深層網址若被誤轉,會立刻露餡
await send('Emulation.setUserAgentOverride', { userAgent:'', acceptLanguage:'en-US,en' });
await send('Page.addScriptToEvaluateOnNewDocument', { source:
  `Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});`
  + `Object.defineProperty(navigator,'language',{get:()=>'en-US'});`
  + `try{localStorage.removeItem('ifm.lang')}catch(e){}` });

let fails = 0;
console.log('路徑'.padEnd(18), '語系', '溢出', '未解析', '殘中', '連結前綴', 'title');
for (const [path, wantLang] of ROUTES) {
  await send('Page.navigate', { url: BASE + path });
  await sleep(3000);
  const ev = await send('Runtime.evaluate', { returnByValue: true, expression:
    `(()=>{const cjk=/[\\u4e00-\\u9fff]/;`
    + `const unresolved=(document.body.innerText.match(/\\{\\{[^}]*\\}\\}/g)||[]).length;`
    + `let zhLeft=0;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;`
    + `while((n=w.nextNode())){const el=n.parentElement;if(!el||el.tagName==='SCRIPT'||el.tagName==='STYLE')continue;`
    + `const t=(n.nodeValue||'').trim();if(t&&cjk.test(t)&&t!=='中文'&&t!=='食')zhLeft++;}`
    + `const langAnchor=document.querySelector('header a[lang]');`
    + `const internal=[...document.querySelectorAll('a[href^="/"]')].map(a=>a.getAttribute('href')).filter(h=>h!==langAnchor?.getAttribute('href'));`
    + `const wrongPrefix=internal.filter(h=>document.documentElement.lang==='en'?!h.startsWith('/en'):h.startsWith('/en')).length;`
    + `return{path:location.pathname,lang:document.documentElement.lang,title:document.title,`
    + `overflow:document.documentElement.scrollWidth>innerWidth,unresolved,zhLeft,wrongPrefix};})()` });
  const v = ev.result?.result?.value;
  // 規則:裸網址 / 允許依瀏覽器語系自動落到 /en(這裡刻意用偏好英文的瀏覽器跑);
  // 深層網址一律必須留在原地、照網址的語系渲染。
  const rootRedirectOk = path === '/' && v.path === '/en' && v.lang === 'en';
  const langOk = rootRedirectOk || ((v.lang === 'en' ? 'en' : 'zh') === wantLang && v.path === path);
  const zhOk = (wantLang === 'zh' && !rootRedirectOk) ? true : v.zhLeft === 0;
  const ok = langOk && !v.overflow && v.unresolved === 0 && zhOk && v.wrongPrefix === 0;
  if (!ok) fails++;
  console.log(
    (ok ? '✅ ' : '❌ ') + path.padEnd(16),
    (langOk ? v.lang : `${v.lang}@${v.path}!`).padEnd(5),
    (v.overflow ? 'YES' : '-').padEnd(5),
    String(v.unresolved).padEnd(7),
    (wantLang === 'zh' ? '-' : String(v.zhLeft)).padEnd(5),
    String(v.wrongPrefix).padEnd(9),
    v.title.slice(0, 44));
}
console.log(fails ? `\n❌ ${fails}/${ROUTES.length} 條不合格` : `\n✅ ${ROUTES.length}/${ROUTES.length} 全過`);
ws.close(); chrome.kill();
process.exit(fails ? 1 : 0);
