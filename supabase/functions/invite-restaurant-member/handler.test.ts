// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createInviteHandler, type AdminClient, type QueryBuilder } from "./handler";

/* ------------------------------------------------------------------ */
/* 假的 admin client:記錄每個呼叫的順序與參數,不連任何伺服器             */
/* ------------------------------------------------------------------ */

type ApiError = { message?: string; code?: string; status?: number } | null;
type AuthUser = { id: string; invited_at?: string | null; email_confirmed_at?: string | null };

const OWNER = { id: "11111111-1111-4111-8111-111111111111" };
const REST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_A1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const BRANCH_A_OFF = "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0";
const BRANCH_B1 = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const NEW_USER = "99999999-9999-4999-8999-999999999999";
const EMAIL = "new.staff+1@example.com";

interface Config {
  tokenUser: AuthUser | null;
  ownerRows: { restaurant_id: string }[];
  restaurants: Record<string, { id: string; is_active: boolean }>;
  branches: { id: string; restaurant_id: string; is_active: boolean }[];
  claim: { data: unknown; error: ApiError };
  emailStatus: { user_id: string; status: string }[];
  usersById: Record<string, AuthUser>;
  createUser: { data: { user: AuthUser | null } | null; error: ApiError };
  insert: { data: unknown; error: ApiError };
  invite: { data: { user: AuthUser | null } | null; error: ApiError };
  deleteUser: ApiError[]; // 依序回傳;用完之後一律成功
}

const baseConfig = (): Config => ({
  tokenUser: OWNER,
  ownerRows: [{ restaurant_id: REST_A }],
  restaurants: {
    [REST_A]: { id: REST_A, is_active: true },
    [REST_B]: { id: REST_B, is_active: true },
  },
  branches: [
    { id: BRANCH_A1, restaurant_id: REST_A, is_active: true },
    { id: BRANCH_A_OFF, restaurant_id: REST_A, is_active: false },
    { id: BRANCH_B1, restaurant_id: REST_B, is_active: true },
  ],
  claim: { data: true, error: null },
  emailStatus: [],
  usersById: {},
  createUser: { data: { user: { id: NEW_USER } }, error: null },
  insert: {
    data: {
      id: "acc-new",
      user_id: NEW_USER,
      restaurant_id: REST_A,
      branch_id: BRANCH_A1,
      role: "purchaser",
      is_active: true,
      created_at: "2026-09-28T07:00:00Z",
    },
    error: null,
  },
  invite: { data: { user: { id: NEW_USER } }, error: null },
  deleteUser: [],
});

const makeFake = (cfg: Config) => {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string, ...args: unknown[]) => calls.push({ name, args });
  const deleteQueue = [...cfg.deleteUser];

  const resolveQuery = (table: string, op: string, filters: Record<string, unknown>, values: unknown, mode: string) => {
    record(`from:${table}:${op}:${mode}`, filters, values);
    if (table === "restaurant_accounts" && op === "select") return { data: cfg.ownerRows, error: null };
    if (table === "restaurants") return { data: cfg.restaurants[String(filters.id)] ?? null, error: null };
    if (table === "restaurant_branches") {
      const b = cfg.branches.find((x) => x.id === filters.id && x.restaurant_id === filters.restaurant_id);
      return { data: b ?? null, error: null };
    }
    if (table === "restaurant_accounts" && op === "insert") return cfg.insert;
    return { data: null, error: { message: `unexpected ${table}` } };
  };

  const from = (table: string): QueryBuilder => {
    const filters: Record<string, unknown> = {};
    let op = "select";
    let values: unknown;
    const q: QueryBuilder = {
      select: () => q,
      eq: (col, v) => {
        filters[col] = v;
        return q;
      },
      insert: (v) => {
        op = "insert";
        values = v;
        return q;
      },
      maybeSingle: () => Promise.resolve(resolveQuery(table, op, filters, values, "maybeSingle")),
      single: () => Promise.resolve(resolveQuery(table, op, filters, values, "single")),
      then: (onF, onR) => Promise.resolve(resolveQuery(table, op, filters, values, "many")).then(onF, onR),
    };
    return q;
  };

  const admin: AdminClient = {
    auth: {
      getUser: async (jwt) => {
        record("getUser", jwt);
        return cfg.tokenUser
          ? { data: { user: cfg.tokenUser }, error: null }
          : { data: { user: null }, error: { message: "invalid claim: missing sub claim", status: 403 } };
      },
      admin: {
        createUser: async (attrs) => {
          record("createUser", attrs);
          return cfg.createUser;
        },
        inviteUserByEmail: async (email, opts) => {
          record("inviteUserByEmail", email, opts);
          return cfg.invite;
        },
        getUserById: async (id) => {
          record("getUserById", id);
          return { data: { user: cfg.usersById[id] ?? null }, error: null };
        },
        deleteUser: async (id) => {
          record("deleteUser", id);
          return { error: deleteQueue.length ? deleteQueue.shift()! : null };
        },
      },
    },
    from,
    rpc: async (fn, args) => {
      record(`rpc:${fn}`, args);
      if (fn === "claim_restaurant_invite_slot") return cfg.claim;
      if (fn === "restaurant_invite_email_status") return { data: cfg.emailStatus, error: null };
      return { data: null, error: { message: "unknown rpc" } };
    },
  };
  return { admin, calls, names: () => calls.map((c) => c.name) };
};

const run = async (patch: Partial<Config> = {}, init: { method?: string; token?: string | null; body?: unknown } = {}) => {
  const cfg = { ...baseConfig(), ...patch };
  const fake = makeFake(cfg);
  const logs: string[] = [];
  const handler = createInviteHandler({
    admin: fake.admin,
    siteUrl: "https://site.example/",
    hourlyLimit: 7,
    log: (level, entry) => logs.push(`${level} ${JSON.stringify(entry)}`),
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = init.token === undefined ? "user-jwt" : init.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = init.method ?? "POST";
  const body =
    method === "POST"
      ? typeof init.body === "string"
        ? init.body
        : JSON.stringify(
            init.body ?? {
              email: `  ${EMAIL.toUpperCase()} `,
              name: " 陳新人 ",
              role: "purchaser",
              branch_id: BRANCH_A1,
              restaurant_id: REST_A,
            },
          )
      : undefined;
  const res = await handler(new Request("https://fn.example/invite-restaurant-member", { method, headers, body }));
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  // 🔴 任何情況下 log 都不能出現 email
  expect(logs.join("\n").toLowerCase()).not.toContain(EMAIL);
  return { res, json, fake, logs };
};

const NO_SIDE_EFFECTS = ["createUser", "inviteUserByEmail", "deleteUser", "from:restaurant_accounts:insert:single"];
const expectNoSideEffects = (names: string[]) => {
  for (const n of NO_SIDE_EFFECTS) expect(names).not.toContain(n);
};

/* ------------------------------------------------------------------ */

describe("invite-restaurant-member handler — HTTP 與身分", () => {
  it("OPTIONS 回 CORS", async () => {
    const { res } = await run({}, { method: "OPTIONS", token: null });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("GET → 405", async () => {
    const { res, fake } = await run({}, { method: "GET" });
    expect(res.status).toBe(405);
    expect(fake.names()).toEqual([]);
  });

  it("沒帶 token → 401,連 getUser 都不打", async () => {
    const { res, json, fake } = await run({}, { token: null });
    expect(res.status).toBe(401);
    expect(json?.code).toBe("UNAUTHENTICATED");
    expect(fake.names()).toEqual([]);
  });

  it("token 無效(例如 anon key)→ 401", async () => {
    const { res, fake } = await run({ tokenUser: null });
    expect(res.status).toBe(401);
    expectNoSideEffects(fake.names());
  });
});

describe("授權:只有啟用中的老闆", () => {
  it("不是任何店的老闆 → 403;權限查詢一定帶 user_id / role=owner / is_active=true", async () => {
    const { res, json, fake } = await run({ ownerRows: [] });
    expect(res.status).toBe(403);
    expect(json?.code).toBe("NOT_OWNER");
    const q = fake.calls.find((c) => c.name === "from:restaurant_accounts:select:many");
    expect(q?.args[0]).toEqual({ user_id: OWNER.id, role: "owner", is_active: true });
    expect(fake.names()).not.toContain("rpc:claim_restaurant_invite_slot");
    expectNoSideEffects(fake.names());
  });

  it.each([
    ["沒帶 restaurant_id", { email: EMAIL, name: "甲", role: "purchaser" }],
    ["body 亂填", { role: "admin" }],
    ["body 不是 JSON", "email=x"],
  ])("非老闆:%s 也是 403(授權在輸入驗證之前)", async (_label, body) => {
    const { res, json, fake } = await run({ ownerRows: [] }, { body });
    expect(res.status).toBe(403);
    expect(json?.code).toBe("NOT_OWNER");
    expectNoSideEffects(fake.names());
  });

  it("指定一家自己不是老闆的店 → 403(前端傳的 restaurant_id 不算數)", async () => {
    const { res, json, fake } = await run(
      {},
      { body: { email: EMAIL, name: "甲", role: "purchaser", branch_id: BRANCH_B1, restaurant_id: REST_B } },
    );
    expect(res.status).toBe(403);
    expect(json?.code).toBe("NOT_OWNER");
    expectNoSideEffects(fake.names());
  });

  it("是兩家店的老闆卻沒指定哪一家 → 400", async () => {
    const { res, json } = await run(
      { ownerRows: [{ restaurant_id: REST_A }, { restaurant_id: REST_B }] },
      { body: { email: EMAIL, name: "甲", role: "purchaser" } },
    );
    expect(res.status).toBe(400);
    expect(json?.code).toBe("RESTAURANT_REQUIRED");
  });

  it("只當一家店的老闆、沒帶 restaurant_id → 用那一家", async () => {
    const { res, fake } = await run({}, { body: { email: EMAIL, name: "甲", role: "manager" } });
    expect(res.status).toBe(200);
    const insert = fake.calls.find((c) => c.name === "from:restaurant_accounts:insert:single");
    expect(insert?.args[1]).toMatchObject({ restaurant_id: REST_A, role: "manager", branch_id: null });
  });

  it("餐廳已停用 → 403", async () => {
    const { res, json, fake } = await run({ restaurants: { [REST_A]: { id: REST_A, is_active: false } } });
    expect(res.status).toBe(403);
    expect(json?.code).toBe("RESTAURANT_INACTIVE");
    expectNoSideEffects(fake.names());
  });
});

describe("輸入驗證(伺服器端)", () => {
  it.each([
    [{ email: "", name: "甲", role: "purchaser" }, "EMAIL_REQUIRED"],
    [{ email: "nope", name: "甲", role: "purchaser" }, "EMAIL_INVALID"],
    [{ email: EMAIL, name: "", role: "purchaser" }, "NAME_REQUIRED"],
    [{ email: EMAIL, name: "甲", role: "admin" }, "ROLE_INVALID"],
    [{ email: EMAIL, name: "甲", role: "purchaser", branch_id: "x" }, "BRANCH_INVALID"],
  ])("%j → 400 %s", async (body, code) => {
    const { res, json, fake } = await run({}, { body });
    expect(res.status).toBe(400);
    expect(json?.code).toBe(code);
    expectNoSideEffects(fake.names());
  });

  it("body 不是 JSON → 400", async () => {
    const { res, json } = await run({}, { body: "email=x" });
    expect(res.status).toBe(400);
    expect(json?.code).toBe("INVALID_BODY");
  });

  it("別家店的分店 → 400 BRANCH_NOT_FOUND", async () => {
    const { res, json, fake } = await run(
      {},
      { body: { email: EMAIL, name: "甲", role: "purchaser", branch_id: BRANCH_B1, restaurant_id: REST_A } },
    );
    expect(res.status).toBe(400);
    expect(json?.code).toBe("BRANCH_NOT_FOUND");
    expectNoSideEffects(fake.names());
  });

  it("停用的分店 → 400 BRANCH_INACTIVE", async () => {
    const { res, json } = await run(
      {},
      { body: { email: EMAIL, name: "甲", role: "purchaser", branch_id: BRANCH_A_OFF, restaurant_id: REST_A } },
    );
    expect(res.status).toBe(400);
    expect(json?.code).toBe("BRANCH_INACTIVE");
  });
});

describe("頻率限制(原子化,在查 email 之前)", () => {
  it("名額用完 → 429,不查 email、不建帳號", async () => {
    const { res, json, fake } = await run({ claim: { data: false, error: null } });
    expect(res.status).toBe(429);
    expect(json?.code).toBe("RATE_LIMITED");
    expect(fake.names()).not.toContain("rpc:restaurant_invite_email_status");
    expectNoSideEffects(fake.names());
  });

  it("佔名額時帶這家店與設定的上限;而且排在查 email 之前(409 也會被計數)", async () => {
    const { fake } = await run({ emailStatus: [{ user_id: "u-x", status: "other_account" }] });
    const claim = fake.calls.find((c) => c.name === "rpc:claim_restaurant_invite_slot");
    expect(claim?.args[0]).toEqual({ p_restaurant: REST_A, p_limit: 7 });
    const names = fake.names();
    expect(names.indexOf("rpc:claim_restaurant_invite_slot")).toBeLessThan(
      names.indexOf("rpc:restaurant_invite_email_status"),
    );
  });
});

describe("既有帳號:一律 409,不綁、不改、不寄信", () => {
  it.each([
    [[{ user_id: "u-1", status: "member_active" }], { "u-1": { id: "u-1", invited_at: "t", email_confirmed_at: null } }, "INVITE_PENDING"],
    [[{ user_id: "u-1", status: "member_active" }], { "u-1": { id: "u-1", invited_at: "t", email_confirmed_at: "t2" } }, "ALREADY_MEMBER"],
    [[{ user_id: "u-1", status: "member_inactive" }], {}, "MEMBER_INACTIVE"],
    [[{ user_id: "u-1", status: "other_account" }], {}, "EMAIL_TAKEN"],
  ])("%j → 409 %s", async (emailStatus, usersById, code) => {
    const { res, json, fake } = await run({ emailStatus, usersById });
    expect(res.status).toBe(409);
    expect(json?.code).toBe(code);
    expect(json?.field).toBe("email");
    expectNoSideEffects(fake.names());
  });

  it("併發:查的時候還沒有、createUser 時已被別人建走 → 409,而且不刪任何帳號", async () => {
    const { res, json, fake } = await run({
      createUser: { data: { user: null }, error: { code: "email_exists", status: 422, message: "A user with this email address has already been registered" } },
    });
    expect(res.status).toBe(409);
    expect(json?.code).toBe("EMAIL_TAKEN");
    expect(fake.names()).not.toContain("deleteUser");
    expect(fake.names()).not.toContain("inviteUserByEmail");
  });
});

describe("失敗時不留孤兒帳號,也不會刪到別人的帳號", () => {
  it("createUser 其他錯誤 → 502,不刪任何東西", async () => {
    const { res, json, fake } = await run({ createUser: { data: null, error: { status: 500, code: "unexpected_failure" } } });
    expect(res.status).toBe(502);
    expect(json?.code).toBe("CREATE_FAILED");
    expect(fake.names()).not.toContain("deleteUser");
  });

  it("寫 restaurant_accounts 失敗 → 刪掉剛建的帳號、不寄信、回 500", async () => {
    const { res, json, fake } = await run({ insert: { data: null, error: { message: "duplicate key", code: "23505" } } });
    expect(res.status).toBe(500);
    expect(json?.code).toBe("LINK_FAILED");
    expect(fake.calls.filter((c) => c.name === "deleteUser").map((c) => c.args[0])).toEqual([NEW_USER]);
    expect(fake.names()).not.toContain("inviteUserByEmail");
  });

  it.each([
    [{ status: 500, code: "unexpected_failure" }, 502, "INVITE_FAILED"],
    [{ status: 429, code: "over_email_send_rate_limit" }, 429, "RATE_LIMITED"],
  ])("寄信失敗 %j → 刪掉剛建的帳號,回 %i", async (error, status, code) => {
    const { res, json, fake } = await run({ invite: { data: null, error } });
    expect(res.status).toBe(status);
    expect(json?.code).toBe(code);
    expect(fake.calls.filter((c) => c.name === "deleteUser").map((c) => c.args[0])).toEqual([NEW_USER]);
  });

  it("刪帳號失敗會重試一次;還是失敗就回 ROLLBACK_FAILED(不會說成功或叫人重試)", async () => {
    const { res, json, fake } = await run({
      insert: { data: null, error: { message: "boom" } },
      deleteUser: [{ status: 500, message: "db down" }, { status: 500, message: "db down" }],
    });
    expect(res.status).toBe(500);
    expect(json?.code).toBe("ROLLBACK_FAILED");
    expect(fake.calls.filter((c) => c.name === "deleteUser")).toHaveLength(2);
  });

  it("刪帳號第一次失敗、重試成功 → 回一般的 LINK_FAILED", async () => {
    const { res, json } = await run({
      insert: { data: null, error: { message: "boom" } },
      deleteUser: [{ status: 500, message: "flaky" }],
    });
    expect(res.status).toBe(500);
    expect(json?.code).toBe("LINK_FAILED");
  });
});

describe("成功路徑", () => {
  it("依序:驗身分 → 查權限 → 餐廳 → 分店 → 佔名額 → 查 email → 建帳號 → 綁餐廳 → 寄信", async () => {
    const { res, json, fake, logs } = await run();
    expect(res.status).toBe(200);
    expect(fake.names()).toEqual([
      "getUser",
      "from:restaurant_accounts:select:many",
      "from:restaurants:select:maybeSingle",
      "from:restaurant_branches:select:maybeSingle",
      "rpc:claim_restaurant_invite_slot",
      "rpc:restaurant_invite_email_status",
      "createUser",
      "from:restaurant_accounts:insert:single",
      "inviteUserByEmail",
    ]);

    const create = fake.calls.find((c) => c.name === "createUser")!.args[0];
    expect(create).toEqual({
      email: EMAIL,
      email_confirm: false,
      user_metadata: { display_name: "陳新人" },
      app_metadata: { role: "restaurant", invited_by: OWNER.id, invited_restaurant_id: REST_A },
    });
    const insert = fake.calls.find((c) => c.name === "from:restaurant_accounts:insert:single")!.args[1];
    expect(insert).toEqual({
      user_id: NEW_USER,
      restaurant_id: REST_A,
      branch_id: BRANCH_A1,
      role: "purchaser",
      is_active: true,
    });
    const [email, opts] = fake.calls.find((c) => c.name === "inviteUserByEmail")!.args;
    expect(email).toBe(EMAIL);
    expect(opts).toEqual({
      redirectTo: "https://site.example/reset-password?type=recovery",
      data: { display_name: "陳新人" },
    });

    expect(json).toEqual({
      data: {
        member: baseConfig().insert.data,
        email: EMAIL,
        display_name: "陳新人",
        invite_pending: true,
      },
    });
    expect(fake.names()).not.toContain("deleteUser");
    expect(logs.some((l) => l.includes("restaurant_member_invited") && l.includes(NEW_USER))).toBe(true);
  });

  it("GoTrue 錯誤訊息夾帶 email 時,log 也只記 status / code", async () => {
    const { logs } = await run({
      invite: { data: null, error: { status: 400, code: "email_address_invalid", message: `Email address "${EMAIL}" is invalid` } },
    });
    expect(logs.join("\n")).toContain("email_address_invalid");
    // run() 已經斷言 log 不含 email
  });
});
