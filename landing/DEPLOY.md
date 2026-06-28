# DEPLOY — iFoodMap（GitHub → Vercel →（選用）Supabase → Railway）

逐步指令。**階段 1–3 就能把 100% 還原的網站上線**；階段 4–6 才是讓需求表單真正運作的後端整合（可日後再做）。

---

## 階段 1 — 推上 GitHub

```bash
cd ifoodmap_deploy
git init
git add -A
git commit -m "feat: iFoodMap 形象網站（100% 還原原始碼）"
# 用 gh CLI（或在 GitHub 網頁建 repo 後 git remote add）
gh repo create ifoodmap-site --private --source=. --remote=origin
git push -u origin main
```

---

## 階段 2 — Vercel 部署（靜態，100% 還原）

1. vercel.com → **Add New… → Project** → Import 剛建立的 GitHub repo。
2. 設定：
   - **Framework Preset：Other**
   - **Build Command：留空**（無需建置）
   - **Output Directory：留空 / `.`**（直接服務根目錄靜態檔）
   - `vercel.json` 已含 `cleanUrls` 設定，照用即可。
3. **Deploy**。完成後開網址，應與 `standalone.html` 完全一致。
4. 之後 **push 到 main 會自動重新部署**；PR 會自動產生 Preview 連結。
5.（選用）綁網域：Project → **Domains** → 加上你的網域並照指示改 DNS。

> CLI 版：`npm i -g vercel && vercel --prod`（於 `ifoodmap_deploy/` 內執行）。

✅ 到這裡，形象網站已 100% 還原並上線。

---

## 階段 3 — 驗收

- 開線上網址逐頁點過（首頁/服務/案例/關於/聯絡），對照 `standalone.html`。
- 確認：捲動進場動畫、統計數字 count-up、Hero 玻璃卡漂浮、卡片 hover、膠囊按鈕。
- RWD：縮放視窗確認排版（如需加強手機版，於 `index.html` 內補 media query / 對應樣式）。

---

## 階段 4 —（選用）Supabase：讓「需求表單」真的收件

1. supabase.com 建 project（建議區域 Singapore），記下 **Project URL / anon key / service_role key**（Settings → API）。
2. 在 **SQL Editor** 貼上 `supabase_schema.sql` 執行（建表 + 28 類食材 seed + RLS）。
3. （選用）Storage 建 bucket：`uploads`（需求附圖）、`supplier-docs`（SGS/履歷，私有）。

### 4.1 加一支 Vercel Serverless 收件 API

在 repo 新增 `api/demands.js`（Vercel 會自動把 `/api/*` 當 serverless function；需在 Vercel 專案設好環境變數）：

```js
// api/demands.js  —— POST 需求單，寫入 Supabase
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,                 // = NEXT_PUBLIC_SUPABASE_URL 的值
  process.env.SUPABASE_SERVICE_ROLE_KEY     // server only，勿外洩
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const b = req.body || {};
    const { data, error } = await supabase.from('demands').insert({
      company_name: b.company_name,
      contact_phone: b.contact_phone,
      contact_line: b.contact_line,
      items_text: b.items_text,
      detail: b.detail,
      status: 'new',
    }).select('id').single();
    if (error) throw error;

    // （選用）通知 Railway worker 開始媒合
    if (process.env.RAILWAY_WORKER_URL) {
      fetch(process.env.RAILWAY_WORKER_URL + '/run-matching', {
        method: 'POST',
        headers: { 'content-type': 'application/json',
                   'x-trigger-secret': process.env.WORKER_TRIGGER_SECRET },
        body: JSON.stringify({ demand_id: data.id }),
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
```

> 用到 `@supabase/supabase-js` 時，這個 repo 需要一個 `package.json` 依賴。最簡單：在 repo 根 `npm i @supabase/supabase-js`，Vercel 會自動安裝；靜態 `index.html` 不受影響。

### 4.2 把表單接上 API

`index.html` 內聯絡頁的送出鈕（`送出需求，免費媒合`）目前是純 UI。改法：在 `<script data-dc-script>` 的 `class Component` 內，
- 用 `state` 綁定五個輸入框（公司名稱 / 電話 / LINE ID / 需求品項 / 需求說明），
- 送出鈕的 `onClick` 改成呼叫一個 `submitDemand()`，內容 `await fetch('/api/demands', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(this.state.form) })`，
- 成功後切換到「送出成功」狀態（可仿原站的成功畫面）。

> 這是「漸進增強」：不動視覺，只把表單行為接上後端。其餘頁面維持 100% 還原。

### 4.3 Vercel 環境變數

Project → Settings → Environment Variables 填：
`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、（選用）`RAILWAY_WORKER_URL`、`WORKER_TRIGGER_SECRET`。改完重新部署。

---

## 階段 5 —（選用）Railway：AI 媒合 + 通知背景服務

> 需要「AI 智慧媒合」「LINE/Email 自動通知」「排程批次」時才做。

1. railway.app → New Project → **Deploy from GitHub repo**；若 worker 與站台同 repo，設 Root 為 `worker/`（自行新增），或另開 repo。
2. worker 提供：
   - `POST /run-matching`（驗 `x-trigger-secret`）：讀 `demands`，對 `suppliers` 依「品項命中 / 區域涵蓋 / 評分 / 標章」做 scoring，寫入 `matches`。
   - `notify`：對命中的供應商發 **LINE Messaging API** 推播、對 buyer 發 Email（Resend）。
   - （日後）把 scoring 換成呼叫 LLM（語意比對需求備註 ↔ 供應商描述）即升級為真 AI 媒合。
3. Railway Variables：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`LINE_CHANNEL_ACCESS_TOKEN`、`RESEND_API_KEY`、`WORKER_TRIGGER_SECRET`、（日後）`ANTHROPIC_API_KEY`。
4. 把 Railway 服務網址設給 Vercel 的 `RAILWAY_WORKER_URL`。

資料模型與 RLS 細節見 `supabase_schema.sql` 內註解。

---

## 安全注意

- `SUPABASE_SERVICE_ROLE_KEY`、`LINE_CHANNEL_*`、`*_API_KEY` **只放 server / worker 環境變數**，絕不可進 `index.html` 或 git。
- 前端若要直接讀公開資料，才用 `anon key`（並靠 RLS 保護）。

---

## 迭代守則

- 改網站 → 編輯 `index.html`（`<x-dc>` markup + `class Component` 邏輯）。**勿改 `support.js`**。
- 想保留舊版：複製成 `index.v1.html` 再改。
- 每次改完 `git push`，Vercel 自動部署。對照 `standalone.html` 確認沒跑掉視覺。
