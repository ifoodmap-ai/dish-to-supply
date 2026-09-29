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
  手動重建:`gh workflow run landing-deploy.yml -R ifoodmap-ai/ifoodmap-ai`。
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

⚠️ 只有 `partnership_leads` 與 `landing_leads` 會照 record 內容寄信;`supplier_applications`
只寄資料庫裡排好隊的信(見下一節),其他 table 一律跳過不寄 —— 不要讓這支變成通用寄信機。

## 供應商入駐申請的寄信(2026-09-28,migration 20260928180000 / 180100 / 180200)

| 時機 | 誰收到 | 誰寄 | 內容 |
|---|---|---|---|
| 送出申請(`/join`) | 業主(`LEAD_NOTIFY_TO`) | `notify-lead`(Resend) | 申請全部欄位 + 「前往審核」連結 + 確認信有沒有寄出 |
| 送出申請 | 申請者 | `notify-lead`(Resend) | 已收到、約 3 個工作天審核、結果會寄信通知(**不回顯申請者填的任何文字**) |
| 核准,新帳號 | 申請者 | Supabase Auth 邀請信(SMTP) | 連結 → `/reset-password?type=invite` →「設定密碼以啟用供應商帳號」 |
| 核准,Email 原本就有帳號 | 申請者 | `approve-supplier`(Resend) | 「申請已通過,請用原本的帳號登入」;**不改該帳號的 role / app_metadata** |
| 退件 | 申請者 | `approve-supplier`(Resend,`action: "reject"`) | 只有「給申請者的說明」(`applicant_message`);`admin_notes` 是內部備註,不會寄出 |

```
瀏覽器 --(anon INSERT)--> supplier_applications
  --(AFTER INSERT trigger:advisory lock 內做頻率判斷、記 queued)--> supplier_application_mails
  --(pg_net,只帶申請 id)--> notify-lead --(把 queued 搶成 sending 才寄)--> Resend
```

**防濫用**(申請表是匿名的,自動回信等於任何人都能叫我們寄信給任意信箱):

| 規則 | 在哪裡 |
|---|---|
| 同一個 email 只能有一筆待審申請 | 部分唯一索引 `supplier_applications_one_pending_per_email`,前端收到 23505 會說「已經有一筆申請在審核中」 |
| 同一個 email 24 小時內最多一封確認信(先去 +tag、gmail 去點) | trigger `supplier_application_queue_mails()` |
| 全站每小時確認信上限(預設 20) | 同上;`app_config.supplier_application_confirm_hourly_cap` 可改,不用部署 |
| 全站每小時業主通知上限(預設 30) | 同上;`app_config.supplier_application_owner_hourly_cap` |
| 匿名只能送 pending、不能帶管理員欄位、欄位有長度上限 | `anon submit application` policy |
| email 只收一般格式(英數與 `._%+'-` 的帳號、正常網域、英文或 punycode `xn--` 頂級網域);`文字<信箱>`、`x@gmail.com.` 一律擋 | 同一條 policy(20260928180100 嚴格化、180200 放行撇號與 punycode);前端 `JoinSupplierPage`、寄信端 `isDeliverableEmail()` 再各擋一次(三處規則要一起改) |
| honeypot 欄位 `website` | `JoinSupplierPage.tsx`(填了就假裝成功、不寫資料庫) |

頻率判斷一定要在資料庫裡做(同一把 advisory lock、同一個交易):放在 Edge Function 裡「先數再寄」,
併發請求每個數到的都是同一個數字。被略過的信也會記一筆 `status='skipped'` + `skip_reason`
(`email_24h` / `hourly_cap` / `owner_hourly_cap` / `invalid_email`)。
email 格式要嚴格是因為「同一個 email」是拿字串比的:寬鬆格式下 `a<victim@…>`、`b<victim@…>` 都算不同 email,
兩條頻率限制都擋不住;寄信服務還可能把 `文字<信箱>` 當成「顯示名稱 + 地址」,等於讓人在收件人名稱塞廣告。

**核准只接受待審(pending)的申請**:已退件的申請者已經收到退件信,不能再收到一封邀請信;
兩位管理員同時處理同一筆時,後到的那個會 409 並收回自己建的資料(復原失敗會據實回報還留著什麼)。

**寄件人**:寄給申請者的信用 `NOTIFY_FROM`(與 `notify` 共用,現值 `iFoodmap 食材地圖 <noreply@gathertaiwan.com>`),
業主通知用 `LEAD_NOTIFY_FROM`;申請者按「回覆」會寄到 `SUPPLIER_MAIL_REPLY_TO`(沒設就是 `LEAD_NOTIFY_TO` 的第一個)。
之後換成 ifoodmap.ai:在 Resend 驗證網域後改 `NOTIFY_FROM` 這個 secret 即可,不用改程式。

**確認有沒有寄出**:每封信都記在 `supplier_application_mails`(`status` / `resend_id` / `error`;寄給申請者的信另存 `body_text`)。

```sql
select application_id, kind, status, skip_reason, resend_id, error, created_at
from public.supplier_application_mails order by id desc limit 10;
```

**部署**(兩支都指定單一名稱;`verify_jwt` 見 `supabase/config.toml`):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy notify-lead --project-ref cwvpehqcvbfuynabpqop --no-verify-jwt --use-api
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy approve-supplier --project-ref cwvpehqcvbfuynabpqop --use-api
```

共用程式在 `supabase/functions/_shared/`(`supplier-mail.ts` 信件內容與 Resend、`db.ts` 介面),
`--use-api` 會一起上傳。邏輯都有 vitest:`approve-supplier/handler.test.ts`、`notify-lead/supplier-application.test.ts`、
`_shared/supplier-mail.test.ts`;資料庫規則用本機 Postgres 實跑(`supabase/tests/supplier_application_mail.test.ts`,
含「交易互相重疊的併發」與「拿掉 advisory lock 就會超量」的對照組;沒有 Postgres 的環境自動 skip 並印出原因)。

**還原**:依序跑 `supabase/rollbacks/` 的 `20260928180200_*` → `20260928180100_*` → `20260928180000_*.down.sql`
(還原 180000 前要先把 `approve-supplier` 換回舊版並重新部署,檔頭有寫)。

**Auth 邀請信模板**(餐廳成員邀請與供應商開通共用):主旨「設定密碼以啟用你的 iFoodmap 帳號」,
內文寫明「連結 1 小時內有效、只能用一次、失效可在連結頁重寄或用忘記密碼」。2026-09-28 用 Management API
`PATCH config/auth` 改(只動 `mailer_subjects_invite` / `mailer_templates_invite_content`)。
全站連結效期 `mailer_otp_exp` 維持 3600 秒不動;連結過期時 `/reset-password` 會顯示「連結已失效」並提供
「重新寄送設定密碼連結」(`resetPasswordForEmail`,邀請流程帶回 `?type=invite`)。

## 餐廳新增成員(invite-restaurant-member)

餐廳後台「分店與成員」頁(`src/pages/restaurant/RestaurantTeamPage.tsx`)的「新增成員」按鈕
(只有老闆看得到)會呼叫這支 Edge Function:建帳號 → 寫一筆**待接受**的 `restaurant_accounts`
(`accepted_at = null`)→ 寄邀請信。**對方登入後按「接受」才會成為成員**(見下方「邀請要對方接受才生效」)。
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
| SQL(接受制 + 權限收緊) | `supabase/migrations/20260928170000_restaurant_member_acceptance.sql`(rollback:`supabase/rollbacks/20260928170000_restaurant_member_acceptance.down.sql`) |
| SQL(profiles 不再公開) | `supabase/migrations/20260928170100_profiles_read_scope.sql`(rollback:`supabase/rollbacks/20260928170100_profiles_read_scope.down.sql`) |
| 前端(老闆) | `RestaurantTeamPage.tsx`(測試 `RestaurantTeamPage.test.tsx`) |
| 前端(受邀者) | `src/lib/restaurant-invites.ts` + `src/components/RestaurantInvitePanel.tsx`,掛在登入首頁 `LoginPortal.tsx` |

上表四個 migration 2026-09-28 都已用 Management API 套上線並補 ledger。
`supabase/rollbacks/*.down.sql` 不是 migration(不要搬進 `migrations/`),要還原時整段執行;
兩支都要還原的話先跑 profiles 那支。🔴 **還原順序**:① 先單獨跑 rollback 檔的「第 0 步」(停用所有待接受的邀請,
新程式下無害)→ ② 把前端與 `invite-restaurant-member`(v3 起)、`notify`(v5 起)退回舊版 → ③ 再整段跑 rollback。
程式都會查 `accepted_at`,沒先退版就拿掉欄位,PostgREST 會回 400:所有餐廳使用者會被當成沒有身分、邀請全失敗、訂單信不寄給餐廳;
第 0 步放最前面,則是為了退版期間舊版 notify 不會把訂單信寄給還沒接受的人。
資料庫層的測試:`supabase/tests/database/restaurant_member_acceptance.test.sql`(pgTAP,58 項;不用 dblink,可以整支包在 BEGIN … ROLLBACK 裡跑)。「兩個人同時各降一位老闆」要兩條連線,pgTAP 單一交易測不到 ——2026-09-28 在正式庫用兩個並行交易實測過:後到的那個會等鎖、拿到 23514,最後剩一位老闆。

### 🔴 部署用預設的 JWT 驗證(不要加 `--no-verify-jwt`)

```bash
SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy invite-restaurant-member \
  --project-ref cwvpehqcvbfuynabpqop --use-api
```

(2026-09-28 部署 v3「邀請寫成待接受」後,`GET /v1/projects/cwvpehqcvbfuynabpqop/functions` 確認 `verify_jwt: true`。)

跟 `ai` / `notify-lead` **相反**:這支一定是已登入的老闆從瀏覽器呼叫(帶 `Authorization: Bearer <使用者 JWT>`
+ `apikey`),所以讓 gateway 先擋掉沒登入的請求。`--use-api` 是因為本機沒有 Docker。
確認活著:不帶 token 打會回 gateway 的 401 `UNAUTHORIZED_NO_AUTH_HEADER`;
帶 anon key 當 Bearer 會回**函式自己的** 401 `{"code":"UNAUTHENTICATED",...}`(代表已部署、且 JWT 驗證是開的)。

### 授權邏輯(全部在伺服器端,不信前端)

1. `auth.getUser(JWT)` 失敗 → **401**
2. 呼叫者在 `restaurant_accounts` 沒有任何 `role='owner' AND is_active AND accepted_at IS NOT NULL` 的列 → **403**
   (還沒接受的「老闆邀請」不能拿來邀請別人)
3. 輸入驗證(email 格式、姓名 1–50 字、角色只能是 `owner` / `manager` / `purchaser`、分店/餐廳要是 UUID)→ **400**
4. 前端帶的 `restaurant_id` 只用來「指定哪一家」,必須在呼叫者當老闆的店裡,否則 **403**
   (沒帶且只當一家店的老闆 → 就是那家;是多家店的老闆又沒帶 → 400)
5. 餐廳已停用 → 403;分店不屬於這家店 / 已停用 → 400
6. 頻率限制:同一家店一小時內超過 20 次嘗試 → **429**。在資料庫裡原子化(advisory lock + 計數 + 記一筆
   在同一個交易),同時灌一堆請求也不會超量(2026-09-28 實測 8 個併發、上限 3 → 剛好 3 個過)。
   **排在查 email 之前**,所以回 409 的嘗試也算 —— 不然有人可以不限次數地探測誰有註冊
7. 這個 email 已經有帳號 → **409**,**一律不綁、不改**(`restaurant_invite_email_status()` 查,只開給 service_role):
   - 已邀請、對方還沒按「接受」(`member_pending`)→ `INVITE_PENDING`(訊息會教對方用「忘記密碼」設定密碼後登入按接受)
   - 已是本店啟用中成員 → `ALREADY_MEMBER`
   - 曾是本店成員、目前停用 → `MEMBER_INACTIVE`(請在列表按「啟用」,不用重新邀請)
   - 其他任何帳號(供應商、別家餐廳、平台管理員、註冊到一半的)→ `EMAIL_TAKEN`,訊息刻意不透露是哪種身分
8. `createUser`(`email_confirm: false`、`app_metadata = { role: "restaurant", invited_by, invited_restaurant_id }`,
   不會寄信)→ 寫 `restaurant_accounts`(**`accepted_at: null`**)→ `inviteUserByEmail` 寄信。
   後兩步失敗就刪掉剛建的 auth user(成員資料 cascade 刪掉);刪除失敗重試一次,
   還是失敗回 `ROLLBACK_FAILED`(請聯絡客服,不要重試)。log 只記 id 與錯誤 code,不記 email

`app_metadata.role = "restaurant"` 只是身分標記(沒有程式靠它判斷權限);**店內角色以 `restaurant_accounts.role` 為準** ——
老闆之後可以在成員頁改角色,寫進 JWT 會過期。**絕不能**對既有帳號呼叫 `updateUserById(app_metadata)`:
`app_metadata` 的 `role` 只有一格,覆蓋掉 `admin` 等於拔掉平台管理員權限(第 7 步先擋掉,就是為了這個)。
`invited_restaurant_id` 也留給之後用:見下方「已知風險」。

### 「邀請中」怎麼判斷

`restaurant_accounts.accepted_at IS NULL` —— 還沒按「接受」(不論有沒有點過邀請信)。成員頁直接看成員列的
`accepted_at`;`restaurant_member_directory(p_restaurant)` 的 `invite_pending` 也改成同一個判斷,它現在只用來拿 email
(只有該店已生效的成員查得到;email 只回給老闆與平台管理員,店長/採購員拿到 null)。

### 邀請要對方接受才生效(2026-09-28,migration 20260928170000)

- **是成員 = `is_active AND accepted_at IS NOT NULL`**。`current_restaurant_ids()`、`restaurant_role()`、
  `create_restaurant_onboarding()`、`restaurant_member_directory()` 都改成這個判斷,所以所有掛在這兩支輔助函式上的 RLS
  (訂單、菜單、分店、餐廳…)都不把待接受算進去;前端 `src/lib/portal.ts`、`RestaurantRoute`、`RegisterCompletePage`
  也只認已接受的列,`notify` 寄訂單信也只寄給已接受的老闆/店長。`accepted_at` 預設 NULL:任何寫入路徑忘了設都是「不生效」。
  (`notify` 2026-09-28 重新部署為 v5。它由 DB trigger 用共享密鑰呼叫,**部署要帶 `--no-verify-jwt`**:
  `supabase functions deploy notify --project-ref cwvpehqcvbfuynabpqop --use-api --no-verify-jwt`,部署後確認 `verify_jwt: false`。)
- **受邀者的畫面**:登入首頁(`LoginPortal`)登入後先查 `my_pending_restaurant_invites()`,有邀請就顯示
  「『X 餐廳』邀請你以『採購員』加入」+ 接受/拒絕(`RestaurantInvitePanel`),不會直接導進任何後台。
  從邀請信設定完密碼(`/reset-password` 會導回 `/`)、或 email 被搶先邀請後自己去註冊(`/register/complete`
  沒有註冊暫存資料時會導回 `/`)都走這裡。拒絕後沒有其他身分 → 同一個畫面直接輸入餐廳名稱建立自己的店
  (呼叫 `create_restaurant_onboarding()`,不依賴 user_metadata —— GoTrue 對「已存在未確認」的帳號 signUp 不會更新 metadata)。
- **RPC**(SECURITY DEFINER、`search_path = ''`、只處理 `auth.uid()` 自己那一筆待接受的列;anon 不能呼叫):
  `my_pending_restaurant_invites()`、`accept_restaurant_invite(id)`(回餐廳 id)、`decline_restaurant_invite(id)`(刪掉那筆邀請)。
  找不到(被取消/已處理/不是你的)一律 `P0001` + hint `invite_not_found`(HTTP 400)。
- **拒絕 = 刪掉那一筆邀請**。受邀者的帳號留著:前台登入首頁對「已登入、但沒有任何身分」的人一律顯示「建立自己的餐廳」
  (不再直接登出),所以拒絕後就算沒當場建店、之後回來也還走得下去;老闆把邀請停用的人也一樣。
  但同一個 email 之後再邀請會是 409 `EMAIL_TAKEN`(既有帳號一律不綁)—— 要讓既有帳號也能收邀請,得另外設計。
- **`restaurant_accounts` 的寫入權限**:anon 什麼都沒有;authenticated 只有 SELECT + `UPDATE (role, is_active, branch_id)`
  (欄位層級 GRANT —— 改不了 `user_id`/`restaurant_id`/`accepted_at`),UPDATE 的 policy 只給該店已生效的老闆與平台管理員。
  **沒有 INSERT/DELETE**:新增只能走 `create_restaurant_onboarding()` 或 Edge Function(service role);移除成員請「停用」。
  待接受的受邀者連自己那一列都讀不到。
- **trigger**:
  - `restaurant_accounts_keep_an_owner`:任何 UPDATE/DELETE 做完後,只要某家(還存在的)店沒有「已接受、啟用中的老闆」
    就整筆拒絕(`23514`「每家餐廳至少要保留一位啟用中的老闆」)。⚠️ 連 service role / Dashboard 也擋:
    **要刪某家店唯一老闆的 auth 帳號,得先刪掉那家餐廳**(cascade 不擋),否則 GoTrue 會回 Database error。
  - `restaurant_accounts_branch_matches`:成員綁的分店必須是同一家店的(`23503`)。

### profiles 不再公開(2026-09-28,migration 20260928170100)

anon 對 `profiles` 沒有任何權限;登入者只讀得到自己、自己已生效的店裡所有成員(含邀請中的人)、平台管理員讀全部
(`restaurant_teammate_user_ids()`)。app 裡讀 profiles 的只有 `RestaurantTeamPage`(用成員 user_id 查 display_name);
新帳號的 profile 由 `handle_new_user()`(SECURITY DEFINER trigger)建立,不受影響。

### 邀請信連結會落在哪

`redirectTo = ${SITE_URL}/reset-password?type=recovery`(`SITE_URL` 沒設時用 `https://dish-to-supply.vercel.app`)。
`/reset-password` 只在收到 `PASSWORD_RECOVERY` 事件時才顯示「設定新密碼」,而 supabase-js 解析網址時
**query 參數優先於 hash**,所以多帶 `?type=recovery` 就會進「設定新密碼」(2026-09-28 用無頭瀏覽器實測)。
連結過期(`mailer_otp_exp` = 3600 秒,**1 小時**)時沒有 session,會落到「忘記密碼」表單 ——
請對方用同一個 Email 重設密碼即可,這也是正確的退路。

⚠️ `approve-supplier` 的邀請連結目前**沒有**帶 `?type=recovery`:受邀的供應商點信後其實已登入,
但畫面停在「忘記密碼」。治本是讓 `ResetPasswordPage` 也認 `type=invite`。

### Email 預先佔用(2026-09-28 已處理)

原本:任何人都能自助註冊成老闆,再邀請一個「還沒註冊」的 email;對方之後自己去註冊、點完確認信回到
`/register/complete`,那一頁看到已有 `restaurant_accounts` 就直接導進 `/restaurant` —— 落進邀請者的店。
現在邀請是「待接受」,`/register/complete` 只認已接受的列,受邀者一定會先看到接受/拒絕畫面(見上一節)。

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

## 採購單簽核與 order_pipeline 權限(2026-09-29,migration 20260928190000 / 190100 / 190200 / 190300)

- **190000 `restaurant_draft_approval`**:`order_events` 的 BEFORE INSERT trigger `guard_order_submission`。「送出類」事件(目標是 submitted,或把 draft/cancelled 推往其他狀態)只放行平台管理員、系統(service_role 或沒有 JWT)、該店**已接受且啟用中**的老闆/店長;其他人回 42501。`supplier_orders` 的 INSERT policy:直接建 submitted 只限老闆/店長,其他人只能建 draft。
- **190100 `restaurant_order_update_guard`**:`supplier_orders` 的 BEFORE UPDATE trigger:任何人都不能改 `restaurant_id`(擋「A 店採購員兼 B 店老闆」把單搬來搬去);採購員只能改草稿,也不能自己填 `approved_by` / `approved_at`。
- **190200 / 190300 `order_pipeline`**:這個 view 原本會繞過 RLS 而且可寫(7 月起未登入者可讀進行中訂單的金額、可經由它寫入)。改成 `security_invoker`,anon 無任何權限,authenticated 只能 SELECT。
- 兩支 trigger 都只做唯讀查詢、不取列鎖,沒有改變既有的鎖順序。
- **rollback 一定要照順序**:`190300 → 190200 → 190100 → 190000`(`supabase/rollbacks/*.down.sql`)。順序反了,190000 那支會直接報錯擋下。
- 驗證:`supabase/tests/database/restaurant_draft_approval.test.sql`(72 項,在正式庫一律包在 BEGIN…ROLLBACK 裡跑)。

## 訂單狀態機與通知信閘門(2026-09-29,migration 20260929100000 / 100100 / 100200 / 100300、notify v8)

- **100000 `order_transition_rules`**:`order_transition_rules()` 列出 85 條允許的 (from, to, 角色) 轉移;`trg_guard_order_transition`(字母序排在 `trg_guard_order_submission` 之後)檢查每筆 order_events:身分必須名副其實(老闆/店長/採購員看 `restaurant_role()`、供應商看該單供應商的啟用帳號、管理員看 `is_admin()`、系統 = 沒有登入者且是 service_role 或沒有 JWT);`actor_id` 一律改寫成 `auth.uid()`;前端的 from_status 與目前狀態不同就擋(畫面過期,P0001),轉移不在表內就擋(42501)。同一個 INSERT 同一張單只能寫一筆事件。前端 `src/lib/orders.ts` 的 `TRANSITIONS` 與 SQL 逐條一致,vitest 會解析 migration 比對。
- **100100 `order_event_side_effects`**:派單寫 supplier_id、報價寫 total_amount 並留報價紀錄、出貨新增出貨紀錄,都和狀態在同一個交易。
- **100200 `order_integrity_hardening`**:送出後只有管理員/系統能直接改供應商與金額;建單不能帶供應商;供應商不能直接寫出貨紀錄、報價只能新增。派單與出貨先鎖供應商再鎖訂單(與刪供應商同順序)。
- **100300 `shipment_receipt_columns`**:餐廳對出貨紀錄只能回填收貨三欄。
- **rollback 順序**:`100300 → 100200 → 100100 → 100000`(`supabase/rollbacks/*.down.sql`,有順序保護)。驗證:`supabase/tests/database/order_transition_rules.test.sql`(172 項)、`order_integrity_hardening.test.sql`(37)、`shipment_receipt_columns.test.sql`(14),在正式庫一律包在 BEGIN…ROLLBACK。
- **通知信閘門**:notify 在 secret `NOTIFY_LIVE` 不等於字串 `"true"` 時,把同一種收件對象合併成一封寄到 ifoodmaptw@gmail.com,主旨加「[測試轉寄]」,內文列出原收件人。**目前刻意沒設 NOTIFY_LIVE**(正式庫有真實的供應商信箱)。要對真實餐廳/供應商開放時,由業主同意後 `supabase secrets set NOTIFY_LIVE=true --project-ref cwvpehqcvbfuynabpqop`(改 secret 會讓所有 function 重新部署一次)。
- 訂單編號一律用 `src/lib/order-number.ts` 的 `formatOrderNo`(「#」+ 末 8 碼大寫),notify 也直接引用它。
