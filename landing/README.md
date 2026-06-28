# iFoodMap 食材地圖 — 形象網站（部署原始碼）

> 給 **Claude Code** 的交接包。這份包裡的 **就是網站本身的原始碼**，直接部署即可 **100% 還原**設計師交付的成品——不是用其他框架重寫的版本，所以不會有任何視覺誤差。

---

## 0. 為什麼這樣能 100% 還原

`index.html` 是網站的**實際渲染原始檔**，搭配同層的 `support.js`（執行階段）即可在任何瀏覽器／靜態主機呈現出與設計稿**像素級完全一致**的畫面與互動。

- 你不需要把它「重做成 React」。重做才會有誤差；**直接部署這份原始碼**就是 100% 還原。
- 另附 `standalone.html`：把字體、執行階段全部內嵌的**單一離線檔**，雙擊就能開、零依賴，作為 100% 視覺驗收基準與離線備援。

---

## 1. 檔案說明

```
ifoodmap_deploy/
├─ index.html          ← 網站主檔（可編輯原始碼；載入 ./support.js）★ 部署這個
├─ support.js          ← 執行階段，必須與 index.html 同層
├─ standalone.html     ← 100% 離線單一檔（驗收基準 / 備援，可不部署）
├─ vercel.json         ← Vercel 靜態部署設定
├─ package.json        ← 本機預覽（npx serve）
├─ .env.example        ← 接後端時的環境變數範本
├─ supabase_schema.sql ← 之後接資料庫用的建表 SQL
├─ README.md           ← 本檔
└─ DEPLOY.md           ← 逐步部署（GitHub→Vercel→Supabase→Railway）
```

---

## 2. 本機預覽（30 秒驗證 100% 還原）

```bash
cd ifoodmap_deploy
npx serve .
# 開 http://localhost:3000 → 應與 standalone.html 完全一致
```
> 直接用 `file://` 開 `index.html` 可能因瀏覽器限制讀不到 `support.js`；請用上面的本機伺服器，或部署後驗證。`standalone.html` 則可直接雙擊開。

---

## 3. 這個網站怎麼運作（給接手者）

- 單頁應用：**首頁 / 服務 / 客戶案例 / 關於我們 / 聯絡我們** 都在 `index.html` 內，用前端狀態切換（非多 URL 路由），所以**靜態託管單一檔即可**。
- 視覺系統、動畫、頁面內容的完整規格，見隨附的 `design_handoff_ifoodmap`（若一併取得）或本檔第 5 節摘要。
- 目前所有圖片為**佔位圖**（斜紋 + 用途文字），等真實照片再替換。
- 聯絡頁表單目前是**純前端 UI**（按鈕沒送出到後端）。要讓它真的收件 → 見 DEPLOY.md 第 4–5 節接 Supabase。

---

## 4. 部署目標與分工

| 服務 | 角色 |
|---|---|
| **GitHub** | 原始碼版控，作為 Vercel 部署來源（push 自動上線）|
| **Vercel** | 靜態托管 `index.html`（網站本體）＋ 之後的 `/api` serverless（表單收件）|
| **Supabase** | 資料庫（需求單/供應商/媒合）、Auth、檔案儲存 |
| **Railway** | 背景工作：AI 媒合運算、LINE/Email 通知佇列（長時間/排程）|

**最小可上線**：只要 GitHub + Vercel，就能把 100% 還原的形象站部署上去。Supabase / Railway 是讓「需求表單 → 媒合 → 通知」真正運作的後續加值，文件已備妥。

詳細步驟見 **DEPLOY.md**。

---

## 5. 設計系統摘要（迭代時對齊）

- **主色**：`#3DAE2B`；漸層 `linear-gradient(135deg,#46c138,#1f9e4e)`；亮綠 `#7cf06b`；深色底 `#0a1510`（hero/服務）、`#081109`（footer）；淺底 `#F6F8F5`；卡片邊 `#e8efe6`；文字 `#0e1a12` / `#5b6b62` / `#8a9a8f`。
- **字體**：`Noto Sans TC`（中文/內文）＋ `Space Grotesk`（數字/英文標籤/標題拉丁字），均由 Google Fonts 載入。
- **圓角**：卡片 22–24、磚 18、輸入框 12、**按鈕膠囊 100**、CTA 區 30。
- **動畫**：捲動進場（CSS `animation-timeline: view()`，預設可見的安全 fallback）、統計數字 count-up、Hero 玻璃卡漂浮、綠點脈動、卡片 hover 浮起。
- 五頁區塊清單詳見 `index.html` 內的標記與 `design_handoff_ifoodmap/README.md`。

> 要改內容/版面：直接編輯 `index.html`（`<x-dc>` 內的 markup 與 `<script data-dc-script>` 內的 `class Component` 邏輯）。改完重新部署即可；`support.js` 不要動。
