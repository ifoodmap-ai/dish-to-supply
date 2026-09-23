# 最新消息／文章區怎麼運作

> 2026-09-23 從舊官網 `ifoodmap.com.tw/news` 搬過來的 17 篇文章。

## 網址

| 網址 | 內容 |
|---|---|
| `/news`、`/en/news` | 文章列表 |
| `/news/<slug>`、`/en/news/<slug>` | 單篇文章 |

**兩個語系共用同一個 slug**,所以 `/news/x` 與 `/en/news/x` 是同一篇,hreflang 才指得對。
slug 由**英文標題**產生(中文標題做不出可讀的 slug),產生規則在 `scripts/build-news.mjs`。

`/news/<slug>` 是這個站第一個**參數路由**。`vercel.json` 用 `/news/:slug`,
`scripts/serve-like-vercel.py` 也跟著支援,本機行為才跟正式站一致。

## 資料從哪來

`news.js`(UMD,node 與瀏覽器都能 `require`)由 `scripts/build-news.mjs` 產生:

```bash
node scripts/build-news.mjs <articles.json> <articles.en.json> news.js
```

- `articles.json` / `articles.en.json` 是從舊站擷取並翻譯後的原始資料
- **內文存成 blocks(`p` / `h2` / `ul` / `img`),不是原始 HTML**。
  舊站內文是 CKEditor 產物,寫死 font-size、夾帶 Google Docs 殘留 span、
  還有壞掉的屬性引號。直接搬過來會跟新站的設計系統打架,也可能夾帶 script。
- 圖片全部重新壓過放在 `assets/news/`(原檔最大 6725x4483、單檔 8.4MB;
  長邊壓到 1400、JPEG 品質 72,整批 13.9MB → 4.4MB)。
  **注意 `sips -Z` 會把小圖放大**,建置腳本有判斷只縮不放。

改文章內容就改 `news.js`(它是產生出來的,但改完不會被覆寫,除非重跑腳本)。

## 模板怎麼渲染不同型別的 block

`support.js` 只有 `sc-if` / `sc-for`,**沒有 switch**。所以 `renderVals()` 先把
block 的型別攤成布林旗標(`isP` / `isH2` / `isUl` / `isImg` / `hasLinks`),
markup 再用一串 `sc-if` 分支。巢狀 `sc-for`(ul 的 items、links)實測可用。

內文裡的超連結**不做行內插入** —— 在這個模板系統裡把連結塞回段落中間要拆字串,
很容易出錯。改成段落底下附一塊「文中參考連結」,資訊沒有丟。

## 已知要人工處理的

| 文章 | 問題 |
|---|---|
| 果汁製備新選擇：冷凍水果包(id=18) | **舊站內文本來就是空的**。建置腳本會自動略過沒有內文的文章,所以它不在 17 篇裡 |
| 日本核廢水對日本水產的影響(id=10) | 寫於 2023 年 4 月,內文說排放「尚未開始」,**現在讀起來是錯的**。建議重寫或下架 |
| 小攤販也能輕鬆數位化(id=20) | 第三方 POS 廠商的**業配文**,文末有推薦碼 `map2025`。優惠是否還有效要跟對方確認 |

另外:舊站「活動消息」分類是空的(一篇都沒有),所以 17 篇全部是「餐飲相關資訊」。
內文圖片的 `alt` 在舊站全是空的,新站要補無障礙文字得人工寫。
