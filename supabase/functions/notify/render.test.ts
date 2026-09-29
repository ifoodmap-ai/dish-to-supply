import { describe, expect, it } from "vitest";
import { formatOrderNo } from "../../../src/lib/order-number.ts";
import { money, renderMail, RULES, type Ctx } from "./render.ts";

const ORDER_ID = "a1e337b0-de8c-4e65-b22a-ca76edcf4143";
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  orderShort: formatOrderNo(ORDER_ID),
  restaurantName: "好味小館",
  supplierName: "鮮綠農產",
  amount: money(3200),
  items: "高麗菜、青江菜",
  ...over,
});

describe("renderMail", () => {
  it("每一條規則都組得出主旨、內文、連結;訂單編號跟三個後台同一格式", () => {
    for (const [status, rule] of Object.entries(RULES)) {
      const aud = rule.audience === "both" ? "restaurant" : rule.audience;
      const m = renderMail(rule, ctx(), aud, "https://site.example", ORDER_ID);
      expect(m.subject.length, status).toBeGreaterThan(0);
      expect(m.body, status).toContain(rule.cta);
      expect(m.body, status).toContain(m.url);
    }
    const quoted = renderMail(RULES.quoted, ctx(), "restaurant", "https://site.example", ORDER_ID);
    expect(quoted.subject).toBe("鮮綠農產 已報價 — 訂單 #EDCF4143");
    expect(quoted.body).toContain("NT$ 3,200");
  });

  it("供應商的連結帶 ?order=(訂單頁會切到那張單),餐廳的連結維持原本的路徑", () => {
    const toSupplier = renderMail(RULES.dispatched, ctx(), "supplier", "https://site.example", ORDER_ID);
    expect(toSupplier.url).toBe(`https://site.example/supplier/orders?order=${ORDER_ID}`);
    const toRestaurant = renderMail(RULES.shipped, ctx(), "restaurant", "https://site.example", ORDER_ID);
    expect(toRestaurant.url).toBe("https://site.example/restaurant/orders");
  });

  it("店名、供應商名、品項會被跳脫,不能在平台寄出的信裡塞 HTML;主旨是純文字不跳脫", () => {
    const evil = ctx({
      restaurantName: '<a href="https://evil.example">點我領獎</a>',
      supplierName: "O'Neil & Sons",
      items: '"><img src=x onerror=alert(1)>',
    });
    const m = renderMail(RULES.dispatched, evil, "supplier", "https://site.example", ORDER_ID);
    expect(m.body).not.toContain('<a href="https://evil.example">');
    expect(m.body).not.toContain("<img");
    expect(m.body).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    expect(m.body).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(m.subject).toBe('新訂單待接單 — <a href="https://evil.example">點我領獎</a>');

    const q = renderMail(RULES.quoted, evil, "restaurant", "https://site.example", ORDER_ID);
    expect(q.body).toContain("O&#39;Neil &amp; Sons");
    expect(q.subject).toContain("O'Neil & Sons");
  });
});
