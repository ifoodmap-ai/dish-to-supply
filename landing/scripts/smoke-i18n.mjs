// 22 條公開網址 × 真實瀏覽器,逐條檢查:語系、canonical、h1 的語言、語系提示條、title、
// 有沒有未解析的 {{ }}、有沒有橫向溢出、英文頁有沒有殘留中文、內部連結前綴對不對
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
const BASE = process.argv[2];
const ROUTES = [
  ['/', 'zh'], ['/restaurants', 'zh'], ['/suppliers', 'zh'], ['/cases', 'zh'], ['/about', 'zh'], ['/contact', 'zh'],
  ['/en', 'en'], ['/en/restaurants', 'en'], ['/en/suppliers', 'en'], ['/en/cases', 'en'], ['/en/about', 'en'], ['/en/contact', 'en'],
  ['/news', 'zh'], ['/en/news', 'en'],
  ['/qa', 'zh'], ['/en/qa', 'en'],
  // 法律文件是參數路由 /legal/:slug —— 裸索引與兩份文件中英各跑一次。
  // 英文版的文件內容是譯本,所以「殘中」那一欄對 /en/legal/* 是真的有意義的檢查。
  ['/legal', 'zh'], ['/legal/terms', 'zh'], ['/legal/privacy', 'zh'],
  ['/en/legal', 'en'], ['/en/legal/terms', 'en'], ['/en/legal/privacy', 'en'],
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
// 固定用「瀏覽器偏好英文、什麼都沒存過」來跑 —— 這就是 Googlebot 渲染時的語系設定
// (navigator 是 en-US、每次都沒有 localStorage)。中文網址(包括裸網址 /)若被誤轉,會立刻露餡。
await send('Emulation.setUserAgentOverride', { userAgent:'', acceptLanguage:'en-US,en' });
await send('Page.addScriptToEvaluateOnNewDocument', { source:
  `Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});`
  + `Object.defineProperty(navigator,'language',{get:()=>'en-US'});`
  + `try{localStorage.removeItem('ifm.lang');localStorage.removeItem('ifm.langHintDismissed')}catch(e){}` });

let fails = 0;
console.log('路徑'.padEnd(18), '語系', 'canon', 'h1', '提示條', '溢出', '未解析', '殘中', '連結前綴', 'title');
for (const [path, wantLang] of ROUTES) {
  await send('Page.navigate', { url: BASE + path });
  await sleep(3000);
  const ev = await send('Runtime.evaluate', { returnByValue: true, expression:
    `(()=>{const cjk=/[\\u4e00-\\u9fff]/;`
    + `const unresolved=(document.body.innerText.match(/\\{\\{[^}]*\\}\\}/g)||[]).length;`
    + `let zhLeft=0;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;`
    + `while((n=w.nextNode())){const el=n.parentElement;if(!el||el.tagName==='SCRIPT'||el.tagName==='STYLE')continue;`
    + `const t=(n.nodeValue||'').trim();if(t&&cjk.test(t)&&t!=='中文'&&t!=='食')zhLeft++;}`
    // 語言切換連結(header 的語言鈕、首頁的語系提示條)本來就指向另一個語系,不算前綴錯誤
    + `const internal=[...document.querySelectorAll('a[href^="/"]')].filter(a=>!a.matches('header a[lang], .ifm-langhint a')).map(a=>a.getAttribute('href'));`
    + `const wrongPrefix=internal.filter(h=>document.documentElement.lang==='en'?!h.startsWith('/en'):h.startsWith('/en')).length;`
    + `const canon=document.querySelector('link[rel="canonical"]');`
    + `const h1=[...document.querySelectorAll('h1')].find(h=>{const r=h.getBoundingClientRect();return r.width>0&&r.height>0;});`
    + `const hint=document.querySelector('.ifm-langhint');`
    + `return{path:location.pathname,lang:document.documentElement.lang,title:document.title,`
    + `overflow:document.documentElement.scrollWidth>innerWidth,unresolved,zhLeft,wrongPrefix,`
    + `canonicalPath:canon?new URL(canon.getAttribute('href'),location.href).pathname:null,`
    + `h1Cjk:h1?cjk.test(h1.textContent):null,`
    + `hint:hint?hint.getAttribute('lang'):null,`
    + `hintCjk:hint?cjk.test(hint.textContent+(hint.getAttribute('aria-label')||'')):null,`
    + `hintInMain:hint?!!hint.closest('main'):false};})()` });
  const v = ev.result?.result?.value;
  // 規則(2026-09-24 起):裸網址 / 不再依瀏覽器語系自動轉,只有按過語言鈕(localStorage['ifm.lang'])
  // 的人才轉 —— 這裡什麼都沒存,所以每一條(包括 /)都必須留在原地、照網址的語系渲染,
  // canonical 指回自己、h1 是該語系。以前 / 會被轉去 /en,Googlebot 看到的就是「/ 是英文、canonical 是 /en」。
  const langOk = (v.lang === 'en' ? 'en' : 'zh') === wantLang && v.path === path;
  const canonOk = v.canonicalPath === path;
  const h1Ok = v.h1Cjk === (wantLang === 'zh');
  // 語系提示條只出現在中文首頁 /(瀏覽器偏好英文、頁面是中文),要用英文寫、在 main 外面。
  // /en 跟瀏覽器同語系、深層頁不出提示條 —— 其他 21 條一律不可以有。
  const wantHint = path === '/' ? 'en' : null;
  const hintOk = v.hint === wantHint && (!v.hint || (!v.hintCjk && !v.hintInMain));
  const zhOk = wantLang === 'zh' ? true : v.zhLeft === 0;
  const ok = langOk && canonOk && h1Ok && hintOk && !v.overflow && v.unresolved === 0 && zhOk && v.wrongPrefix === 0;
  if (!ok) fails++;
  console.log(
    (ok ? '✅ ' : '❌ ') + path.padEnd(16),
    (langOk ? v.lang : `${v.lang}@${v.path}!`).padEnd(5),
    (canonOk ? 'ok' : `${v.canonicalPath}!`).padEnd(6),
    (h1Ok ? 'ok' : 'NG!').padEnd(3),
    (hintOk ? (v.hint || '-') : `${v.hint || '無'}!`).padEnd(6),
    (v.overflow ? 'YES' : '-').padEnd(5),
    String(v.unresolved).padEnd(7),
    (wantLang === 'zh' ? '-' : String(v.zhLeft)).padEnd(5),
    String(v.wrongPrefix).padEnd(9),
    v.title.slice(0, 44));
}
console.log(fails ? `\n❌ ${fails}/${ROUTES.length} 條不合格` : `\n✅ ${ROUTES.length}/${ROUTES.length} 全過`);
ws.close(); chrome.kill();
// 無頭 Chrome 的暫存 profile 會一直累積(一次上百 MB),跑完一定要清掉,不然磁碟遲早被塞爆。
// 要等 Chrome 真的收工再刪 —— 它關閉時還會回寫 profile,刪太早會被它重新建出來。
await sleep(600);
try { rmSync(`/tmp/smoke-${port}`, { recursive: true, force: true }); } catch (e) { /* 清不掉就算了 */ }
process.exit(fails ? 1 : 0);
