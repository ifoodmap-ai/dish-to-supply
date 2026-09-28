# iFoodmap 部署

同一份 codebase 部署成兩個 Vercel 站,用建置變數 `VITE_PORTAL` 分流。

| 站台 | 網址 | 內容 | 部署方式 |
|---|---|---|---|
| **前台 + 餐廳 + 供應商** | https://dish-to-supply.vercel.app | 登入首頁、餐廳後台、供應商後台、公開頁 | GitHub push main **自動部署** |
| **平台營運後台** | https://ifoodmap-admin.vercel.app | 只有 `/admin/*` | GitHub push main **自動部署** |

管理員後台**刻意不出現在客戶看得到的網域上** —— 主站的 `/admin` 會顯示 404。

形象站 https://ifoodmap-landing.vercel.app 的原始碼也在這個 repo(`landing/`),但它是另一個 Vercel 專案、另一條 workflow,
見下面的「形象站(landing/)」。

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

## 形象站(landing/)

https://ifoodmap-landing.vercel.app 的原始碼在 `landing/`:純靜態頁 + `landing/api/` 三支 Vercel Function(代理 Edge Function `ai`),
沒有任何相依套件。2026-09-28 從 `ifoodmap-ai/ifoodmap-landing` 連同完整歷史併進來,`git log -- landing/index.html` 看得到全部歷史。
**舊 repo 已凍結,不要再 push 過去** —— 它的部署 workflow 在業主停用前仍然開著,推上去會用舊內容蓋掉正式站。

本機測試:`cd landing && npm test`(node:test,不需要 npm install)。

### 形象站怎麼部署

`.github/workflows/landing-deploy.yml`,push main 自動跑:`npm test` → `vercel pull` → `node scripts/prerender.mjs --in-place`
→ `vercel build --prod` → `vercel deploy --prebuilt --prod`,全部在 `landing/` 裡執行。PR 只跑測試、不部署。

- **路徑過濾**:只有 `landing/**` 或 `landing-deploy.yml` 本身有變動才會觸發。反過來,`deploy-vercel.yml` 與 `product-ci.yml`
  用 `paths-ignore` 排除這兩者;Vercel Git 整合那一路由根目錄 `vercel.json` 的 `ignoreCommand` 擋
  (上次成功部署到這次之間,只動到 `landing/` 或 `.github/` 就跳過建置)。
  所以**只改 `landing/` 的 push,兩個產品站都不會重建**;同一個 push 兩邊都有改,就兩邊各自部署。
  注意:只改 `.github/` 底下其他檔案(例如 `product-ci.yml`)時,Git 整合會跳過,但 `deploy-vercel.yml` 仍會照常用 CLI 部署兩站。
- **專案 ID**:`VERCEL_PROJECT_ID` 直接寫在 workflow 裡(形象站專案 `ifoodmap-landing`,不是機密);
  token 與 team 沿用本 repo 的 `VERCEL_TOKEN`、`VERCEL_ORG_ID`(三個專案同一個 team)。
  🔴 **不要改成 `secrets.VERCEL_PROJECT_ID`** —— 本 repo 那個 secret 是已經不用的舊 "ifoodmap" 專案,改了會把形象站部署到錯的專案。
  `landing/tests/deploy-workflow.test.cjs` 有擋。
- **12/31 排程**:cron `5 16 31 12 *`(UTC)= 台北每年 1/1 00:05 自動重建一次,只重跑預渲染、不 commit ——
  頁尾年份是程式算的,但不跑 JavaScript 的爬蟲讀的是預渲染時烤進 HTML 的年份。排程只在 main 上跑,`paths` 對排程無效。
  手動重建:`gh workflow run landing-deploy.yml -R ifoodmap-ai/dish-to-supply`。
- 🔴 **Vercel 上 `ifoodmap-landing` 專案的 Root Directory 必須保持空白**:workflow 已經在 `landing/` 裡跑 `vercel build`,
  改成 `landing` 的話 CLI 會去找 `landing/landing`,建置直接失敗。
- 預渲染用到全域 `WebSocket`,Node 必須 ≥ 22;workflow 固定 24(= Vercel 專案的 function runtime)。
- 回退:Vercel → `ifoodmap-landing` → Deployments → 選上一個 → Instant Rollback;或 `git revert` 之後 push。

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

**一定要帶 `--no-verify-jwt`。** 主站前端(`src/lib/api.ts`)與形象站的代理(`landing/api/ai-chat.js`)
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

## 餐廳新增成員(invite-restaurant-member)

餐廳後台「分店與成員」頁(`src/pages/restaurant/RestaurantTeamPage.tsx`)的「新增成員」按鈕
(只有老闆看得到)會呼叫這支 Edge Function:建帳號 → 寫 `restaurant_accounts` → 寄邀請信。
寄信沿用 `approve-supplier` 的做法(`inviteUserByEmail`,同一個 Auth 邀請信模板),
但帳號改成**先用 `createUser` 建**(帶好 `app_metadata`):email 唯一索引保證同一個 email
同時被邀兩次時只有一個請求建得起來,失敗時的 rollback 只會刪到自己建的帳號。
(`approve-supplier` 是「先 invite 再 `updateUserById`」:email 已有帳號時會沿用那個帳號並覆寫它的
`app_metadata.role` —— 這裡刻意不照抄這一段。)

| 元件 | 位置 |
|---|---|
| Edge Function | `supabase/functions/invite-restaurant-member/index.ts`(只接 Deno);邏輯在 `handler.ts`、輸入驗證在 `validate.ts`,兩支都有 vitest(`handler.test.ts` 用假 client 測每條分支) |
| SQL(唯讀函式) | `supabase/migrations/20260928150000_restaurant_member_invites.sql` |
| SQL(頻率限制) | `supabase/migrations/20260928160000_restaurant_invite_guards.sql`(`restaurant_invite_attempts` 表 + `claim_restaurant_invite_slot()`) |
| 前端 | `RestaurantTeamPage.tsx`(測試 `RestaurantTeamPage.test.tsx`) |

兩個 migration 2026-09-28 已用 Management API 套上線並補 ledger。

### 🔴 部署用預設的 JWT 驗證(不要加 `--no-verify-jwt`)

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy invite-restaurant-member \
  --project-ref cwvpehqcvbfuynabpqop --use-api
```

跟 `ai` / `notify-lead` **相反**:這支一定是已登入的老闆從瀏覽器呼叫(帶 `Authorization: Bearer <使用者 JWT>`
+ `apikey`),所以讓 gateway 先擋掉沒登入的請求。`--use-api` 是因為本機沒有 Docker。
確認活著:不帶 token 打會回 gateway 的 401 `UNAUTHORIZED_NO_AUTH_HEADER`;
帶 anon key 當 Bearer 會回**函式自己的** 401 `{"code":"UNAUTHENTICATED",...}`(代表已部署、且 JWT 驗證是開的)。

### 授權邏輯(全部在伺服器端,不信前端)

1. `auth.getUser(JWT)` 失敗 → **401**
2. 呼叫者在 `restaurant_accounts` 沒有任何 `role='owner' AND is_active` 的列 → **403**
3. 輸入驗證(email 格式、姓名 1–50 字、角色只能是 `owner` / `manager` / `purchaser`、分店/餐廳要是 UUID)→ **400**
4. 前端帶的 `restaurant_id` 只用來「指定哪一家」,必須在呼叫者當老闆的店裡,否則 **403**
   (沒帶且只當一家店的老闆 → 就是那家;是多家店的老闆又沒帶 → 400)
5. 餐廳已停用 → 403;分店不屬於這家店 / 已停用 → 400
6. 頻率限制:同一家店一小時內超過 20 次嘗試 → **429**。在資料庫裡原子化(advisory lock + 計數 + 記一筆
   在同一個交易),同時灌一堆請求也不會超量(2026-09-28 實測 8 個併發、上限 3 → 剛好 3 個過)。
   **排在查 email 之前**,所以回 409 的嘗試也算 —— 不然有人可以不限次數地探測誰有註冊
7. 這個 email 已經有帳號 → **409**,**一律不綁、不改**(`restaurant_invite_email_status()` 查,只開給 service_role):
   - 已是本店成員、還沒點邀請信 → `INVITE_PENDING`(訊息會教對方用「忘記密碼」設定密碼)
   - 已是本店啟用中成員 → `ALREADY_MEMBER`
   - 曾是本店成員、目前停用 → `MEMBER_INACTIVE`(請在列表按「啟用」,不用重新邀請)
   - 其他任何帳號(供應商、別家餐廳、平台管理員、註冊到一半的)→ `EMAIL_TAKEN`,訊息刻意不透露是哪種身分
8. `createUser`(`email_confirm: false`、`app_metadata = { role: "restaurant", invited_by, invited_restaurant_id }`,
   不會寄信)→ 寫 `restaurant_accounts` → `inviteUserByEmail` 寄信。
   後兩步失敗就刪掉剛建的 auth user(成員資料 cascade 刪掉);刪除失敗重試一次,
   還是失敗回 `ROLLBACK_FAILED`(請聯絡客服,不要重試)。log 只記 id 與錯誤 code,不記 email

`app_metadata.role = "restaurant"` 只是身分標記(沒有程式靠它判斷權限);**店內角色以 `restaurant_accounts.role` 為準** ——
老闆之後可以在成員頁改角色,寫進 JWT 會過期。**絕不能**對既有帳號呼叫 `updateUserById(app_metadata)`:
`app_metadata` 的 `role` 只有一格,覆蓋掉 `admin` 等於拔掉平台管理員權限(第 7 步先擋掉,就是為了這個)。
`invited_restaurant_id` 也留給之後用:見下方「已知風險」。

### 「邀請中」怎麼判斷

`restaurant_member_directory(p_restaurant)`:`invited_at IS NOT NULL AND email_confirmed_at IS NULL`,
也就是**還沒點信裡的連結**。只有該店成員查得到;email 只回給老闆(與平台管理員),店長/採購員拿到 null。
不能用「有沒有密碼」判斷 —— GoTrue 在受邀者點連結的當下就會替他設一組隨機臨時密碼。

### 邀請信連結會落在哪

`redirectTo = ${SITE_URL}/reset-password?type=recovery`(`SITE_URL` 沒設時用 `https://dish-to-supply.vercel.app`)。
`/reset-password` 只在收到 `PASSWORD_RECOVERY` 事件時才顯示「設定新密碼」,而 supabase-js 解析網址時
**query 參數優先於 hash**,所以多帶 `?type=recovery` 就會進「設定新密碼」(2026-09-28 用無頭瀏覽器實測)。
連結過期(`mailer_otp_exp` = 3600 秒,**1 小時**)時沒有 session,會落到「忘記密碼」表單 ——
請對方用同一個 Email 重設密碼即可,這也是正確的退路。

⚠️ `approve-supplier` 的邀請連結目前**沒有**帶 `?type=recovery`:受邀的供應商點信後其實已登入,
但畫面停在「忘記密碼」。治本是讓 `ResetPasswordPage` 也認 `type=invite`。

### 已知風險(還沒處理)

**Email 預先佔用**:任何人都能自助註冊成老闆,再邀請一個「還沒註冊」的 email。如果對方沒理邀請信、
之後自己去註冊餐廳,GoTrue 對「已存在但未確認」的帳號只會重寄確認信,對方點完回到
`/register/complete` 時,那一頁看到已有 `restaurant_accounts` 就直接導進 `/restaurant` ——
等於落進邀請者的店。治本要改 `RegisterCompletePage`:帳號帶有 `app_metadata.invited_restaurant_id`
時不要自動完成,讓使用者選「加入這家店」或「建立自己的餐廳」。

### 寄信用哪個 SMTP、頻率限制

邀請信是 **Supabase Auth 自己寄的**(模板在 Dashboard → Authentication → Email Templates → Invite user,
主旨「iFoodmap 邀請你加入」),不是 `notify-lead` 那條 Resend API:

| 設定 | 值(2026-09-28 從 Management API `config/auth` 讀到) |
|---|---|
| SMTP | `smtp.resend.com:465`,user `resend`(密碼是一把 Resend API key) |
| 寄件人 | `iFoodmap 食材地圖 <noreply@gathertaiwan.com>` —— 同樣借用 gathertaiwan.com,ifoodmap 自己的網域還沒驗證 |
| `rate_limit_email_sent` | **每小時 100 封,全專案共用**(邀請、忘記密碼、註冊確認信都算在一起) |
| `smtp_max_frequency` | 同一個收件人 20 秒內只寄一封 |
| 邀請連結效期 | `mailer_otp_exp` = 3600 秒 |

因為是自訂 SMTP,Supabase 預設 SMTP 那個「每小時 2 封」的限制不適用。Resend 帳號本身的方案額度
(若是免費方案也有每日上限)沒有辦法從這邊確認,要去 Resend 後台看。
寄信是同步的:函式回 200 代表 Resend 已經收下這封信(實測約 6 秒)。
