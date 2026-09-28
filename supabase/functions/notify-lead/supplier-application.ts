// notify-lead:新的供應商入駐申請 → 申請者確認信 + 業主通知。
//
// 要不要寄、寄哪幾封,已經在資料庫的 trigger 裡決定好了(頻率限制、防濫用,見
// migration 20260928180000_supplier_application_mail.sql):trigger 把要寄的信記成
// supplier_application_mails 的 queued 列,再用 pg_net 只帶申請 id 呼叫這支。
//
// 這裡只做一件事:把 queued 的信「搶」成 sending(搶到的才寄,重播、併發都不會重複寄),
// 寄完記下 Resend 的 id 或錯誤。不在這裡做任何頻率判斷 —— Edge Function 的「先數再寄」擋不住併發。
import type { Db, LogFn } from "../_shared/db.ts";
import {
  applicantConfirmationMail,
  type ApplicationRecord,
  type ConfirmationNote,
  isDeliverableEmail,
  type MailConfig,
  ownerNewApplicationMail,
  type SendMail,
} from "../_shared/supplier-mail.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPLICATION_COLUMNS =
  "id, company_name, contact_name, contact_email, contact_phone, contact_line, categories, service_areas, description, status, created_at";

export interface MailRow {
  id: number;
  kind: string;
  status: string;
  skip_reason: string | null;
}

export interface MailOutcome {
  status: "sent" | "failed" | "skipped" | "not_queued" | "claimed_elsewhere";
  resend_id?: string | null;
  error?: string | null;
  skip_reason?: string | null;
}

export interface SupplierApplicationResult {
  application_id: string;
  applicant: MailOutcome;
  owner: MailOutcome;
}

export interface SupplierApplicationDeps {
  db: Db;
  send: SendMail;
  config: MailConfig;
  log?: LogFn;
}

export class NotFoundError extends Error {}

const nowIso = () => new Date().toISOString();

/** queued → sending。回傳 true 才可以寄(同一列只有一個請求搶得到) */
const claim = async (db: Db, mailId: number) => {
  const { data, error } = await db
    .from("supplier_application_mails")
    .update({ status: "sending", updated_at: nowIso() })
    .eq("id", mailId)
    .eq("status", "queued")
    .select("id");
  if (error) throw new Error(`claim mail ${mailId}: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
};

/** queued → skipped(寄信前才發現不該寄,例如收件地址不合格式);一樣只動還在排隊的那一列 */
const skipQueued = async (db: Db, mailId: number, reason: string) => {
  const { data, error } = await db
    .from("supplier_application_mails")
    .update({ status: "skipped", skip_reason: reason, updated_at: nowIso() })
    .eq("id", mailId)
    .eq("status", "queued")
    .select("id");
  if (error) throw new Error(`skip mail ${mailId}: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
};

const finish = async (db: Db, mailId: number, patch: Record<string, unknown>, log: LogFn) => {
  const { error } = await db
    .from("supplier_application_mails")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", mailId);
  // 信已經寄出去了,紀錄寫失敗只記 log,不要讓整支回錯誤(pg_net 不會重試,但也別誤導)
  if (error) log("error", { at: "supplier_application.finish", mail_id: mailId, error: error.message });
};

const confirmationNote = (row: MailRow | undefined, outcome: MailOutcome): ConfirmationNote => {
  if (outcome.status === "sent") return "sent";
  if (outcome.status === "failed") return "failed";
  if (outcome.status === "skipped") {
    if (outcome.skip_reason === "email_24h") return "skipped:email_24h";
    if (outcome.skip_reason === "hourly_cap") return "skipped:hourly_cap";
    if (outcome.skip_reason === "invalid_email") return "skipped:invalid_email";
    return "skipped";
  }
  if (row?.status === "sent") return "sent";
  return "unknown";
};

export const processSupplierApplication = async (
  deps: SupplierApplicationDeps,
  applicationId: unknown,
): Promise<SupplierApplicationResult> => {
  const { db, send, config } = deps;
  const log: LogFn = deps.log ?? (() => {});
  const id = typeof applicationId === "string" ? applicationId.trim() : "";
  if (!UUID_RE.test(id)) throw new NotFoundError("invalid application id");

  const { data: appData, error: appErr } = await db
    .from("supplier_applications")
    .select(APPLICATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (appErr) throw new Error(`load application: ${appErr.message}`);
  const app = appData as ApplicationRecord | null;
  if (!app) throw new NotFoundError("application not found");

  const { data: mailData, error: mailErr } = await db
    .from("supplier_application_mails")
    .select("id, kind, status, skip_reason")
    .eq("application_id", id);
  if (mailErr) throw new Error(`load mails: ${mailErr.message}`);
  const mails = (mailData as MailRow[] | null) ?? [];
  const applicantRow = mails.find((m) => m.kind === "applicant_confirmation");
  const ownerRow = mails.find((m) => m.kind === "owner_notification");

  const sendOne = async (
    row: MailRow | undefined,
    build: () => { subject: string; html: string; text: string },
    envelope: { from: string; to: string[]; replyTo: string | null },
    keepBody: boolean,
    skipReason: string | null = null,
  ): Promise<MailOutcome> => {
    if (!row) return { status: "not_queued" };
    if (row.status === "skipped") return { status: "skipped", skip_reason: row.skip_reason };
    if (row.status !== "queued") return { status: "not_queued" };
    if (skipReason) {
      if (!(await skipQueued(db, row.id, skipReason))) return { status: "claimed_elsewhere" };
      log("info", { at: "supplier_application.skip", application_id: id, kind: row.kind, reason: skipReason });
      return { status: "skipped", skip_reason: skipReason };
    }
    if (!(await claim(db, row.id))) return { status: "claimed_elsewhere" };

    const mail = build();
    const r = await send({ ...envelope, subject: mail.subject, html: mail.html, text: mail.text });
    await finish(
      db,
      row.id,
      {
        status: r.ok ? "sent" : "failed",
        resend_id: r.id,
        error: r.error,
        subject: mail.subject,
        body_text: keepBody ? mail.text : null,
      },
      log,
    );
    log(r.ok ? "info" : "error", {
      at: "supplier_application.send",
      application_id: id,
      kind: row.kind,
      ok: r.ok,
      resend_id: r.id,
      error: r.error,
    });
    return r.ok ? { status: "sent", resend_id: r.id } : { status: "failed", error: r.error };
  };

  const applicantEmail = String(app.contact_email ?? "").trim();
  const deliverable = isDeliverableEmail(applicantEmail);

  // 先寄申請者確認信,業主通知裡才寫得出「確認信有沒有寄出」。
  // 地址不是一般 email 格式就不寄(資料庫的匿名 policy 已經擋過,這裡是第二道)
  const applicant = await sendOne(
    applicantRow,
    () => applicantConfirmationMail(app),
    { from: config.applicantFrom, to: [applicantEmail], replyTo: config.replyTo },
    true,
    deliverable ? null : "invalid_email",
  );

  const owner = await sendOne(
    ownerRow,
    () => ownerNewApplicationMail(app, { adminSiteUrl: config.adminSiteUrl, confirmation: confirmationNote(applicantRow, applicant) }),
    // 業主按「回覆」直接回給申請者(地址格式不對就不設,免得整封通知被寄信服務退回)
    { from: config.ownerFrom, to: config.ownerTo, replyTo: deliverable ? applicantEmail : null },
    false,
  );

  return { application_id: id, applicant, owner };
};
