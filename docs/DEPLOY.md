# iFoodmap 部署

同一份 codebase 部署成兩個 Vercel 站,用建置變數 `VITE_PORTAL` 分流。

| 站台 | 網址 | 內容 | 部署方式 |
|---|---|---|---|
| **前台 + 餐廳 + 供應商** | https://dish-to-supply.vercel.app | 登入首頁、餐廳後台、供應商後台、公開頁 | GitHub push main **自動部署** |
| **平台營運後台** | https://ifoodmap-admin.vercel.app | 只有 `/admin/*` | **手動** `vercel deploy --prod` |

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

## 前台站(自動)

```bash
git push origin main
```

## 管理員站(手動,改到 admin 相關程式碼時要重跑)

CLI 登入的帳號在 `Armand's projects` team;`dish-to-supply` 屬於另一個 team,
所以管理員站是獨立專案、走 prebuilt 靜態部署,不接 GitHub。

```bash
cd ~/.gemini/File/ifoodmap
VITE_PORTAL=admin npm run build
rm -rf /tmp/ifoodmap-admin && mkdir -p /tmp/ifoodmap-admin
cp -R dist/* /tmp/ifoodmap-admin/ && cp vercel.json /tmp/ifoodmap-admin/
cd /tmp/ifoodmap-admin && npx vercel deploy --prod --yes --name ifoodmap-admin
```

跑完記得回專案 `npm run build` 一次,否則本機 `dist/` 會留著 admin 版本。

## 跨站 session

兩站是不同 origin,Supabase session 存在各自的 localStorage,**不共用**。
所以身分切換器(`src/components/PortalSwitcher.tsx`)切到管理員站時會標示
「另開新站,需重新登入」—— 這是預期行為,也是權限隔離的好處。

## 路由分流的實作

`src/lib/portal.ts` 匯出 `IS_ADMIN_BUILD`,`src/App.tsx` 依它渲染 `<AdminRoutes />`
或 `<MainRoutes />`。要新增頁面時記得掛在正確的那一組。
