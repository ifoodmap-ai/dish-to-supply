// 管理員後台測試用的假 Supabase(只給 *.test.tsx 用,正式程式不會 import)。
//
// 記錄每一次 from(...) 查詢:表名、動作(select/insert/update/delete)、欄位、選項、篩選、寫入內容;
// 回應由測試用 respond() 決定。完全不打網路,所以管理員後台的測試不會碰到正式庫。
// 預設登入身分是管理員(app_metadata.role = 'admin'),AdminRoute 會放行。

export type FilterOp = 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'is' | 'not' | 'order' | 'limit';

export interface RecordedQuery {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  columns: string | null;
  options: Record<string, unknown> | null;
  payload: unknown;
  filters: Array<{ op: FilterOp; column: string; value: unknown }>;
  single: boolean;
}

export interface FakeResponse {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

/** 可以直接回結果,也可以回 Promise(測試要控制「什麼時候回來」時用) */
export type Responder = (
  query: RecordedQuery,
) => FakeResponse | undefined | Promise<FakeResponse | undefined>;

export interface FakeSession {
  user: { id: string; email: string; app_metadata: { role?: string } };
  access_token: string;
}

export const ADMIN_SESSION: FakeSession = {
  user: { id: 'admin-user-1', email: 'admin@example.test', app_metadata: { role: 'admin' } },
  access_token: 'fake-token',
};

/** 沒指定回應時:單筆查詢回 null,其他回空陣列、筆數 0 */
const defaultResponder: Responder = (q) => (q.single ? { data: null } : { data: [], count: 0 });

export const createFakeSupabase = () => {
  const queries: RecordedQuery[] = [];
  let responder: Responder = defaultResponder;
  let session: FakeSession | null = ADMIN_SESSION;

  const from = (table: string) => {
    const query: RecordedQuery = {
      table,
      action: 'select',
      columns: null,
      options: null,
      payload: null,
      filters: [],
      single: false,
    };
    queries.push(query);

    const addFilter = (op: FilterOp, column: string, value: unknown) => {
      query.filters.push({ op, column, value });
      return builder;
    };

    const builder = {
      select(columns?: string, options?: Record<string, unknown>) {
        query.columns = columns ?? '*';
        if (options) query.options = options;
        return builder;
      },
      insert(payload: unknown) {
        query.action = 'insert';
        query.payload = payload;
        return builder;
      },
      upsert(payload: unknown) {
        query.action = 'upsert';
        query.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        query.action = 'update';
        query.payload = payload;
        return builder;
      },
      delete() {
        query.action = 'delete';
        return builder;
      },
      eq: (column: string, value: unknown) => addFilter('eq', column, value),
      neq: (column: string, value: unknown) => addFilter('neq', column, value),
      in: (column: string, value: unknown) => addFilter('in', column, value),
      gte: (column: string, value: unknown) => addFilter('gte', column, value),
      lte: (column: string, value: unknown) => addFilter('lte', column, value),
      is: (column: string, value: unknown) => addFilter('is', column, value),
      not: (column: string, _op: string, value: unknown) => addFilter('not', column, value),
      order: (column: string, value?: unknown) => addFilter('order', column, value),
      limit: (value: number) => addFilter('limit', 'limit', value),
      single() {
        query.single = true;
        return builder;
      },
      maybeSingle() {
        query.single = true;
        return builder;
      },
      then<T1, T2 = never>(
        onFulfilled?: ((value: { data: unknown; error: FakeResponse['error']; count: number | null }) => T1) | null,
        onRejected?: ((reason: unknown) => T2) | null,
      ) {
        return Promise.resolve()
          .then(() => responder(query))
          .then((answer) => {
            const res = (answer ?? defaultResponder(query) ?? {}) as FakeResponse;
            return {
              data: res.data === undefined ? null : res.data,
              error: res.error ?? null,
              count: res.count === undefined ? null : res.count,
            };
          })
          .then(onFulfilled, onRejected);
      },
    };
    return builder;
  };

  const client = {
    from,
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      getUser: () => Promise.resolve({ data: { user: session?.user ?? null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  };

  return {
    client,
    queries,
    /** 設定接下來查詢的回應 */
    respond(fn: Responder) {
      responder = fn;
    },
    setSession(next: FakeSession | null) {
      session = next;
    },
    /** 所有寫入(insert/update/delete/upsert) */
    writes: () => queries.filter((q) => q.action !== 'select'),
    /** 某張表的所有查詢 */
    queriesOf: (table: string) => queries.filter((q) => q.table === table),
    reset() {
      queries.length = 0;
      responder = defaultResponder;
      session = ADMIN_SESSION;
    },
  };
};

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** 測試檔共用的一份(vi.mock 的 factory 與測試本體 import 到的是同一個) */
export const fakeSupabase = createFakeSupabase();
