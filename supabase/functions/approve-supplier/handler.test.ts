import { describe, expect, it, vi } from "vitest";
import { createFakeAuth, FakeDb, type FakeDbOptions, type FakeUser, type Row } from "../../tests/fake-supabase.ts";
import type { MailConfig, SendMail } from "../_shared/supplier-mail.ts";
import { type AdminClient, createApproveHandler } from "./handler.ts";

const APP_ID = "7d1e0c52-1111-4a2b-8c3d-000000000001";
const ADMIN_ID = "a0000000-0000-4000-8000-00000000ad01";

const CONFIG: MailConfig = {
  resendKey: "re_test",
  applicantFrom: "iFoodmap 食材地圖 <noreply@gathertaiwan.com>",
  ownerFrom: "iFoodmap 表單通知 <noreply@gathertaiwan.com>",
  ownerTo: ["ifoodmaptw@gmail.com"],
  replyTo: "ifoodmaptw@gmail.com",
  siteUrl: "https://dish-to-supply.vercel.app",
  adminSiteUrl: "https://ifoodmap-admin.vercel.app",
};

const baseApplication = (over: Row = {}): Row => ({
  id: APP_ID,
  company_name: "鮮采農產",
  contact_name: "王小明",
  contact_email: "Supplier@Example.com",
  contact_phone: "02-1234-5678",
  contact_line: null,
  categories: "蔬菜",
  service_areas: "台北、新北",
  description: "產地直送",
  status: "pending",
  admin_notes: null,
  applicant_message: null,
  created_at: "2026-09-28T09:00:00.000Z",
  ...over,
});

interface SetupOptions {
  application?: Row;
  users?: FakeUser[];
  /** supplier_approval_account() 的回傳(預設依 users 與 supplier_accounts 查) */
  lookup?: (email: string) => { user_id: string; linked_supplier_id: string | null } | null;
  fail?: FakeDbOptions["fail"];
  mailRows?: Row[];
  supplierAccounts?: Row[];
  sendImpl?: SendMail;
}

const setup = (opts: SetupOptions = {}) => {
  const db = new FakeDb({
    tables: {
      supplier_applications: [opts.application ?? baseApplication()],
      suppliers: [],
      supplier_accounts: opts.supplierAccounts ?? [],
      supplier_application_mails: opts.mailRows ?? [],
    },
    unique: {
      supplier_accounts: [["user_id"]],
      supplier_application_mails: [["application_id", "kind"]],
    },
    cascade: { suppliers: [["supplier_accounts", "supplier_id"]] },
    fail: opts.fail,
    rpc: {
      supplier_approval_account: (args) => {
        const email = String(args.p_email);
        if (opts.lookup) {
          const r = opts.lookup(email);
          return { data: r ? [r] : [], error: null };
        }
        const u = auth.users.find((x) => x.email === email.trim().toLowerCase());
        if (!u) return { data: [], error: null };
        const link = db.rows("supplier_accounts").find((r) => r.user_id === u.id);
        return { data: [{ user_id: u.id, linked_supplier_id: (link?.supplier_id as string) ?? null }], error: null };
      },
    },
  });
  const auth = createFakeAuth(db, {
    users: [{ id: ADMIN_ID, email: "boss@example.com", app_metadata: { role: "admin" } }, ...(opts.users ?? [])],
    tokens: { "admin-jwt": ADMIN_ID, "supplier-jwt": "u-supplier" },
  });
  let n = 0;
  const send = vi.fn(
    opts.sendImpl ??
      (async () => {
        n += 1;
        return { ok: true, id: `re_${n}`, error: null };
      }),
  );
  const admin = Object.assign(db, { auth }) as unknown as AdminClient;
  const handler = createApproveHandler({ admin, send, config: CONFIG, genPassword: () => "TempPass-123" });
  const call = async (body: unknown, token: string | null = "admin-jwt") => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await handler(new Request("https://fn.test/approve-supplier", { method: "POST", headers, body: JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> & { data?: Record<string, unknown> } };
  };
  return { db, auth, send, call };
};

const application = (db: FakeDb) => db.rows("supplier_applications")[0];

describe("approve-supplier:權限與輸入", () => {
  it("沒帶 token → 401;token 無效 → 401;不是管理員 → 403,而且什麼都沒改", async () => {
    const { db, call } = setup({ users: [{ id: "u-supplier", email: "s@example.com", app_metadata: { role: "supplier" } }] });
    expect((await call({ application_id: APP_ID }, null)).status).toBe(401);
    expect((await call({ application_id: APP_ID }, "bogus")).status).toBe(401);
    const res = await call({ application_id: APP_ID }, "supplier-jwt");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(db.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("application_id 不是 UUID → 400;action 不認得 → 400;找不到 → 404", async () => {
    const { call } = setup();
    expect((await call({ application_id: "x" })).status).toBe(400);
    expect((await call({ application_id: APP_ID, action: "delete" })).status).toBe(400);
    expect((await call({ application_id: "7d1e0c52-1111-4a2b-8c3d-00000000ffff" })).status).toBe(404);
  });
});

describe("approve-supplier:核准(新帳號)", () => {
  it("建帳號(role=supplier、不寄信)→ 供應商 + 綁定 → 標記 approved → 寄邀請信到「設定密碼」頁", async () => {
    const { db, auth, send, call } = setup();
    const res = await call({ application_id: APP_ID });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      account: "new",
      invited: true,
      temp_password: null,
      login_email: "supplier@example.com",
      supplier_name: "鮮采農產",
    });
    expect(auth.admin.createUser).toHaveBeenCalledWith({
      email: "supplier@example.com",
      email_confirm: false,
      app_metadata: { role: "supplier" },
      user_metadata: { display_name: "王小明" },
    });
    expect(auth.admin.inviteUserByEmail).toHaveBeenCalledWith("supplier@example.com", {
      redirectTo: "https://dish-to-supply.vercel.app/reset-password?type=invite",
      data: { display_name: "王小明" },
    });
    // 新帳號走 Supabase Auth 的邀請信,不另外用 Resend 寄
    expect(send).not.toHaveBeenCalled();
    expect(auth.admin.updateUserById).not.toHaveBeenCalled();

    const newUser = auth.users.find((u) => u.email === "supplier@example.com")!;
    expect(db.rows("suppliers")).toHaveLength(1);
    expect(db.rows("suppliers")[0]).toMatchObject({ name: "鮮采農產", service_areas: ["台北", "新北"], is_active: true });
    expect(db.rows("supplier_accounts")).toEqual([
      expect.objectContaining({ user_id: newUser.id, supplier_id: db.rows("suppliers")[0].id, is_active: true }),
    ]);
    expect(application(db)).toMatchObject({ status: "approved" });
    expect(application(db).reviewed_at).toEqual(expect.any(String));
  });

  it("邀請信寄不出去 → 退回臨時密碼(畫面顯示一次),申請照樣是 approved", async () => {
    const { auth, call, db } = setup();
    auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: { user: null }, error: { message: "Error sending invite email", status: 500 } });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ account: "new", invited: false, temp_password: "TempPass-123", mail_error: "Error sending invite email" });
    const newUser = auth.users.find((u) => u.email === "supplier@example.com")!;
    expect(auth.admin.updateUserById).toHaveBeenCalledWith(newUser.id, { password: "TempPass-123", email_confirm: true });
    expect(application(db).status).toBe("approved");
  });
});

describe("approve-supplier:核准(email 原本就有帳號)", () => {
  const existingAdmin: FakeUser = { id: "e0000000-0000-4000-8000-0000000000e1", email: "supplier@example.com", app_metadata: { role: "admin", provider: "email" } };

  it("不改既有帳號的 role(平台管理員不會被降級),照樣建供應商 + 綁定,改寄「用原本的帳號登入」", async () => {
    const { db, auth, send, call } = setup({ users: [existingAdmin] });
    const res = await call({ application_id: APP_ID });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ account: "existing", invited: false, temp_password: null, notified: true, mail_error: null });

    // 既有帳號完全不碰
    expect(auth.admin.createUser).not.toHaveBeenCalled();
    expect(auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(auth.users.find((u) => u.id === existingAdmin.id)!.app_metadata).toEqual({ role: "admin", provider: "email" });

    expect(db.rows("supplier_accounts")).toEqual([
      expect.objectContaining({ user_id: existingAdmin.id, supplier_id: db.rows("suppliers")[0].id }),
    ]);
    expect(application(db).status).toBe("approved");

    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg).toMatchObject({ to: ["supplier@example.com"], from: CONFIG.applicantFrom, subject: "你的 iFoodmap 供應商申請已通過" });
    expect(msg.text).toContain("原本的帳號登入");
    expect(db.rows("supplier_application_mails")).toEqual([
      expect.objectContaining({ application_id: APP_ID, kind: "approved_existing_account", status: "sent", resend_id: "re_1" }),
    ]);
  });

  it("通知信寄失敗:仍是核准成功,回傳寄信錯誤讓管理員知道(不是「邀請信失敗」)", async () => {
    const { call } = setup({
      users: [existingAdmin],
      sendImpl: async () => ({ ok: false, id: null, error: "Resend 500: boom" }),
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ account: "existing", notified: false, mail_error: "Resend 500: boom", temp_password: null });
  });

  it("查的當下沒有帳號、建立時才撞到 email 已存在(併發)→ 一樣走既有帳號,不改 role", async () => {
    let calls = 0;
    const { auth, call, db } = setup({
      users: [existingAdmin],
      lookup: () => {
        calls += 1;
        return calls === 1 ? null : { user_id: existingAdmin.id, linked_supplier_id: null };
      },
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ account: "existing" });
    expect(auth.admin.createUser).toHaveBeenCalledTimes(1);
    expect(auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(auth.users.find((u) => u.id === existingAdmin.id)!.app_metadata.role).toBe("admin");
    expect(db.rows("supplier_accounts")[0].user_id).toBe(existingAdmin.id);
  });

  it("帳號已綁定別家供應商 → 409,什麼都不建、不寄", async () => {
    const { db, send, call } = setup({
      users: [existingAdmin],
      supplierAccounts: [{ id: "sa-1", user_id: existingAdmin.id, supplier_id: "other-supplier" }],
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACCOUNT_ALREADY_LINKED");
    expect(db.rows("suppliers")).toEqual([]);
    expect(application(db).status).toBe("pending");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("approve-supplier:核准的錯誤處理與 rollback", () => {
  it("標記 approved 失敗 → 500,刪掉剛建的供應商與帳號,不寄任何信", async () => {
    const { db, auth, send, call } = setup({
      fail: (table, op) => (table === "supplier_applications" && op === "update" ? { message: "db down" } : undefined),
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("MARK_APPROVED_FAILED");
    expect(db.rows("suppliers")).toEqual([]);
    expect(db.rows("supplier_accounts")).toEqual([]);
    expect(auth.users.some((u) => u.email === "supplier@example.com")).toBe(false);
    expect(auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(application(db).status).toBe("pending");
  });

  it("標記時發現已被別人核准(更新 0 筆)→ 409 並 rollback", async () => {
    const { db, auth, call } = setup({
      fail: (table, op, _payload, filters) => {
        if (table === "supplier_applications" && op === "update") {
          // 模擬另一位管理員剛好先核准:這次的條件式更新一筆都沒中
          db.rows("supplier_applications")[0].status = "approved";
          void filters;
        }
        return undefined;
      },
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_PENDING");
    expect(String(res.body.message)).toContain("已復原這次建立的資料");
    expect(db.rows("suppliers")).toEqual([]);
    expect(auth.users.some((u) => u.email === "supplier@example.com")).toBe(false);
    expect(auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("另一位管理員剛好先退件(退件信已寄)→ 這邊的核准不會蓋過去,也不寄邀請信", async () => {
    const { db, auth, send, call } = setup({
      fail: (table, op) => {
        if (table === "supplier_applications" && op === "update") db.rows("supplier_applications")[0].status = "rejected";
        return undefined;
      },
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_PENDING");
    expect(application(db).status).toBe("rejected");
    expect(db.rows("suppliers")).toEqual([]);
    expect(auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("復原本身也失敗時,據實告訴管理員還留著什麼(不能說已復原)", async () => {
    const { db, call } = setup({
      fail: (table, op) => {
        if (table === "supplier_applications" && op === "update") return { message: "db timeout" };
        if (table === "suppliers" && op === "delete") return { message: "db timeout" };
        return undefined;
      },
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("MARK_APPROVED_FAILED");
    const msg = String(res.body.message);
    expect(msg).toContain("自動復原沒有完成");
    expect(msg).toContain(String(db.rows("suppliers")[0].id));
    expect(msg).not.toContain("已復原這次建立的資料");
  });

  it("建供應商失敗 → 刪掉剛建的帳號;既有帳號的情況則完全不刪", async () => {
    const failSupplier: SetupOptions["fail"] = (table, op) => (table === "suppliers" && op === "insert" ? { message: "insert failed" } : undefined);
    const fresh = setup({ fail: failSupplier });
    expect((await fresh.call({ application_id: APP_ID })).status).toBe(500);
    expect(fresh.auth.users.some((u) => u.email === "supplier@example.com")).toBe(false);

    const existing = setup({ fail: failSupplier, users: [{ id: "e1", email: "supplier@example.com", app_metadata: {} }] });
    expect((await existing.call({ application_id: APP_ID })).status).toBe(500);
    expect(existing.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(existing.auth.users.some((u) => u.id === "e1")).toBe(true);
  });

  it("剛建的帳號被別的請求綁走(綁定撞 23505)→ 409,只收回供應商,不刪那個帳號", async () => {
    const { db, auth, call } = setup({
      fail: (table, op, payload) => {
        if (table === "supplier_accounts" && op === "insert") {
          // 模擬另一位管理員同時核准,先一步把這個新帳號綁到他建的供應商
          const userId = (payload as Row).user_id;
          db.rows("supplier_accounts").push({ id: "other-link", user_id: userId, supplier_id: "other-supplier" });
          return { code: "23505", message: "duplicate key value violates unique constraint" };
        }
        return undefined;
      },
    });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACCOUNT_ALREADY_LINKED");
    expect(db.rows("suppliers")).toEqual([]);
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(auth.users.some((u) => u.email === "supplier@example.com")).toBe(true);
    expect(db.rows("supplier_accounts")).toEqual([expect.objectContaining({ id: "other-link" })]);
    expect(application(db).status).toBe("pending");
  });

  it("已核准的申請不能再核准;已退件的也不能直接核准(申請者已經收到退件信)", async () => {
    const approved = setup({ application: baseApplication({ status: "approved" }) });
    const r1 = await approved.call({ application_id: APP_ID });
    expect(r1.status).toBe(409);
    expect(r1.body.code).toBe("ALREADY_APPROVED");
    expect(approved.auth.admin.createUser).not.toHaveBeenCalled();

    const rejected = setup({ application: baseApplication({ status: "rejected" }) });
    const r2 = await rejected.call({ application_id: APP_ID });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe("NOT_PENDING");
    expect(rejected.auth.admin.createUser).not.toHaveBeenCalled();
    expect(rejected.db.rows("suppliers")).toEqual([]);
  });

  it("申請上的 Email 不是一般格式(例如 `文字<信箱>`)→ 不建帳號、不寄信", async () => {
    const { call, auth, send, db } = setup({ application: baseApplication({ contact_email: "中獎請加LINE<victim@gmail.com>" }) });
    const res = await call({ application_id: APP_ID });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_EMAIL");
    expect(auth.admin.createUser).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(db.rows("suppliers")).toEqual([]);
  });
});

describe("approve-supplier:退件", () => {
  it("只把「給申請者的說明」寄出去,內部備註(admin_notes)不會出現在信裡", async () => {
    const { db, send, call } = setup({ application: baseApplication({ admin_notes: "舊的內部備註:電話打不通" }) });
    const res = await call({
      application_id: APP_ID,
      action: "reject",
      admin_notes: "內部:這家上次欠款三個月",
      applicant_message: "目前服務區域尚未開放,歡迎明年再申請。",
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "rejected", notified: true, resend_id: "re_1", mail_error: null });
    expect(application(db)).toMatchObject({
      status: "rejected",
      admin_notes: "內部:這家上次欠款三個月",
      applicant_message: "目前服務區域尚未開放,歡迎明年再申請。",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toEqual(["Supplier@Example.com"]);
    expect(msg.subject).toBe("關於你的 iFoodmap 供應商入駐申請");
    expect(msg.text).toContain("目前服務區域尚未開放,歡迎明年再申請。");
    for (const secret of ["欠款", "內部", "電話打不通"]) {
      expect(msg.html).not.toContain(secret);
      expect(msg.text).not.toContain(secret);
    }
    const row = db.rows("supplier_application_mails")[0];
    expect(row).toMatchObject({ kind: "rejection", status: "sent", resend_id: "re_1" });
    expect(String(row.body_text)).not.toContain("欠款");
  });

  it("不填說明也可以退件,信裡就沒有說明區塊", async () => {
    const { send, call } = setup();
    const res = await call({ application_id: APP_ID, action: "reject", admin_notes: "重複申請" });
    expect(res.status).toBe(200);
    expect(send.mock.calls[0][0].text).not.toContain("審核說明");
    expect(send.mock.calls[0][0].text).not.toContain("重複申請");
  });

  it("同一筆申請不能重複寄退件信:第二次退件 → 409,只寄過一封", async () => {
    const { send, call } = setup();
    expect((await call({ application_id: APP_ID, action: "reject", applicant_message: "a" })).status).toBe(200);
    const again = await call({ application_id: APP_ID, action: "reject", applicant_message: "b" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("NOT_PENDING");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("寄信紀錄已經有一筆(例如前一次請求寄到一半)→ 不再寄第二封", async () => {
    const { send, call, db } = setup({ mailRows: [{ id: 99, application_id: APP_ID, kind: "rejection", status: "sent" }] });
    const res = await call({ application_id: APP_ID, action: "reject", applicant_message: "x" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "rejected", notified: false });
    expect(String(res.body.data?.mail_error)).toContain("已經寄過");
    expect(send).not.toHaveBeenCalled();
    expect(db.rows("supplier_application_mails")).toHaveLength(1);
  });

  it("已核准的申請不能退件;說明太長 → 400 且不改狀態", async () => {
    const approved = setup({ application: baseApplication({ status: "approved" }) });
    expect((await approved.call({ application_id: APP_ID, action: "reject" })).status).toBe(409);
    expect(approved.send).not.toHaveBeenCalled();

    const tooLong = setup();
    const res = await tooLong.call({ application_id: APP_ID, action: "reject", applicant_message: "字".repeat(1001) });
    expect(res.status).toBe(400);
    expect(application(tooLong.db).status).toBe("pending");
  });

  it("Email 不是一般格式時照樣退件,但不寄信(也不記寄信紀錄)", async () => {
    const { call, send, db } = setup({ application: baseApplication({ contact_email: "x@gmail.com." }) });
    const res = await call({ application_id: APP_ID, action: "reject", applicant_message: "x" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "rejected", notified: false });
    expect(String(res.body.data?.mail_error)).toContain("Email 格式不正確");
    expect(send).not.toHaveBeenCalled();
    expect(db.rows("supplier_application_mails")).toEqual([]);
    expect(application(db).status).toBe("rejected");
  });

  it("退件信寄不出去:狀態仍是 rejected,回傳錯誤讓管理員知道", async () => {
    const { call, db } = setup({ sendImpl: async () => ({ ok: false, id: null, error: "Resend 422: invalid" }) });
    const res = await call({ application_id: APP_ID, action: "reject", applicant_message: "x" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "rejected", notified: false, mail_error: "Resend 422: invalid" });
    expect(db.rows("supplier_application_mails")[0]).toMatchObject({ status: "failed", error: "Resend 422: invalid" });
  });
});
