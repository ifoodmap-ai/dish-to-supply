// @vitest-environment node
//
// 供應商申請寄信 migration(20260928180000_supplier_application_mail.sql)的行為測試。
//
// 防濫用的規則都在資料庫裡(trigger + 部分唯一索引 + policy),光看 SQL 字串證明不了什麼,
// 所以這支會開一個「用完即丟」的本機 Postgres:
//   - initdb 到暫存目錄、只開 Unix socket(listen_addresses=''),不佔任何 TCP port
//   - 先建 Supabase 的最小替身(anon / authenticated / service_role、auth.users、auth.jwt()、
//     is_admin()、pg_net 的 net.http_post 換成「記下來」的假函式)
//   - 再套「原本的」supplier_applications 建表 + policy(直接從舊 migration 擷取)與這次的 migration
// 用不了 Postgres(找不到 initdb / pg_ctl / psql,或裝了但起不來,例如 CI)時整組 skip,
// 並在輸出印出原因 —— 不會讓 `npx vitest run` 變紅。
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20260928180000_supplier_application_mail.sql"),
  "utf8",
);
// 20260928180100 把匿名送件的 email 改成嚴格格式(補 180000)
const MIGRATION_STRICT_EMAIL = readFileSync(
  join(ROOT, "supabase/migrations/20260928180100_supplier_application_strict_email.sql"),
  "utf8",
);
// 20260928180200 放寬撇號與 punycode 頂級網域
const MIGRATION_RARE_FORMS = readFileSync(
  join(ROOT, "supabase/migrations/20260928180200_supplier_application_email_rare_forms.sql"),
  "utf8",
);
const SEED = readFileSync(join(ROOT, "supabase/migrations/20260705100000_seed_sprint_loop.sql"), "utf8");
const ROLLBACK = readFileSync(join(ROOT, "supabase/rollbacks/20260928180000_supplier_application_mail.down.sql"), "utf8");
const ROLLBACK_RARE_FORMS = readFileSync(
  join(ROOT, "supabase/rollbacks/20260928180200_supplier_application_email_rare_forms.down.sql"),
  "utf8",
);
const ROLLBACK_STRICT_EMAIL = readFileSync(
  join(ROOT, "supabase/rollbacks/20260928180100_supplier_application_strict_email.down.sql"),
  "utf8",
);

const hasBinary = (bin: string) => {
  try {
    return spawnSync(bin, ["--version"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
};

// 只用 Unix socket;port 只決定 socket 檔名(.s.PGSQL.5932),不會真的開 TCP
const PORT = "5932";
let baseDir = "";
let dataDir = "";
let sockDir = "";
// macOS 上沒有合法 locale 時 postmaster 會拒絕啟動(became multithreaded during startup)
const PG_ENV = { ...process.env, LC_ALL: "C" };

const psqlArgs = () => ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", sockDir, "-p", PORT, "-U", "postgres", "-d", "postgres"];

const stopPostgres = () => {
  if (dataDir && existsSync(dataDir)) {
    spawnSync("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"], { encoding: "utf8", env: PG_ENV });
  }
  if (baseDir) rmSync(baseDir, { recursive: true, force: true });
  if (sockDir && sockDir !== baseDir) rmSync(sockDir, { recursive: true, force: true });
  baseDir = dataDir = sockDir = "";
};

/** 在收集測試的當下就把 Postgres 開起來;任何一步失敗都回傳原因,整組改成 skip */
const startPostgres = (): { ok: true } | { ok: false; reason: string } => {
  const missing = ["initdb", "pg_ctl", "psql"].filter((b) => !hasBinary(b));
  if (missing.length) return { ok: false, reason: `找不到 ${missing.join(" / ")}` };
  try {
    baseDir = mkdtempSync(join(tmpdir(), "sam-"));
    dataDir = join(baseDir, "data");
    // Unix socket 路徑上限約 103 字元;tmpdir 太長就退回 /tmp
    sockDir = join(baseDir, ".s.PGSQL.5932").length < 100 ? baseDir : mkdtempSync("/tmp/sams-");
    const init = spawnSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale", "-N"], {
      encoding: "utf8",
      env: PG_ENV,
    });
    if (init.status !== 0) {
      const reason = `initdb 失敗:${(init.stderr || init.stdout || String(init.error ?? "")).trim().slice(0, 300)}`;
      stopPostgres();
      return { ok: false, reason };
    }
    const logFile = join(baseDir, "pg.log");
    const start = spawnSync(
      "pg_ctl",
      ["-D", dataDir, "-w", "-t", "20", "-l", logFile, "-o", `-c listen_addresses='' -k ${sockDir} -p ${PORT} -c fsync=off`, "start"],
      { encoding: "utf8", env: PG_ENV },
    );
    if (start.status !== 0) {
      const log = existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").slice(-3).join(" | ") : "";
      const reason = `pg_ctl 起不來:${(log || start.stderr || start.stdout).trim().slice(0, 300)}`;
      stopPostgres();
      return { ok: false, reason };
    }
    const ping = spawnSync("psql", [...psqlArgs(), "-c", "select 1"], { encoding: "utf8" });
    if (ping.status !== 0) {
      const reason = `連不上剛起來的 Postgres:${(ping.stderr || "").trim().slice(0, 300)}`;
      stopPostgres();
      return { ok: false, reason };
    }
    return { ok: true };
  } catch (e) {
    stopPostgres();
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
};

/** 跑一段 SQL,回傳 stdout;失敗時丟出 stderr(測試用 toThrow 比對錯誤訊息) */
const sql = (text: string): string => {
  const r = spawnSync("psql", [...psqlArgs(), "-f", "-"], { input: text, encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `psql exit ${r.status}`).trim());
  return r.stdout.trim();
};
const sqlJson = <T = unknown>(query: string): T => JSON.parse(sql(query) || "null") as T;

/** 以匿名身分送申請(跟瀏覽器打 PostgREST 一樣會套 RLS policy) */
const anonApply = (email: string, extra = "") =>
  sql(`SET ROLE anon; INSERT INTO public.supplier_applications (company_name, contact_email${extra ? ", " + extra.split("=")[0] : ""})
       VALUES ('測試公司', '${email.replace(/'/g, "''")}'${extra ? ", " + extra.split("=").slice(1).join("=") : ""});`);

interface MailRow {
  kind: string;
  status: string;
  skip_reason: string | null;
  email_key: string | null;
}
const mailsFor = (email: string) =>
  sqlJson<MailRow[] | null>(`
    SELECT json_agg(json_build_object('kind', m.kind, 'status', m.status, 'skip_reason', m.skip_reason, 'email_key', m.email_key) ORDER BY m.kind)
      FROM public.supplier_application_mails m
      JOIN public.supplier_applications a ON a.id = m.application_id
     WHERE a.contact_email = '${email}';`) ?? [];
const confirmationOf = (email: string) => mailsFor(email).find((m) => m.kind === "applicant_confirmation");
const ownerOf = (email: string) => mailsFor(email).find((m) => m.kind === "owner_notification");

const BOOTSTRAP = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  -- Supabase 預設會把 public 裡新建的表 / 函式權限開給這三個角色,migration 要自己收回
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    is_sso_user boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS
    $$ SELECT COALESCE(auth.jwt()->'app_metadata'->>'role', '') = 'admin' $$;

  -- pg_net 替身:不真的打 HTTP,只記下來;test.net_fail=on 時模擬 pg_net 壞掉
  CREATE SCHEMA net;
  CREATE TABLE net.calls (id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb, timeout_ms int);
  CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
                                headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE plpgsql AS $$
  DECLARE v bigint;
  BEGIN
    IF current_setting('test.net_fail', true) = 'on' THEN RAISE EXCEPTION 'pg_net is down'; END IF;
    INSERT INTO net.calls (url, headers, body, timeout_ms) VALUES (url, headers, body, timeout_milliseconds)
    RETURNING id INTO v;
    RETURN v;
  END $$;
  GRANT USAGE ON SCHEMA net TO anon, authenticated;

  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, name text);
  INSERT INTO supabase_migrations.schema_migrations VALUES
    ('20260928180000', 'supplier_application_mail'),
    ('20260928180100', 'supplier_application_strict_email'),
    ('20260928180200', 'supplier_application_email_rare_forms');

  CREATE TABLE public.app_config (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.supplier_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
    is_active boolean NOT NULL DEFAULT true
  );
`;

/** 舊 migration 裡 supplier_applications 的建表 + 兩條 policy,原封不動拿來用 */
const originalApplicationsDdl = () => {
  const m = SEED.match(/CREATE TABLE IF NOT EXISTS public\.supplier_applications[\s\S]*?CREATE POLICY "admin manage applications"[^;]*;/);
  if (!m) throw new Error("找不到 supplier_applications 的原始建表語句");
  return m[0];
};

const resetData = () =>
  sql(`
    RESET ROLE;
    TRUNCATE public.supplier_application_mails, net.calls RESTART IDENTITY;
    DELETE FROM public.supplier_applications;
    DELETE FROM public.supplier_accounts; DELETE FROM public.suppliers; DELETE FROM auth.users;
    DELETE FROM public.app_config;
    INSERT INTO public.app_config (key, value) VALUES
      ('lead_notify_function_url', 'https://example.test/functions/v1/notify-lead'),
      ('lead_hook_secret', 'test-secret');
  `);

const PG = startPostgres();
if (!PG.ok) {
  console.warn(`[supplier_application_mail.test] 跳過資料庫行為測試(${PG.reason})`);
}
// 不管整組有沒有 skip,這個檔案結束就把 Postgres 關掉、刪掉暫存目錄
afterAll(stopPostgres);
process.once("exit", stopPostgres);

describe.skipIf(!PG.ok)("供應商申請寄信 migration(真的 Postgres)", () => {
  beforeAll(() => {
    sql(BOOTSTRAP);
    sql(originalApplicationsDdl());
    sql(MIGRATION);
    sql(MIGRATION_STRICT_EMAIL);
    sql(MIGRATION_RARE_FORMS);
    // 再套一次:migration 必須可以重跑(IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS)
    sql(MIGRATION);
    sql(MIGRATION_STRICT_EMAIL);
    sql(MIGRATION_RARE_FORMS);
  }, 60_000);

  beforeEach(() => {
    resetData();
  });

  describe("規則 1:同一個 email 只能有一筆待審申請", () => {
    it("第二筆待審(大小寫不同也算同一個)會被部分唯一索引擋下", () => {
      anonApply("dup@example.com");
      expect(() => anonApply("DUP@Example.com")).toThrow(/supplier_applications_one_pending_per_email/);
      // 前後空白:匿名送件會先被 policy 的格式檢查擋下;繞過 policy(管理員)也一樣撞索引
      expect(() => anonApply(" dup@example.com ")).toThrow(/row-level security/);
      expect(() =>
        sql(`INSERT INTO public.supplier_applications (company_name, contact_email) VALUES ('x', ' Dup@example.com ')`),
      ).toThrow(/supplier_applications_one_pending_per_email/);
      expect(sql(`SELECT count(*) FROM public.supplier_applications`)).toBe("1");
    });

    it("前一筆核准或退件之後,同一個 email 可以再申請", () => {
      anonApply("again@example.com");
      sql(`UPDATE public.supplier_applications SET status = 'rejected' WHERE contact_email = 'again@example.com'`);
      expect(() => anonApply("again@example.com")).not.toThrow();
      expect(sql(`SELECT count(*) FROM public.supplier_applications WHERE contact_email = 'again@example.com'`)).toBe("2");
    });
  });

  describe("規則 2:同一個 email 24 小時內最多收一封確認信", () => {
    it("24 小時內第二次申請:業主照樣收到通知,確認信標成 skipped(email_24h)", () => {
      anonApply("repeat@example.com");
      expect(confirmationOf("repeat@example.com")).toMatchObject({ status: "queued", skip_reason: null });
      sql(`UPDATE public.supplier_applications SET status = 'approved' WHERE contact_email = 'repeat@example.com'`);

      anonApply("repeat@example.com");
      const rows = sqlJson<MailRow[]>(`
        SELECT json_agg(json_build_object('kind', kind, 'status', status, 'skip_reason', skip_reason, 'email_key', email_key) ORDER BY id)
          FROM public.supplier_application_mails`);
      expect(rows.filter((r) => r.kind === "applicant_confirmation").map((r) => [r.status, r.skip_reason])).toEqual([
        ["queued", null],
        ["skipped", "email_24h"],
      ]);
      expect(rows.filter((r) => r.kind === "owner_notification").map((r) => r.status)).toEqual(["queued", "queued"]);
    });

    it("同一個信箱換 +tag、大小寫、gmail 加點,也算同一個人", () => {
      anonApply("Victim.Name@gmail.com");
      anonApply("victimname+spam1@gmail.com");
      anonApply("VICTIM.NAME+2@googlemail.com");
      const confirmations = sqlJson<MailRow[]>(`
        SELECT json_agg(json_build_object('kind', kind, 'status', status, 'skip_reason', skip_reason, 'email_key', email_key) ORDER BY id)
          FROM public.supplier_application_mails WHERE kind = 'applicant_confirmation'`);
      expect(confirmations.map((c) => c.email_key)).toEqual([
        "victimname@gmail.com",
        "victimname@gmail.com",
        "victimname@gmail.com",
      ]);
      expect(confirmations.map((c) => c.status)).toEqual(["queued", "skipped", "skipped"]);
    });

    it("超過 24 小時就可以再收一封", () => {
      anonApply("later@example.com");
      sql(`UPDATE public.supplier_applications SET status = 'approved';
           UPDATE public.supplier_application_mails SET created_at = now() - interval '25 hours';`);
      anonApply("later@example.com");
      const statuses = sql(`SELECT string_agg(status, ',' ORDER BY id) FROM public.supplier_application_mails WHERE kind = 'applicant_confirmation'`);
      expect(statuses).toBe("queued,queued");
    });

    it("被略過(skipped)的那次不會延長 24 小時的窗口", () => {
      anonApply("window@example.com");
      sql(`UPDATE public.supplier_applications SET status = 'approved'`);
      anonApply("window+2@example.com"); // skipped
      sql(`UPDATE public.supplier_applications SET status = 'approved';
           UPDATE public.supplier_application_mails SET created_at = now() - interval '25 hours' WHERE status = 'queued';`);
      anonApply("window+3@example.com");
      expect(confirmationOf("window+3@example.com")).toMatchObject({ status: "queued" });
    });

    it("正規化函式本身", () => {
      const key = (e: string) => sql(`SELECT public.supplier_mail_email_key('${e}')`);
      expect(key(" Foo.Bar+news@GMail.com ")).toBe("foobar@gmail.com");
      expect(key("foo.bar+x@company.com.tw")).toBe("foo.bar@company.com.tw");
      expect(key("ifoodmaptw+apply-test@gmail.com")).toBe("ifoodmaptw@gmail.com");
    });
  });

  describe("規則 3:全站每小時確認信上限", () => {
    it("超過上限的申請不寄確認信(hourly_cap),但業主通知照寄", () => {
      sql(`INSERT INTO public.app_config (key, value) VALUES ('supplier_application_confirm_hourly_cap', '3')`);
      for (const n of [1, 2, 3, 4]) anonApply(`cap${n}@example.com`);
      expect([1, 2, 3, 4].map((n) => confirmationOf(`cap${n}@example.com`)?.status)).toEqual([
        "queued",
        "queued",
        "queued",
        "skipped",
      ]);
      expect(confirmationOf("cap4@example.com")?.skip_reason).toBe("hourly_cap");
      expect([1, 2, 3, 4].map((n) => ownerOf(`cap${n}@example.com`)?.status)).toEqual(["queued", "queued", "queued", "queued"]);
    });

    it("一小時前的不算進上限", () => {
      sql(`INSERT INTO public.app_config (key, value) VALUES ('supplier_application_confirm_hourly_cap', '1')`);
      anonApply("old@example.com");
      sql(`UPDATE public.supplier_application_mails SET created_at = now() - interval '61 minutes'`);
      anonApply("new@example.com");
      expect(confirmationOf("new@example.com")?.status).toBe("queued");
    });

    it("沒設定時預設每小時 20 封", () => {
      for (let n = 1; n <= 21; n += 1) anonApply(`default${n}@example.com`);
      const counts = sqlJson<Record<string, number>>(`
        SELECT json_object_agg(status, n) FROM (
          SELECT status, count(*) AS n FROM public.supplier_application_mails
           WHERE kind = 'applicant_confirmation' GROUP BY status) s`);
      expect(counts).toEqual({ queued: 20, skipped: 1 });
    });

    // 每個連線在同一個交易裡「寫入 → 停 0.4 秒 → commit」,交易互相重疊。
    // 有鎖時結果與時序無關:trigger 一個一個排隊,永遠剛好停在上限。
    const concurrentApplies = (n: number, prefix: string) =>
      Promise.all(
        Array.from({ length: n }, (_, i) =>
          execFileAsync("psql", [
            ...psqlArgs(),
            "-c",
            `BEGIN; SET ROLE anon;
             INSERT INTO public.supplier_applications (company_name, contact_email) VALUES ('併發', '${prefix}${i}@example.com');
             SELECT pg_sleep(0.4); COMMIT;`,
          ]),
        ),
      );
    const queuedConfirmations = () =>
      Number(sql(`SELECT count(*) FROM public.supplier_application_mails WHERE kind = 'applicant_confirmation' AND status = 'queued'`));

    it("同時灌進來(交易互相重疊)也不會超量:advisory lock", async () => {
      sql(`INSERT INTO public.app_config (key, value) VALUES ('supplier_application_confirm_hourly_cap', '3')`);
      await concurrentApplies(8, "race");
      expect(sql(`SELECT count(*) FROM public.supplier_applications`)).toBe("8");
      expect(queuedConfirmations()).toBe(3);
    }, 30_000);

    // 決定性的兩段式:A 寫入後停在 pg_sleep(交易還沒 commit),確定 A 真的在睡之後才放 B 進來。
    // 有鎖:B 的 trigger 會卡在 advisory lock(看得到一把沒拿到的 advisory 鎖),等 A commit 才數 → 略過。
    // 沒鎖:B 看不到 A 還沒 commit 的那筆 → 兩封都排隊(超量)。這樣就不靠運氣證明鎖真的有作用。
    const twoPhase = async (prefix: string) => {
      const a = execFileAsync("psql", [
        ...psqlArgs(),
        "-c",
        `BEGIN; SET ROLE anon;
         INSERT INTO public.supplier_applications (company_name, contact_email) VALUES ('A', '${prefix}-a@example.com');
         SELECT pg_sleep(2); COMMIT;`,
      ]);
      const aSleeping = async () => {
        for (let i = 0; i < 100; i += 1) {
          if (sql(`SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(2)%' AND wait_event = 'PgSleep'`) === "1") return;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error("A 沒有進入 pg_sleep");
      };
      await aSleeping();
      const b = execFileAsync("psql", [
        ...psqlArgs(),
        "-c",
        `SET ROLE anon; INSERT INTO public.supplier_applications (company_name, contact_email) VALUES ('B', '${prefix}-b@example.com');`,
      ]);
      // B 有沒有卡在 advisory lock 上(A 還在睡的期間觀察)
      let bWaitedOnLock = false;
      for (let i = 0; i < 20 && !bWaitedOnLock; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        bWaitedOnLock = sql(`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`) !== "0";
      }
      await Promise.all([a, b]);
      return { bWaitedOnLock, queued: queuedConfirmations() };
    };

    it("決定性驗證:A 還沒 commit 時進來的 B 會被鎖擋住,等 A commit 後才數到 A → 不超量", async () => {
      sql(`INSERT INTO public.app_config (key, value) VALUES ('supplier_application_confirm_hourly_cap', '1')`);
      const r = await twoPhase("locked");
      expect(r.bWaitedOnLock).toBe(true);
      expect(r.queued).toBe(1);
      expect(confirmationOf("locked-b@example.com")).toMatchObject({ status: "skipped", skip_reason: "hourly_cap" });
    }, 30_000);

    it("對照組:拿掉 advisory lock 的同一支 trigger,同樣的時序就會超量(證明上面測的真的是鎖)", async () => {
      const fn = MIGRATION.match(/CREATE OR REPLACE FUNCTION public\.supplier_application_queue_mails\(\)[\s\S]*?\n\$\$;/);
      expect(fn, "找不到 trigger 函式定義").not.toBeNull();
      const withoutLock = fn![0].replace(/^\s*PERFORM pg_advisory_xact_lock\(.*\);\s*$/m, "");
      expect(withoutLock).not.toContain("pg_advisory_xact_lock");
      try {
        sql(withoutLock);
        sql(`INSERT INTO public.app_config (key, value) VALUES ('supplier_application_confirm_hourly_cap', '1')`);
        const r = await twoPhase("nolock");
        expect(r.bWaitedOnLock).toBe(false);
        expect(r.queued).toBe(2);
      } finally {
        sql(fn![0]); // 換回有鎖的版本
      }
      expect(sql(`SELECT pg_get_functiondef('public.supplier_application_queue_mails'::regproc) LIKE '%pg_advisory_xact_lock%'`)).toBe("t");
    }, 30_000);

    it("業主通知另有每小時上限(預設 30,可調)", () => {
      sql(`INSERT INTO public.app_config (key, value) VALUES ('supplier_application_owner_hourly_cap', '2')`);
      for (const n of [1, 2, 3]) anonApply(`owner${n}@example.com`);
      expect(ownerOf("owner3@example.com")).toMatchObject({ status: "skipped", skip_reason: "owner_hourly_cap" });
      expect(confirmationOf("owner3@example.com")?.status).toBe("queued");
    });
  });

  describe("觸發寄信(pg_net)", () => {
    it("有信要寄才呼叫 notify-lead,而且只帶申請 id(不帶內容)", () => {
      anonApply("hook@example.com");
      const calls = sqlJson<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }[]>(
        `SELECT json_agg(json_build_object('url', url, 'headers', headers, 'body', body)) FROM net.calls`,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://example.test/functions/v1/notify-lead");
      expect(calls[0].headers.Authorization).toBe("Bearer test-secret");
      const id = sql(`SELECT id FROM public.supplier_applications WHERE contact_email = 'hook@example.com'`);
      expect(calls[0].body).toEqual({ type: "INSERT", table: "supplier_applications", schema: "public", record: { id } });
    });

    it("兩封都被略過就不呼叫", () => {
      sql(`INSERT INTO public.app_config (key, value) VALUES
             ('supplier_application_confirm_hourly_cap', '0'), ('supplier_application_owner_hourly_cap', '0')`);
      anonApply("quiet@example.com");
      expect(sql(`SELECT count(*) FROM net.calls`)).toBe("0");
      expect(mailsFor("quiet@example.com").map((m) => m.status)).toEqual(["skipped", "skipped"]);
    });

    it("通知沒設定好(或 pg_net 壞掉)時,申請照樣寫得進去", () => {
      sql(`DELETE FROM public.app_config WHERE key = 'lead_hook_secret'`);
      expect(() => anonApply("noconfig@example.com")).not.toThrow();
      expect(mailsFor("noconfig@example.com")).toEqual([]);

      resetData();
      expect(() =>
        sql(`SET test.net_fail = 'on'; SET ROLE anon;
             INSERT INTO public.supplier_applications (company_name, contact_email) VALUES ('x', 'netdown@example.com');`),
      ).not.toThrow();
      expect(sql(`SELECT count(*) FROM public.supplier_applications WHERE contact_email = 'netdown@example.com'`)).toBe("1");
      // 寄信的排隊紀錄跟著 rollback,不會留下永遠 queued 的假紀錄
      expect(mailsFor("netdown@example.com")).toEqual([]);
    });

    it("管理員手動補一筆非 pending 的資料不寄信", () => {
      sql(`INSERT INTO public.supplier_applications (company_name, contact_email, status) VALUES ('補登', 'manual@example.com', 'approved')`);
      expect(mailsFor("manual@example.com")).toEqual([]);
      expect(sql(`SELECT count(*) FROM net.calls`)).toBe("0");
    });
  });

  describe("匿名送件的限制", () => {
    it.each([
      ["status", "status='approved'"],
      ["admin_notes", "admin_notes='自己寫的備註'"],
      ["applicant_message", "applicant_message='x'"],
      ["reviewed_at", "reviewed_at=now()"],
    ])("不能自己帶 %s", (_col, extra) => {
      expect(() => anonApply("sneaky@example.com", extra)).toThrow(/row-level security/);
    });

    it("email 格式不對、欄位過長都擋下", () => {
      expect(() => anonApply("not-an-email")).toThrow(/row-level security/);
      expect(() => anonApply("long@example.com", `description=repeat('x', 5001)`)).toThrow(/row-level security/);
      expect(() => anonApply("ok@example.com", `description=repeat('x', 5000)`)).not.toThrow();
    });

    // 20260928180100:`文字<信箱>` 這類寫法會被當成不同 email 繞過頻率限制,或被寄信服務當成「顯示名稱 + 地址」
    it.each([
      "a<victim@gmail.com>",
      "中獎請加LINE<victim@gmail.com>",
      "x@gmail.com.",
      "x@gmail.com。",
      "x@localhost",
      "x@-bad.com",
      "x@example.c",
      '"quoted"@example.com',
    ])("不是一般 email 的寫法一律擋下:%s", (bad) => {
      expect(() => anonApply(bad)).toThrow(/row-level security/);
    });

    it.each([
      "first.last+tag@sub.example.com.tw",
      "A_B-c%d@Example.CO",
      "ifoodmaptw+apply-test@gmail.com",
      "o'brien@example.com",
      "user@example.xn--kpry57d",
    ])(
      "一般 email 照收:%s",
      (ok) => {
        expect(() => anonApply(ok)).not.toThrow();
      },
    );

    it("匿名讀不到、寫不進寄信紀錄,也不能呼叫帳號查詢函式", () => {
      expect(() => sql(`SET ROLE anon; SELECT count(*) FROM public.supplier_application_mails`)).toThrow(/permission denied/);
      expect(() =>
        sql(`SET ROLE anon; INSERT INTO public.supplier_application_mails (kind, status) VALUES ('rejection', 'queued')`),
      ).toThrow(/permission denied/);
      expect(() => sql(`SET ROLE authenticated; SELECT * FROM public.supplier_approval_account('a@b.c')`)).toThrow(
        /permission denied/,
      );
      expect(() => sql(`SET ROLE service_role; SELECT * FROM public.supplier_approval_account('a@b.c')`)).not.toThrow();
    });
  });

  describe("同一筆申請、同一種信只寄一次", () => {
    it("第二筆退件信紀錄會撞唯一索引", () => {
      anonApply("reject@example.com");
      const id = sql(`SELECT id FROM public.supplier_applications WHERE contact_email = 'reject@example.com'`);
      sql(`INSERT INTO public.supplier_application_mails (application_id, kind, status) VALUES ('${id}', 'rejection', 'sending')`);
      expect(() =>
        sql(`INSERT INTO public.supplier_application_mails (application_id, kind, status) VALUES ('${id}', 'rejection', 'sending')`),
      ).toThrow(/supplier_application_mails_once_per_kind/);
    });
  });

  describe("supplier_approval_account()", () => {
    it("找得到既有帳號(不分大小寫),並帶出已綁定的供應商", () => {
      sql(`INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000a', 'owner@shop.tw'),
                                                 ('00000000-0000-0000-0000-00000000000b', 'linked@shop.tw');
           INSERT INTO public.suppliers (id, name) VALUES ('00000000-0000-0000-0000-0000000000f1', '已存在的供應商');
           INSERT INTO public.supplier_accounts (user_id, supplier_id)
             VALUES ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1');`);
      expect(sql(`SELECT user_id || '|' || coalesce(linked_supplier_id::text, '') FROM public.supplier_approval_account(' Owner@Shop.TW ')`)).toBe(
        "00000000-0000-0000-0000-00000000000a|",
      );
      expect(sql(`SELECT linked_supplier_id FROM public.supplier_approval_account('linked@shop.tw')`)).toBe(
        "00000000-0000-0000-0000-0000000000f1",
      );
      expect(sql(`SELECT count(*) FROM public.supplier_approval_account('nobody@shop.tw')`)).toBe("0");
    });
  });

  describe("rollback(supabase/rollbacks/20260928180200 → 180100 → 180000 的 .down.sql)", () => {
    it("還原成套用前的樣子,而且之後可以再套一次 migration", () => {
      // 先退 180200:回到 180100 的嚴格版(不收撇號)
      sql(ROLLBACK_RARE_FORMS);
      expect(() => anonApply("o'brien@example.com")).toThrow(/row-level security/);
      expect(sql(`SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928180200'`)).toBe("0");
      sql(`DELETE FROM public.supplier_applications`);
      // 再退 180100:email 檢查回到寬鬆版,ledger 少一筆
      sql(ROLLBACK_STRICT_EMAIL);
      expect(sql(`SELECT with_check LIKE '%[:space:]%' FROM pg_policies WHERE policyname = 'anon submit application'`)).toBe("t");
      expect(sql(`SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928180100'`)).toBe("0");
      sql(ROLLBACK);
      const state = sqlJson<Record<string, unknown>>(`
        SELECT json_build_object(
          'mail_table', to_regclass('public.supplier_application_mails') IS NOT NULL,
          'column', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_applications' AND column_name = 'applicant_message'),
          'index', to_regclass('public.supplier_applications_one_pending_per_email') IS NOT NULL,
          'trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_supplier_application_queue_mails'),
          'fn', to_regprocedure('public.supplier_approval_account(text)') IS NOT NULL,
          'policy_check', (SELECT with_check FROM pg_policies WHERE policyname = 'anon submit application'),
          'ledger', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928180000'))`);
      expect(state).toEqual({ mail_table: false, column: false, index: false, trigger: false, fn: false, policy_check: "true", ledger: 0 });
      // 還原後匿名又可以亂塞(這正是 migration 要擋的),也不會寄任何信
      expect(() => anonApply("after-rollback@example.com", "status='approved'")).not.toThrow();
      expect(sql(`SELECT count(*) FROM net.calls`)).toBe("0");

      sql(`DELETE FROM public.supplier_applications`);
      sql(MIGRATION);
      sql(MIGRATION_STRICT_EMAIL);
      sql(MIGRATION_RARE_FORMS);
      sql(`INSERT INTO supabase_migrations.schema_migrations VALUES
             ('20260928180000', 'supplier_application_mail'), ('20260928180100', 'supplier_application_strict_email'),
             ('20260928180200', 'supplier_application_email_rare_forms')`);
      anonApply("reapplied@example.com");
      expect(mailsFor("reapplied@example.com").map((m) => m.status)).toEqual(["queued", "queued"]);
      expect(() => anonApply("a<victim@gmail.com>")).toThrow(/row-level security/);
    });
  });
});
