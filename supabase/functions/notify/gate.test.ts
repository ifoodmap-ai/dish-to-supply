import { describe, expect, it } from "vitest";
import { forwardNoteHtml, isLive, planDeliveries, TEST_INBOX, TEST_SUBJECT_PREFIX } from "./gate.ts";

const recipients = [
  { email: "owner@real-restaurant.tw", audience: "restaurant" as const },
  { email: "manager@real-restaurant.tw", audience: "restaurant" as const },
  { email: "sales@real-supplier.tw", audience: "supplier" as const },
];

describe("isLive", () => {
  it("只有字串 true 才算開放", () => {
    expect(isLive("true")).toBe(true);
    for (const v of [undefined, null, "", "TRUE", "True", "1", "yes", " true", "true "]) {
      expect(isLive(v)).toBe(false);
    }
  });
});

describe("planDeliveries — 閘門關閉(預設)", () => {
  const out = planDeliveries(recipients, "已出貨 — 訂單 #A1E337B0", false);

  it("所有信都只寄到內部測試信箱", () => {
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((d) => d.to === TEST_INBOX)).toBe(true);
    expect(TEST_INBOX).toBe("ifoodmaptw@gmail.com");
  });

  it("主旨前面加上 [測試轉寄]", () => {
    for (const d of out) {
      expect(d.subject).toBe(`${TEST_SUBJECT_PREFIX} 已出貨 — 訂單 #A1E337B0`);
      expect(d.subject.startsWith("[測試轉寄]")).toBe(true);
    }
  });

  it("同一種收件對象合併成一封,內文開頭列出原本的收件人", () => {
    expect(out).toHaveLength(2);
    const rest = out.find((d) => d.audience === "restaurant")!;
    const sup = out.find((d) => d.audience === "supplier")!;
    expect(rest.originalRecipients).toEqual(["owner@real-restaurant.tw", "manager@real-restaurant.tw"]);
    expect(sup.originalRecipients).toEqual(["sales@real-supplier.tw"]);
    expect(rest.forwardNote).toContain("owner@real-restaurant.tw");
    expect(rest.forwardNote).toContain("manager@real-restaurant.tw");
    expect(rest.forwardNote).toContain("原本的收件人");
    expect(sup.forwardNote).toContain("sales@real-supplier.tw");
  });

  it("重複的收件人只列一次", () => {
    const dup = planDeliveries(
      [recipients[0], recipients[0], recipients[1]],
      "s",
      false,
    );
    expect(dup).toHaveLength(1);
    expect(dup[0].originalRecipients).toEqual(["owner@real-restaurant.tw", "manager@real-restaurant.tw"]);
  });

  it("沒有收件人就不寄", () => {
    expect(planDeliveries([], "s", false)).toEqual([]);
  });

  it("說明裡的收件人會被跳脫,不能塞 HTML", () => {
    const note = forwardNoteHtml(['x"><script>alert(1)</script>@a.tw'], "supplier");
    expect(note).not.toContain("<script>");
    expect(note).toContain("&lt;script&gt;");
  });
});

describe("planDeliveries — 正式開放(NOTIFY_LIVE=true)", () => {
  it("每位收件人各一封、主旨不變、沒有轉寄說明", () => {
    const out = planDeliveries(recipients, "已出貨 — 訂單 #A1E337B0", true);
    expect(out.map((d) => d.to)).toEqual(recipients.map((r) => r.email));
    expect(out.every((d) => d.subject === "已出貨 — 訂單 #A1E337B0")).toBe(true);
    expect(out.every((d) => d.forwardNote === null)).toBe(true);
  });
});
