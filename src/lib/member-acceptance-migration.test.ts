// 「邀請要對方接受才生效」的靜態護欄:這幾個地方改壞了不會有任何畫面報錯,只會默默把
// 待接受的邀請當成正式成員(或把 rollback 變危險),所以直接檢查原始碼 / SQL。
// 真正的行為測試在 supabase/tests/database/restaurant_member_acceptance.test.sql(pgTAP)。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
/** 拿掉 -- 註解、壓縮空白、轉小寫(只比對真正會執行的 SQL) */
const norm = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();

const migration = norm(read("supabase/migrations/20260928170000_restaurant_member_acceptance.sql"));
const profilesMigration = norm(read("supabase/migrations/20260928170100_profiles_read_scope.sql"));
const rollback = read("supabase/rollbacks/20260928170000_restaurant_member_acceptance.down.sql");

/** 取出某支函式的 CREATE ... $$ ... $$; 整段 */
const fnDef = (sql: string, name: string) => {
  const m = sql.match(new RegExp(`create or replace function public\\.${name}\\(.*?\\$\\$.*?\\$\\$;`));
  expect(m, `找不到 ${name}`).not.toBeNull();
  return m![0];
};

describe("notify:訂單信只寄給已接受的老闆/店長", () => {
  it("restaurant_accounts 收件人查詢帶 accepted_at 不是 null", () => {
    const src = read("supabase/functions/notify/index.ts");
    const q = src.slice(src.indexOf('.from("restaurant_accounts")'), src.indexOf('.in("role", ["owner", "manager"])'));
    expect(q).toContain('.eq("is_active", true)');
    expect(q).toContain('.not("accepted_at", "is", null)');
  });
});

describe("migration 20260928170000", () => {
  it("accepted_at 沒有預設值(忘了設 = 待接受),既有資料回填成已生效", () => {
    expect(migration).toContain("add column if not exists accepted_at timestamptz;");
    expect(migration).not.toMatch(/accepted_at timestamptz (not null|default)/);
    expect(migration).toContain("set accepted_at = created_at where accepted_at is null;");
  });

  it.each(["current_restaurant_ids", "restaurant_role"])("%s 只算已接受、啟用中的列", (name) => {
    expect(fnDef(migration, name)).toContain("is_active and accepted_at is not null");
  });

  it("自助註冊:只把已接受的列當成已有餐廳,自己建的店直接押 accepted_at", () => {
    const def = fnDef(migration, "create_restaurant_onboarding");
    expect(def).toContain("and is_active and accepted_at is not null");
    expect(def).toMatch(/is_active, accepted_at \) values \( v_user_id, v_restaurant_id, v_branch_id, 'owner', true, now\(\) \)/);
  });

  it.each(["my_pending_restaurant_invites", "accept_restaurant_invite", "decline_restaurant_invite"])(
    "%s:SECURITY DEFINER、search_path 固定為空、只看 auth.uid() 自己的列、anon 不能呼叫",
    (name) => {
      const def = fnDef(migration, name);
      expect(def).toContain("security definer");
      expect(def).toContain("set search_path = ''");
      expect(def).toMatch(/ra\.user_id = (auth\.uid\(\)|v_uid)/);
      expect(migration).toContain(`revoke all on function public.${name}(`);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([a-z]*\\) from anon;`));
    },
  );

  it("restaurant_accounts:沒有 FOR ALL policy;authenticated 只有 SELECT + 三個欄位的 UPDATE", () => {
    expect(migration).toContain('drop policy if exists "rest accounts owner manage" on public.restaurant_accounts;');
    expect(migration).not.toMatch(/create policy [^;]+ on public\.restaurant_accounts for all/);
    expect(migration).not.toMatch(/create policy [^;]+ on public\.restaurant_accounts for (insert|delete)/);
    expect(migration).toContain("revoke all on public.restaurant_accounts from anon;");
    expect(migration).toContain("revoke all on public.restaurant_accounts from authenticated;");
    expect(migration).toContain("grant select on public.restaurant_accounts to authenticated;");
    expect(migration).toContain("grant update (role, is_active, branch_id) on public.restaurant_accounts to authenticated;");
    // 自己那一列要「已接受」才讀得到
    expect(migration).toContain("(user_id = auth.uid() and accepted_at is not null)");
  });

  it("老闆守門 trigger:AFTER ROW、UPDATE 與 DELETE 都掛、只看原本生效中的老闆列", () => {
    expect(migration).toMatch(
      /create trigger restaurant_accounts_keep_an_owner after update or delete on public\.restaurant_accounts for each row when \(old\.role = 'owner' and old\.is_active and old\.accepted_at is not null\)/,
    );
    expect(fnDef(migration, "restaurant_accounts_keep_an_owner")).toContain("for no key update");
  });
});

describe("migration 20260928170100(profiles)", () => {
  it("拿掉公開讀取、anon 沒有任何權限", () => {
    expect(profilesMigration).toContain('drop policy if exists "profiles are viewable by everyone" on public.profiles;');
    expect(profilesMigration).toContain("revoke all on public.profiles from anon;");
    expect(profilesMigration).not.toMatch(/create policy [^;]+ on public\.profiles for select to (anon|public)/);
    expect(profilesMigration).not.toContain("using (true)");
  });
});

describe("rollback", () => {
  it("第一步就把待接受的邀請停用 —— 在放寬輔助函式、拿掉欄位之前", () => {
    const deactivate = rollback.indexOf("SET is_active = false\n WHERE accepted_at IS NULL;");
    expect(deactivate).toBeGreaterThan(-1);
    expect(deactivate).toBeLessThan(rollback.indexOf("CREATE OR REPLACE FUNCTION public.current_restaurant_ids()"));
    expect(deactivate).toBeLessThan(rollback.indexOf("DROP COLUMN IF EXISTS accepted_at"));
  });

  it("不自己 COMMIT(才能包在 BEGIN … ROLLBACK 裡演練)", () => {
    expect(rollback).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/m);
  });
});
