import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260727044345_enforce_tenant_scoped_transaction_reads.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

const policyFor = (name: string, table: string) => {
  const match = normalized.match(
    new RegExp(
      `create policy "${name}" on public\\.${table} [^;]+;`,
      "i",
    ),
  );
  expect(match, `missing ${name} on ${table}`).not.toBeNull();
  return match![0];
};

describe("tenant-scoped transaction RLS migration", () => {
  it.each([
    ["order_quotes", "view quotes"],
    ["order_payments", "view payments"],
    ["invoices", "view invoices"],
    ["notifications", "view notifications"],
  ])("removes the broad %s read policy", (table, oldPolicy) => {
    expect(normalized).toContain(
      `drop policy if exists "${oldPolicy}" on public.${table};`,
    );
  });

  it.each(["order_quotes", "order_payments", "invoices"])(
    "scopes %s reads to the order restaurant, order supplier, or admin",
    (table) => {
      const policy = policyFor(`transaction parties read ${table}`, table);

      expect(policy).toContain("for select to authenticated");
      expect(policy).toContain("public.is_admin()");
      expect(policy).toContain("public.supplier_orders");
      expect(policy).toContain(`o.id = ${table}.order_id`);
      expect(policy).toContain(
        "o.restaurant_id in (select public.current_restaurant_ids())",
      );
      expect(policy).toContain(
        "o.supplier_id in (select public.current_supplier_ids())",
      );
      expect(policy).not.toContain("using (true)");
    },
  );

  it("keeps free-text notifications admin-only without trusting recipient text", () => {
    expect(normalized).not.toMatch(
      /create policy [^;]+ on public\.notifications for select to (?:anon|public)/,
    );
    expect(normalized).not.toMatch(
      /on public\.notifications[^;]+using \([^;]*recipient/,
    );
    expect(normalized).toContain(
      'create policy "notifications admin read" on public.notifications for select to authenticated using (public.is_admin());',
    );
  });

  it("binds supplier quote writes to both the supplier account and its order", () => {
    expect(normalized).toContain(
      'drop policy if exists "supplier manage own quotes" on public.order_quotes;',
    );
    const policy = policyFor(
      "supplier manage own quotes",
      "order_quotes",
    );

    expect(policy).toContain("for all to authenticated");
    expect(policy).toContain("public.supplier_accounts");
    expect(policy).toContain("sa.user_id = (select auth.uid())");
    expect(policy).toContain("sa.is_active");
    expect(policy).toContain("public.supplier_orders");
    expect(policy).toContain("o.id = order_quotes.order_id");
    expect(policy).toContain("o.supplier_id = order_quotes.supplier_id");
    expect(policy).toContain("with check");
  });

  it("does not grant transaction reads to anon or PUBLIC", () => {
    expect(normalized).not.toMatch(
      /(?:grant select|for select)\s+(?:on [^;]+ )?to (?:anon|public)/,
    );
    for (const table of [
      "order_quotes",
      "order_payments",
      "invoices",
      "notifications",
    ]) {
      expect(normalized).toContain(
        `revoke all on table public.${table} from public, anon;`,
      );
    }
  });
});
