#!/usr/bin/env node
/**
 * 比對 repo 裡的 migration 檔案與線上資料庫實際套用的紀錄。
 *
 * 為什麼需要這支:2026-07-27 發現 20260726150000_restaurant_self_signup.sql
 * 躺在 repo 好幾天沒被套上線,前端一直呼叫一個不存在的 RPC —— 餐廳註冊從頭到尾
 * 不可能成功,而且沒有任何機制會告訴我們。
 *
 * 用法:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xxx node scripts/check-migrations.mjs
 *
 * 有落差時以 exit code 1 結束,讓 CI 變紅。
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !REF) {
  console.error("需要 SUPABASE_ACCESS_TOKEN 與 SUPABASE_PROJECT_REF 兩個環境變數");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

/** 檔名 20260726150000_restaurant_self_signup.sql → { version, name } */
const parseFile = (file) => {
  const m = /^(\d+)_(.+)\.sql$/.exec(file);
  return m ? { version: m[1], name: m[2], file } : null;
};

const repoMigrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map(parseFile)
  .filter(Boolean)
  .sort((a, b) => a.version.localeCompare(b.version));

const runQuery = async (sql) => {
  // Cloudflare 會擋掉沒有瀏覽器 UA 的請求(1010)
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
};

// 網路偶發失敗不該讓 CI 誤報 drift
const withRetry = async (fn, tries = 3) => {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
};

const main = async () => {
  const rows = await withRetry(() =>
    runQuery("select version from supabase_migrations.schema_migrations order by version"),
  );

  const applied = new Set((rows ?? []).map((r) => String(r.version)));
  const missing = repoMigrations.filter((m) => !applied.has(m.version));
  const extra = [...applied].filter((v) => !repoMigrations.some((m) => m.version === v));

  console.log(`repo migration : ${repoMigrations.length} 個`);
  console.log(`線上已套用     : ${applied.size} 個`);

  if (extra.length > 0) {
    // 線上有、repo 沒有 —— 通常是 dashboard 直接改的,提醒但不擋
    console.log("");
    console.log(`⚠️  線上有 ${extra.length} 筆 repo 裡找不到的紀錄(可能是 dashboard 直接改的):`);
    extra.forEach((v) => console.log(`     ${v}`));
  }

  if (missing.length === 0) {
    console.log("");
    console.log("✅ 沒有落差 —— repo 的 migration 都已套用到線上");
    return;
  }

  console.log("");
  console.error(`❌ 有 ${missing.length} 個 migration 還沒套到線上資料庫:`);
  missing.forEach((m) => console.error(`     ${m.file}`));
  console.error("");
  console.error("這代表線上缺少這些 migration 建立的資料表/函式/policy,");
  console.error("依賴它們的功能會在正式站上靜默失敗。");
  console.error("");
  console.error("套用方式(擇一):");
  console.error("  1. Supabase Dashboard → SQL Editor,把檔案內容貼上執行");
  console.error("  2. supabase db push --linked(需要該專案的存取權)");
  console.error("");
  console.error("套用後記得補上 ledger,下次檢查才會過:");
  console.error("  insert into supabase_migrations.schema_migrations (version, name)");
  console.error("  values ('<版本號>', '<檔名去掉版本與 .sql>');");
  process.exit(1);
};

main().catch((err) => {
  console.error("檢查失敗:", err.message);
  process.exit(2);
});
