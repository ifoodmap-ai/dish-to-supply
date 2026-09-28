import { describe, expect, it, vi } from "vitest";
import { FakeDb } from "../../tests/fake-supabase.ts";
import type { MailConfig, SendMail } from "../_shared/supplier-mail.ts";
import { NotFoundError, processSupplierApplication } from "./supplier-application.ts";

const APP_ID = "5f3c1f0e-8a4b-4c2d-9e1f-000000000001";

const CONFIG: MailConfig = {
  resendKey: "re_test",
  applicantFrom: "iFoodmap 食材地圖 <noreply@gathertaiwan.com>",
  ownerFrom: "iFoodmap 表單通知 <noreply@gathertaiwan.com>",
  ownerTo: ["ifoodmaptw@gmail.com"],
  replyTo: "ifoodmaptw@gmail.com",
  siteUrl: "https://dish-to-supply.vercel.app",
  adminSiteUrl: "https://ifoodmap-admin.vercel.app",
};

const application = {
  id: APP_ID,
  company_name: "鮮采農產",
  contact_name: "王小明",
  contact_email: "applicant@example.com",
  status: "pending",
  created_at: "2026-09-28T09:00:00.000Z",
};

const setup = (mails: { kind: string; status: string; skip_reason?: string | null }[], sendImpl?: SendMail) => {
  const db = new FakeDb({
    tables: {
      supplier_applications: [application],
      supplier_application_mails: mails.map((m, i) => ({ id: i + 1, application_id: APP_ID, skip_reason: null, ...m })),
    },
  });
  let n = 0;
  const send = vi.fn(
    sendImpl ??
      (async () => {
        n += 1;
        return { ok: true, id: `re_${n}`, error: null };
      }),
  );
  return { db, send, run: () => processSupplierApplication({ db, send, config: CONFIG }, APP_ID) };
};

const mailRow = (db: FakeDb, kind: string) => db.rows("supplier_application_mails").find((r) => r.kind === kind)!;

describe("notify-lead:供應商申請寄信", () => {
  it("兩封都排隊中:先寄申請者確認信,再寄業主通知,並記下 Resend id", async () => {
    const { db, send, run } = setup([
      { kind: "owner_notification", status: "queued" },
      { kind: "applicant_confirmation", status: "queued" },
    ]);
    const result = await run();

    expect(result.applicant).toEqual({ status: "sent", resend_id: "re_1" });
    expect(result.owner).toEqual({ status: "sent", resend_id: "re_2" });
    expect(send).toHaveBeenCalledTimes(2);

    const [toApplicant, toOwner] = send.mock.calls.map((c) => c[0]);
    expect(toApplicant).toMatchObject({
      from: CONFIG.applicantFrom,
      to: ["applicant@example.com"],
      replyTo: "ifoodmaptw@gmail.com",
      subject: "已收到你的 iFoodmap 供應商入駐申請",
    });
    expect(toOwner).toMatchObject({
      from: CONFIG.ownerFrom,
      to: ["ifoodmaptw@gmail.com"],
      replyTo: "applicant@example.com",
      subject: "【供應商申請】鮮采農產 — 王小明",
    });
    expect(toOwner.text).toContain("申請者確認信：已寄出");

    expect(mailRow(db, "applicant_confirmation")).toMatchObject({ status: "sent", resend_id: "re_1", error: null });
    expect(String(mailRow(db, "applicant_confirmation").body_text)).toContain("已收到你的供應商入駐申請");
    expect(mailRow(db, "owner_notification")).toMatchObject({ status: "sent", resend_id: "re_2", body_text: null });
  });

  it("確認信被頻率限制略過時不寄,業主通知寫明原因", async () => {
    const { send, run } = setup([
      { kind: "owner_notification", status: "queued" },
      { kind: "applicant_confirmation", status: "skipped", skip_reason: "email_24h" },
    ]);
    const result = await run();
    expect(result.applicant).toEqual({ status: "skipped", skip_reason: "email_24h" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual(["ifoodmaptw@gmail.com"]);
    expect(send.mock.calls[0][0].text).toContain("24 小時內已寄過");
  });

  it("全站上限略過也一樣不寄確認信", async () => {
    const { send, run } = setup([
      { kind: "owner_notification", status: "queued" },
      { kind: "applicant_confirmation", status: "skipped", skip_reason: "hourly_cap" },
    ]);
    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toContain("全站每小時確認信已達上限");
  });

  it("重播同一個請求不會重寄(只寄 queued,寄過的是 sent)", async () => {
    const { send, run } = setup([
      { kind: "owner_notification", status: "queued" },
      { kind: "applicant_confirmation", status: "queued" },
    ]);
    await run();
    const again = await run();
    expect(send).toHaveBeenCalledTimes(2);
    expect(again.applicant.status).toBe("not_queued");
    expect(again.owner.status).toBe("not_queued");
  });

  it("別的請求先搶走(已變成 sending)就不寄", async () => {
    const { send, run } = setup([
      { kind: "owner_notification", status: "sending" },
      { kind: "applicant_confirmation", status: "sending" },
    ]);
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  it("寄信失敗記成 failed,業主通知註明確認信寄送失敗", async () => {
    const { db, send, run } = setup(
      [
        { kind: "owner_notification", status: "queued" },
        { kind: "applicant_confirmation", status: "queued" },
      ],
      async (msg) =>
        msg.to[0] === "applicant@example.com"
          ? { ok: false, id: null, error: "Resend 422: invalid to" }
          : { ok: true, id: "re_owner", error: null },
    );
    const result = await run();
    expect(result.applicant).toEqual({ status: "failed", error: "Resend 422: invalid to" });
    expect(mailRow(db, "applicant_confirmation")).toMatchObject({ status: "failed", error: "Resend 422: invalid to" });
    expect(send.mock.calls[1][0].text).toContain("申請者確認信：寄送失敗");
  });

  it("兩個請求同時處理同一筆(pg_net 重送、手動重播)→ 每封信只寄一次", async () => {
    const { send, run } = setup([
      { kind: "owner_notification", status: "queued" },
      { kind: "applicant_confirmation", status: "queued" },
    ]);
    const [a, b] = await Promise.all([run(), run()]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((c) => c[0].to[0]).sort()).toEqual(["applicant@example.com", "ifoodmaptw@gmail.com"]);
    const statuses = [a.applicant.status, b.applicant.status].sort();
    expect(statuses).toEqual(["claimed_elsewhere", "sent"]);
  });

  it("收件地址不是一般 email(例如 `文字<信箱>`)→ 確認信標成 skipped(invalid_email)不寄,業主通知不設 reply_to", async () => {
    const db = new FakeDb({
      tables: {
        supplier_applications: [{ ...application, contact_email: "中獎請加LINE<victim@gmail.com>" }],
        supplier_application_mails: [
          { id: 1, application_id: APP_ID, kind: "owner_notification", status: "queued", skip_reason: null },
          { id: 2, application_id: APP_ID, kind: "applicant_confirmation", status: "queued", skip_reason: null },
        ],
      },
    });
    const send = vi.fn(async () => ({ ok: true, id: "re_owner", error: null }));
    const result = await processSupplierApplication({ db, send, config: CONFIG }, APP_ID);

    expect(result.applicant).toEqual({ status: "skipped", skip_reason: "invalid_email" });
    expect(mailRow(db, "applicant_confirmation")).toMatchObject({ status: "skipped", skip_reason: "invalid_email" });
    expect(send).toHaveBeenCalledTimes(1);
    const toOwner = send.mock.calls[0][0] as { to: string[]; replyTo: string | null; text: string };
    expect(toOwner.to).toEqual(["ifoodmaptw@gmail.com"]);
    expect(toOwner.replyTo).toBeNull();
    expect(toOwner.text).toContain("申請者確認信：未寄（Email 格式不正確）");
  });

  it("id 不合法或找不到申請 → NotFoundError(不寄任何信)", async () => {
    const { db, send } = setup([]);
    await expect(processSupplierApplication({ db, send, config: CONFIG }, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      processSupplierApplication({ db, send, config: CONFIG }, "5f3c1f0e-8a4b-4c2d-9e1f-00000000ffff"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(send).not.toHaveBeenCalled();
  });
});
