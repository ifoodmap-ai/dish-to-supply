// 測試用的記憶體假 Supabase(只給 vitest 用,Edge Function 不會 import 這支)。
//
// 只實作 Edge Function 用得到的那一小段 supabase-js:
//   from(table).select / insert / update / delete / eq / neq / maybeSingle / single
//   rpc(fn, args)
//   auth.getUser / auth.admin.createUser / inviteUserByEmail / updateUserById / deleteUser
// 唯一索引(23505)、外鍵 cascade、指定某個操作失敗都可以設定,用來測每一條錯誤分支。
import { vi } from "vitest";
import type { Db, DbError, DbQuery, DbResult } from "../functions/_shared/db.ts";

export type Row = Record<string, unknown>;
type Filter = ["eq" | "neq", string, unknown];

export interface FakeDbOptions {
  tables?: Record<string, Row[]>;
  /** 表 → 哪幾組欄位必須唯一(null 不算衝突,跟 Postgres 一樣) */
  unique?: Record<string, string[][]>;
  /** 刪除 parent 時連帶刪除的 child:{ suppliers: [["supplier_accounts", "supplier_id"]] } */
  cascade?: Record<string, [string, string][]>;
  /** 回傳 error 就讓該次操作失敗 */
  fail?: (table: string, op: string, payload: unknown, filters: Filter[]) => DbError | undefined;
  rpc?: Record<string, (args: Record<string, unknown>) => DbResult>;
}

export interface FakeCall {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Filter[];
}

let seq = 0;
const fakeUuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

const matches = (row: Row, filters: Filter[]) =>
  filters.every(([op, col, val]) => (op === "eq" ? row[col] === val : row[col] !== val));

export class FakeDb implements Db {
  tables: Record<string, Row[]>;
  calls: FakeCall[] = [];
  rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  private nextId: Record<string, number> = {};

  constructor(private opts: FakeDbOptions = {}) {
    this.tables = Object.fromEntries(Object.entries(opts.tables ?? {}).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  }

  rows(table: string) {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  from(table: string): DbQuery {
    return new FakeQuery(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>): PromiseLike<DbResult> {
    this.rpcCalls.push({ fn, args });
    const impl = this.opts.rpc?.[fn];
    if (!impl) return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    return Promise.resolve(impl(args));
  }

  /** 給 FakeQuery 用 */
  run(q: FakeQuery): DbResult {
    const call: FakeCall = { table: q.table, op: q.op, payload: q.payload, filters: [...q.filters] };
    this.calls.push(call);
    const injected = this.opts.fail?.(q.table, q.op, q.payload, q.filters);
    if (injected) return { data: null, error: injected };

    const rows = this.rows(q.table);
    if (q.op === "select") {
      return { data: rows.filter((r) => matches(r, q.filters)).map((r) => ({ ...r })), error: null };
    }
    if (q.op === "insert") {
      const row: Row = { ...(q.payload as Row) };
      if (row.id === undefined) {
        if (q.table === "supplier_application_mails") {
          this.nextId[q.table] = (this.nextId[q.table] ?? 0) + 1;
          row.id = this.nextId[q.table];
        } else {
          row.id = fakeUuid();
        }
      }
      for (const cols of this.opts.unique?.[q.table] ?? []) {
        const clash = rows.some((r) => cols.every((c) => row[c] !== null && row[c] !== undefined && r[c] === row[c]));
        if (clash) {
          return {
            data: null,
            error: { code: "23505", message: `duplicate key value violates unique constraint (${cols.join(", ")})` },
          };
        }
      }
      rows.push(row);
      return { data: [{ ...row }], error: null };
    }
    if (q.op === "update") {
      const hit = rows.filter((r) => matches(r, q.filters));
      hit.forEach((r) => Object.assign(r, q.payload as Row));
      return { data: hit.map((r) => ({ ...r })), error: null };
    }
    // delete
    const keep = rows.filter((r) => !matches(r, q.filters));
    const removed = rows.filter((r) => matches(r, q.filters));
    this.tables[q.table] = keep;
    for (const [child, fk] of this.opts.cascade?.[q.table] ?? []) {
      const ids = new Set(removed.map((r) => r.id));
      this.tables[child] = this.rows(child).filter((r) => !ids.has(r[fk]));
    }
    return { data: removed.map((r) => ({ ...r })), error: null };
  }
}

class FakeQuery implements DbQuery {
  op: FakeCall["op"] = "select";
  payload: unknown;
  filters: Filter[] = [];

  constructor(
    private db: FakeDb,
    readonly table: string,
  ) {}

  select() {
    return this;
  }
  insert(values: Record<string, unknown>) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push(["eq", column, value]);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push(["neq", column, value]);
    return this;
  }
  maybeSingle(): PromiseLike<DbResult> {
    const r = this.db.run(this);
    if (r.error) return Promise.resolve(r);
    const list = r.data as Row[];
    if (list.length > 1) return Promise.resolve({ data: null, error: { code: "PGRST116", message: "multiple rows" } });
    return Promise.resolve({ data: list[0] ?? null, error: null });
  }
  single(): PromiseLike<DbResult> {
    const r = this.db.run(this);
    if (r.error) return Promise.resolve(r);
    const list = r.data as Row[];
    if (list.length !== 1) return Promise.resolve({ data: null, error: { code: "PGRST116", message: `${list.length} rows` } });
    return Promise.resolve({ data: list[0], error: null });
  }
  then<A = DbResult, B = never>(
    onfulfilled?: ((value: DbResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.db.run(this)).then(onfulfilled, onrejected);
  }
}

// ---------------------------------------------------------------------
// auth(GoTrue admin)的替身
// ---------------------------------------------------------------------

export interface FakeUser {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
}

type AuthError = { message: string; code?: string; status?: number } | null;
type UserResult = { data: { user: FakeUser | null }; error: AuthError };

export const createFakeAuth = (db: FakeDb, opts: { users?: FakeUser[]; tokens?: Record<string, string> } = {}) => {
  const users: FakeUser[] = (opts.users ?? []).map((u) => ({ ...u, app_metadata: { ...u.app_metadata } }));
  const tokens = { ...(opts.tokens ?? {}) };
  const result = (user: FakeUser | null, error: AuthError = null): UserResult => ({ data: { user }, error });

  const auth = {
    users,
    getUser: vi.fn(async (jwt: string) => {
      const u = users.find((x) => x.id === tokens[jwt]);
      return u ? result(u) : result(null, { message: "invalid JWT", status: 401 });
    }),
    admin: {
      createUser: vi.fn(
        async (attrs: { email: string; email_confirm?: boolean; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) => {
          if (users.some((u) => u.email === attrs.email.toLowerCase())) {
            return result(null, { message: "A user with this email address has already been registered", code: "email_exists", status: 422 });
          }
          const u: FakeUser = {
            id: fakeUuid(),
            email: attrs.email.toLowerCase(),
            app_metadata: { ...(attrs.app_metadata ?? {}) },
            user_metadata: attrs.user_metadata,
            email_confirmed_at: attrs.email_confirm ? new Date().toISOString() : null,
          };
          users.push(u);
          return result(u);
        },
      ),
      inviteUserByEmail: vi.fn(async (email: string, _opts: { redirectTo: string; data?: Record<string, unknown> }) => {
        const u = users.find((x) => x.email === email.toLowerCase()) ?? null;
        return result(u);
      }),
      updateUserById: vi.fn(async (id: string, attrs: Record<string, unknown>) => {
        const u = users.find((x) => x.id === id) ?? null;
        if (u && attrs.app_metadata) u.app_metadata = { ...u.app_metadata, ...(attrs.app_metadata as Record<string, unknown>) };
        return result(u);
      }),
      deleteUser: vi.fn(async (id: string) => {
        const i = users.findIndex((x) => x.id === id);
        if (i >= 0) users.splice(i, 1);
        db.tables.supplier_accounts = db.rows("supplier_accounts").filter((r) => r.user_id !== id);
        return { data: null, error: null as AuthError };
      }),
    },
  };
  return auth;
};
