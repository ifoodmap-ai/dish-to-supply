// supabase-js 用得到的最小介面。
//
// Edge Function 的邏輯只依賴這個介面(真正的 SupabaseClient 在 index.ts 轉型後注入),
// vitest 用 supabase/tests/fake-supabase.ts 的記憶體假資料庫測每一條分支。
// data 一律是 unknown,呼叫端自己轉成需要的形狀。

export type DbError = { message: string; code?: string; details?: string | null } | null;
export type DbResult = { data: unknown; error: DbError };

export interface DbQuery extends PromiseLike<DbResult> {
  select(columns?: string): DbQuery;
  insert(values: Record<string, unknown>): DbQuery;
  update(values: Record<string, unknown>): DbQuery;
  delete(): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  neq(column: string, value: unknown): DbQuery;
  maybeSingle(): PromiseLike<DbResult>;
  single(): PromiseLike<DbResult>;
}

export interface Db {
  from(table: string): DbQuery;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<DbResult>;
}

export type LogFn = (level: "info" | "error", entry: Record<string, unknown>) => void;

export const defaultLog: LogFn = (level, entry) => {
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
};
