# iFoodmap 部署

同一份 codebase 部署成兩個 Vercel 站,用建置變數 `VITE_PORTAL` 分流。

| 站台 | 網址 | 內容 | 部署方式 |
|---|---|---|---|
| **前台 + 餐廳 + 供應商** | https://dish-to-supply.vercel.app | 登入首頁、餐廳後台、供應商後台、公開頁 | GitHub push main **自動部署** |
| **平台營運後台** | https://ifoodmap-admin.vercel.app | 只有 `/admin/*` | GitHub push main **自動部署** |

管理員後台**刻意不出現在客戶看得到的網域上** —— 主站的 `/admin` 會顯示 404。

## 環境變數

| 變數 | 前台站 | 管理員站 |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | ✅ |
| `VITE_PORTAL` | (不設) | `admin` |
| `VITE_ADMIN_SITE_URL` | 選填,預設 `https://ifoodmap-admin.vercel.app` | — |
| `VITE_MAIN_SITE_URL` | — | 選填,預設 `https://dish-to-supply.vercel.app` |

Vite 在建置時把 `import.meta.env.VITE_*` 內聯進 bundle,**改了值一定要重新建置**,不是改 Vercel 環境變數就會生效。

## 兩站都是自動部署

```bash
git push origin main
```

`.github/workflows/deploy-vercel.yml` 有兩個平行的 job,一次推同時更新兩站。
兩個專案都在 **ifoodmap team** 底下。

用到的 GitHub secrets:

| Secret | 用途 |
|---|---|
| `VERCEL_TOKEN` | 部署權杖 |
| `VERCEL_ORG_ID` | team scope |
| `VERCEL_PROJECT_ID_DISH` | 前台站 |
| `VERCEL_PROJECT_ID_ADMIN` | 管理員站 |

`VITE_PORTAL=admin` **設在 Vercel 專案的環境變數上**,不是在 workflow 裡 ——
Vercel 建置時自動帶入,所以兩個 job 的指令完全一樣,只差 PROJECT_ID。

### 手動部署(需要時)

```bash
cd ~/.gemini/File/ifoodmap
VERCEL_ORG_ID=team_VJzPZOwBqciuXnPC0XltX4MW \
VERCEL_PROJECT_ID=prj_cf9IKsaZJd5AwOr9Jg3TRGmRZUrU \
  npx vercel deploy --prod --yes --token <ifoodmap-team-token>
```

## 跨站 session

兩站是不同 origin,Supabase session 存在各自的 localStorage,**不共用**。
所以身分切換器(`src/components/PortalSwitcher.tsx`)切到管理員站時會標示
「另開新站,需重新登入」—— 這是預期行為,也是權限隔離的好處。

## 路由分流的實作

`src/lib/portal.ts` 匯出 `IS_ADMIN_BUILD`,`src/App.tsx` 依它渲染 `<AdminRoutes />`
或 `<MainRoutes />`。要新增頁面時記得掛在正確的那一組。

## 資料庫 migration 落差檢查

`.github/workflows/deploy-vercel.yml` 有一個 `check-migrations` job,
每次 push main 都會比對 `supabase/migrations/*.sql` 與線上
`supabase_migrations.schema_migrations` 的紀錄,有落差就讓 workflow 變紅。

**為什麼需要**:2026-07-27 發現 `20260726150000_restaurant_self_signup.sql`
躺在 repo 好幾天沒套到線上,前端一直呼叫一個不存在的 RPC ——
餐廳註冊從頭到尾不可能成功,而且沒有任何機制會告訴我們。

本機也能跑:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=cwvpehqcvbfuynabpqop \
  node scripts/check-migrations.mjs
```

### 寫了新 migration 之後

這個專案的 DB 是 dashboard 管理的,`supabase db push` 需要該專案的存取權
(本機 CLI 登入的帳號沒有)。實務上是用 Management API 直接套:

```bash
python3 -c "
import json,pathlib,sys
pathlib.Path('/tmp/q.json').write_text(json.dumps({'query': pathlib.Path(sys.argv[1]).read_text()}))
" supabase/migrations/<檔名>.sql

curl -s -X POST "https://api.supabase.com/v1/projects/cwvpehqcvbfuynabpqop/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36" \
  --data-binary @/tmp/q.json
```

⚠️ Management API 不會自動寫 ledger,**套完要補一筆**,否則 CI 會一直紅:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260726150000', 'restaurant_self_signup')
on conflict (version) do nothing;
```

（Cloudflare 會擋掉沒有瀏覽器 User-Agent 的請求,回 1010 —— 上面的 `-H "User-Agent: ..."` 不能省。）

## Edge Function `ai` 的部署

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy ai --project-ref cwvpehqcvbfuynabpqop --no-verify-jwt
```

形象站有中英兩版(`/` 與 `/en`)。前端呼叫 `ai` 時會多帶一個 `lang` 欄位,
`en` 會讓回覆、菜單分析的品名與摘要全部改用英文(見 `withLang()` / `EN_DIRECTIVE`)。
沒帶或帶別的值就是原本的繁體中文行為,所以這個改動對舊 client 是相容的。

**一定要帶 `--no-verify-jwt`。** 主站前端(`src/lib/api.ts`)與形象站的代理(`ifoodmap-landing/api/ai-chat.js`)
呼叫這支時都只送 `apikey`、沒有 `Authorization` header;少了這個旗標會把 JWT 驗證打開,
兩邊立刻全部 401(`UNAUTHORIZED_NO_AUTH_HEADER`)。2026-09-22 踩過一次,形象站 AI 助手斷了幾分鐘。

## 表單 lead 通知(notify-lead)

官網表單送出後自動寄信到 **`ifoodmaptw@gmail.com`**。

```
瀏覽器 --(PostgREST INSERT)--> partnership_leads / landing_leads
          --(AFTER INSERT trigger, pg_net 非同步)--> notify-lead Edge Function
          --(Resend)--> ifoodmaptw@gmail.com
```

**為什麼需要這個機制**:`landing_leads` 與 `partnership_leads` 對 anon 只開
INSERT、**沒有任何 SELECT policy**,而 27 個 admin 頁面裡沒有一頁列出它們
(只有 `AnalysisDetailPage.tsx` / `AdminOrderDetailPage.tsx` 會用 `analysis_id`
反查 `landing_leads`)。換句話說**表單送進來在後台完全看不到** ——
在做出後台列表頁之前,寄信是唯一會讓業主知道「有人來敲門」的機制。

**為什麼要解耦成 trigger → Edge Function**:形象站是純靜態站,瀏覽器端只管
INSERT。寄信失敗不會讓使用者看到錯誤,lead 也不會掉。

| 元件 | 位置 |
|---|---|
| Edge Function | `supabase/functions/notify-lead/index.ts` |
| Trigger + 設定表 | `supabase/migrations/20260923120000_lead_notifications.sql` |
| 收件人 / 寄件人 | Supabase secrets `LEAD_NOTIFY_TO` / `LEAD_NOTIFY_FROM`(未設時用程式內預設) |
| 共享密鑰 | Supabase secret `LEAD_HOOK_SECRET` **與** `public.app_config.lead_hook_secret`(兩邊必須一致) |
| Function URL | `public.app_config.lead_notify_function_url` |

### 怎麼改收件人

不用改程式、不用重新部署 —— 設一個 secret 就好(多個收件人用逗號分隔):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase secrets set \
  LEAD_NOTIFY_TO=ifoodmaptw@gmail.com,someone@else.com \
  --project-ref cwvpehqcvbfuynabpqop
```

⚠️ **改 secret 會讓專案上所有 Edge Function 重新部署一次**(版號都會 +1)。
這是 Supabase 的正常行為,原始碼與 `verify_jwt` 設定都不會變 —— 但改完
順手確認一下 `ai` 沒被影響(它斷掉會讓形象站的 AI 助手掛掉)。

### 寄件網域

目前這個 Resend 帳號驗證過的網域只有 **`gathertaiwan.com`** 與 `beunion.tw`,
**`ifoodmap.com.tw` 還沒驗證**,所以沿用 `notify` 那支已經在用的
`noreply@gathertaiwan.com`。這是寄給業主自己的內部通知信,網域不一致沒關係;
之後若要寄給客戶,請先在 Resend 驗證 ifoodmap 自己的網域再改 `LEAD_NOTIFY_FROM`。

信件的 `reply_to` 會設成 lead 填的 `contact_email`(只有 `partnership_leads` 有這欄),
所以業主在 Gmail 直接按回覆就是回給對方。

### 🔴 部署一定要帶 `--no-verify-jwt`

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy notify-lead \
  --project-ref cwvpehqcvbfuynabpqop --no-verify-jwt
```

DB trigger 是 `pg_net` 直接打 HTTP,**沒有使用者 JWT 可帶**。少了這個旗標會把
JWT 驗證打開,webhook 每次都被擋成 401,信一封都不會寄 ——
而且因為 trigger 吞掉錯誤,**不會有任何地方報錯**,會靜默失效。
(同一個坑 2026-09-22 在 `ai` 那支踩過,害兩個網站全部 401。)

安全性不是靠 JWT,是靠**共享密鑰**:Edge Function 檢查
`Authorization: Bearer <LEAD_HOOK_SECRET>`(或自訂 header `x-lead-hook-secret`),
不符就回 401。沒有這道檢查,它等於是一個「任何人都能叫它寄信到業主信箱」的公開端點。

### 換密鑰

兩邊要一起改,否則 trigger 打過去會被自己的函式擋成 401:

```bash
NEW=$(openssl rand -hex 32)
SUPABASE_ACCESS_TOKEN=sbp_... supabase secrets set LEAD_HOOK_SECRET=$NEW \
  --project-ref cwvpehqcvbfuynabpqop
# 再把同一個值寫進 app_config(走 Management API,記得帶 User-Agent)
# update public.app_config set value='<NEW>', updated_at=now() where key='lead_hook_secret';
```

### 怎麼確認它還活著

`pg_net` 會把每次呼叫的回應存下來,這是最直接的證據:

```sql
select id, status_code, left(content, 200), created
from net._http_response order by id desc limit 5;
```

`status_code = 200` 且 content 裡有 `"sent":true` 就是有寄出去。
真正送達與否去 Resend 後台(或 `GET https://api.resend.com/emails/<resend_id>`)
看 `last_event` 是不是 `delivered`。

### 新增欄位不用改 Edge Function

`notify-lead` 會把 record 裡**所有非空欄位**列進信裡 —— 沒在 `SPECS` 定義
中文標籤的欄位也會顯示(用原始欄位名)。所以之後表單加欄位不會漏資料,
只是標籤會是英文;要中文標籤再回去 `SPECS` 補。

⚠️ 只有 `partnership_leads` 與 `landing_leads` 在白名單裡,其他 table 一律
跳過不寄 —— 不要讓這支變成通用寄信機。
