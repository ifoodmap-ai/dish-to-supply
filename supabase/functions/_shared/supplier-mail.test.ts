import { describe, expect, it, vi } from "vitest";
import {
  applicantConfirmationMail,
  applicationRef,
  approvedExistingAccountMail,
  createResendSender,
  DEFAULT_APPLICANT_FROM,
  isDeliverableEmail,
  mailConfigFromEnv,
  ownerNewApplicationMail,
  rejectionMail,
} from "./supplier-mail.ts";

const APP = {
  id: "1a2b3c4d-0000-4000-8000-000000000001",
  company_name: "鮮采<script>農產",
  contact_name: "王小明",
  contact_email: "owner@example.com",
  contact_phone: "02-1234-5678",
  contact_line: "freshfarm",
  categories: "蔬菜、肉品",
  service_areas: "台北、新北",
  description: "第一行\n<b>第二行</b>",
  admin_notes: "內部備註:這家曾經欠款",
  created_at: "2026-09-28T09:00:00.000Z",
};

describe("isDeliverableEmail(跟資料庫匿名 policy 同一條規則)", () => {
  it.each([
    "a@example.com",
    "first.last+tag@sub.example.com.tw",
    "A_B-c%d@Example.CO",
    "ifoodmaptw+apply-test@gmail.com",
    "o'brien@example.com",
    "user@example.xn--kpry57d",
  ])(
    "收:%s",
    (email) => expect(isDeliverableEmail(email)).toBe(true),
  );
  it.each([
    "a<victim@gmail.com>",
    "中獎請加LINE<victim@gmail.com>",
    "x@gmail.com.",
    "x@gmail.com。",
    "x@localhost",
    "x@-bad.com",
    '"quoted"@example.com',
    "x@example.c",
    "two@@example.com",
    " a@example.com",
  ])("不收:%s", (email) => expect(isDeliverableEmail(email)).toBe(false));
  it("超過 254 字不收,非字串不收", () => {
    expect(isDeliverableEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
    expect(isDeliverableEmail(null)).toBe(false);
  });
});

describe("mailConfigFromEnv", () => {
  it("沒設環境變數時用現行的寄件人與業主信箱", () => {
    const c = mailConfigFromEnv(() => undefined);
    expect(c.applicantFrom).toBe("iFoodmap 食材地圖 <noreply@gathertaiwan.com>");
    expect(c.ownerTo).toEqual(["ifoodmaptw@gmail.com"]);
    expect(c.replyTo).toBe("ifoodmaptw@gmail.com");
    expect(c.siteUrl).toBe("https://dish-to-supply.vercel.app");
  });

  it("寄件人、收件人、網址都從環境變數讀(換網域只要改 secret)", () => {
    const env: Record<string, string> = {
      NOTIFY_FROM: "iFoodmap <noreply@ifoodmap.ai>",
      LEAD_NOTIFY_FROM: "表單 <forms@ifoodmap.ai>",
      LEAD_NOTIFY_TO: " boss@ifoodmap.ai , ops@ifoodmap.ai ",
      SITE_URL: "https://app.ifoodmap.ai/",
      ADMIN_SITE_URL: "https://admin.ifoodmap.ai/",
      RESEND_API_KEY: "re_test",
    };
    const c = mailConfigFromEnv((k) => env[k]);
    expect(c.applicantFrom).toBe("iFoodmap <noreply@ifoodmap.ai>");
    expect(c.ownerFrom).toBe("表單 <forms@ifoodmap.ai>");
    expect(c.ownerTo).toEqual(["boss@ifoodmap.ai", "ops@ifoodmap.ai"]);
    expect(c.replyTo).toBe("boss@ifoodmap.ai");
    expect(c.siteUrl).toBe("https://app.ifoodmap.ai");
    expect(c.adminSiteUrl).toBe("https://admin.ifoodmap.ai");
    expect(c.resendKey).toBe("re_test");
    expect(DEFAULT_APPLICANT_FROM).toContain("gathertaiwan.com");
  });
});

describe("業主通知(新申請)", () => {
  const mail = ownerNewApplicationMail(APP, { adminSiteUrl: "https://admin.test", confirmation: "sent" });

  it("列出申請內容並跳脫 HTML", () => {
    expect(mail.subject).toBe("【供應商申請】鮮采<script>農產 — 王小明");
    expect(mail.html).toContain("鮮采&lt;script&gt;農產");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("第一行<br>&lt;b&gt;第二行&lt;/b&gt;");
    for (const v of ["owner@example.com", "02-1234-5678", "freshfarm", "蔬菜、肉品", "台北、新北"]) {
      expect(mail.html).toContain(v);
      expect(mail.text).toContain(v);
    }
  });

  it("附上審核連結、申請編號與確認信狀態", () => {
    expect(mail.html).toContain("https://admin.test/admin/applications");
    expect(mail.text).toContain(`申請編號：${applicationRef(APP.id)}`);
    expect(applicationRef(APP.id)).toBe("1A2B3C4D");
    expect(mail.text).toContain("申請者確認信：已寄出");
    const skipped = ownerNewApplicationMail(APP, { adminSiteUrl: "https://admin.test", confirmation: "skipped:email_24h" });
    expect(skipped.text).toContain("24 小時內已寄過");
  });

  it("主旨一定是單行(申請者填的換行不會進到信件標頭)", () => {
    const m = ownerNewApplicationMail({ ...APP, company_name: "惡意\r\nBcc: x@evil.test", contact_name: "王\n小明" }, {
      adminSiteUrl: "https://admin.test",
      confirmation: "sent",
    });
    expect(m.subject).toBe("【供應商申請】惡意 Bcc: x@evil.test — 王 小明");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("內部備註不會出現在業主通知裡(新申請本來就不該有)", () => {
    expect(mail.html).not.toContain("欠款");
  });
});

describe("申請者確認信", () => {
  it("說明已收到、審核後會以 Email 通知、大約多久", () => {
    const mail = applicantConfirmationMail(APP);
    expect(mail.subject).toBe("已收到你的 iFoodmap 供應商入駐申請");
    expect(mail.text).toContain("已收到");
    expect(mail.text).toContain("3 個工作天內完成審核");
    expect(mail.text).toContain("以 Email 寄到這個信箱");
    expect(mail.text).toContain("1A2B3C4D");
  });

  it("不回顯申請者填的任何文字(防止被拿來替別人的信箱送垃圾內容)", () => {
    // 故意把整筆申請丟進去:就算呼叫端傳錯,內容也只會用到 id / created_at
    const mail = applicantConfirmationMail(APP as never);
    for (const v of ["鮮采", "王小明", "freshfarm", "蔬菜", "第一行", "02-1234-5678", "欠款"]) {
      expect(mail.html).not.toContain(v);
      expect(mail.text).not.toContain(v);
    }
  });
});

describe("核准通知(email 原本就有帳號)", () => {
  it("請對方用原本的帳號登入,並附忘記密碼的路", () => {
    const mail = approvedExistingAccountMail({
      companyName: "鮮采<農產>",
      email: "owner@example.com",
      siteUrl: "https://app.test",
    });
    expect(mail.subject).toBe("你的 iFoodmap 供應商申請已通過");
    expect(mail.text).toContain("原本的帳號登入");
    expect(mail.text).toContain("登入：https://app.test/");
    expect(mail.text).toContain("https://app.test/reset-password");
    expect(mail.html).toContain("鮮采&lt;農產&gt;");
    expect(mail.text).not.toContain("設定密碼的連結");
  });
});

describe("退件信", () => {
  it("只放「給申請者的說明」(跳脫 HTML、保留換行)", () => {
    const mail = rejectionMail({ applicantMessage: "目前服務區域\n<i>尚未開放</i>" });
    expect(mail.subject).toBe("關於你的 iFoodmap 供應商入駐申請");
    expect(mail.html).toContain("審核說明");
    expect(mail.html).toContain("目前服務區域<br>&lt;i&gt;尚未開放&lt;/i&gt;");
    expect(mail.text).toContain("審核說明：\n目前服務區域\n<i>尚未開放</i>");
  });

  it("沒有說明就不放說明區塊", () => {
    const mail = rejectionMail({ applicantMessage: "   " });
    expect(mail.html).not.toContain("審核說明");
    expect(mail.text).not.toContain("審核說明");
    expect(mail.text).toContain("這次的申請暫時無法通過");
  });

  it("就算把整筆申請(含 admin_notes)丟進去,內部備註也不會出現", () => {
    const mail = rejectionMail({ ...(APP as object), applicantMessage: "謝謝" } as never);
    expect(mail.html).not.toContain("欠款");
    expect(mail.text).not.toContain("欠款");
    expect(mail.html).not.toContain("鮮采");
  });
});

describe("createResendSender", () => {
  const msg = {
    from: "iFoodmap <noreply@example.com>",
    to: ["a@example.com"],
    subject: "s",
    html: "<p>h</p>",
    text: "t",
    replyTo: "boss@example.com",
  };

  it("送出 html + text + reply_to,回傳 Resend 的 id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    const send = createResendSender("re_key", fetchImpl as unknown as typeof fetch);
    await expect(send(msg)).resolves.toEqual({ ok: true, id: "re_123", error: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(String(init.body))).toEqual({
      from: msg.from,
      to: msg.to,
      subject: "s",
      html: "<p>h</p>",
      text: "t",
      reply_to: "boss@example.com",
    });
  });

  it("Resend 回錯誤、網路錯誤、沒設 key 都回 ok:false", async () => {
    const bad = createResendSender("re_key", (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch);
    await expect(bad(msg)).resolves.toMatchObject({ ok: false, error: "Resend 429: rate limited" });
    const boom = createResendSender("re_key", (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch);
    await expect(boom(msg)).resolves.toMatchObject({ ok: false, error: "ECONNRESET" });
    const nokey = createResendSender("", vi.fn() as unknown as typeof fetch);
    await expect(nokey(msg)).resolves.toMatchObject({ ok: false, error: "RESEND_API_KEY 未設定" });
  });
});
