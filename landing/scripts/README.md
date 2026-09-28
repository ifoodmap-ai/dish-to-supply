# 驗證用腳本

`npm test`(node --test)驗的是原始碼:字典 key 對不對、綁定解不解析得到、
routing 的網址換算對不對。但有一整類 bug 它**看不到** —— 要真的在瀏覽器裡跑才會露餡:

- `<script src="./support.js">` 在 `/en/suppliers` 之下 base 變成 `/en/`,
  會去要 `/en/support.js` → 404 → **整頁空白**
- 右下角 AI 助手在 React 外面,語系事件沒發到它就會「英文頁面配中文助手」
- 版面在某個語系撐爆(英文字比中文長)

這兩支就是拿來抓這類的。

## 用法

```bash
# 1. 起一個「跟 Vercel 同規則」的本機伺服器(rewrite 直接讀 vercel.json)
python3 scripts/serve-like-vercel.py . 4322 &

# 2. 用真的 Chrome 跑 22 條公開網址
node scripts/smoke-i18n.mjs http://127.0.0.1:4322
```

逐條檢查:語系對不對、canonical 有沒有指回自己、h1 是不是該語系、語系提示條該不該出現、
有沒有橫向溢出、有沒有未解析的 `{{ }}`、英文頁有沒有殘留中文、內部連結的語系前綴對不對、每頁 title 對不對。

瀏覽器固定模擬「偏好英文、什麼都沒存過」的訪客 —— 這正是 Googlebot 渲染時的語系設定。
中文網址(**包括裸網址 `/`**)若被誤轉語系會立刻露餡(那是 SEO 的紅線,見 `docs/I18N.md`);
`/` 必須留在中文、而且多出一條英文的語系提示條,其他 21 條一律沒有提示條。

上線後可以直接對正式站跑同一支:`node scripts/smoke-i18n.mjs https://ifoodmap-landing.vercel.app`。

> `npx serve` 不適合拿來驗:它不讀 `vercel.json`,`-s` 又會把**任何** 404 都導到
> index.html,反而看不出 rewrite 少寫了哪一條。
