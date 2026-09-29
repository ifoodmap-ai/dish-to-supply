import { describe, expect, it } from "vitest";
import { formatOrderNo } from "../../../src/lib/order-number.ts";
import {
  CANCELLED_BY_PLATFORM_RULE,
  CANCELLED_BY_RESTAURANT_RULE,
  money,
  renderMail,
  REQUOTE_RULE,
  resolveRule,
  RULES,
  type Ctx,
} from "./render.ts";

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

describe("resolveRule:哪個事件寄哪一種信", () => {
  it("原本的規則照舊(依目標狀態)", () => {
    expect(resolveRule({ toStatus: "dispatched" })).toBe(RULES.dispatched);
    expect(resolveRule({ toStatus: "quoted", fromStatus: "accepted", actorRole: "supplier" })).toBe(RULES.quoted);
    expect(resolveRule({ toStatus: "expired", fromStatus: "dispatched", actorRole: "system" })).toBeNull();
    expect(resolveRule({ toStatus: "confirmed" })).toBeNull();
  });

  it("accepted 只有「退回重新報價」(從 quoted 來)才寄給供應商;供應商自己接單不寄", () => {
    expect(resolveRule({ toStatus: "accepted", fromStatus: "quoted", actorRole: "restaurant" })).toBe(REQUOTE_RULE);
    expect(resolveRule({ toStatus: "accepted", fromStatus: "dispatched", actorRole: "supplier" })).toBeNull();
    // 舊版 trigger 沒帶 from_status:不寄(跟以前一樣)
    expect(resolveRule({ toStatus: "accepted" })).toBeNull();
  });

  it("進行中的單被取消才寄:平台取消 → 雙方;餐廳取消 → 供應商;草稿/待派發取消不寄", () => {
    expect(resolveRule({ toStatus: "cancelled", fromStatus: "confirmed", actorRole: "admin" })).toBe(CANCELLED_BY_PLATFORM_RULE);
    expect(resolveRule({ toStatus: "cancelled", fromStatus: "shipped", actorRole: "system" })).toBe(CANCELLED_BY_PLATFORM_RULE);
    expect(resolveRule({ toStatus: "cancelled", fromStatus: "quoted", actorRole: "restaurant" })).toBe(CANCELLED_BY_RESTAURANT_RULE);
    expect(resolveRule({ toStatus: "cancelled", fromStatus: "draft", actorRole: "restaurant" })).toBeNull();
    expect(resolveRule({ toStatus: "cancelled", fromStatus: "submitted", actorRole: "admin" })).toBeNull();
    expect(resolveRule({ toStatus: "cancelled" })).toBeNull();
    expect(CANCELLED_BY_PLATFORM_RULE.audience).toBe("both");
    expect(CANCELLED_BY_RESTAURANT_RULE.audience).toBe("supplier");
  });
});

describe("退回重新報價、取消的信件內容", () => {
  it("退回重新報價:寄給供應商,附上原因,連結帶 ?order=", () => {
    const m = renderMail(REQUOTE_RULE, ctx({ reason: "高麗菜改成 20 顆" }), "supplier", "https://site.example", ORDER_ID);
    expect(m.subject).toBe("好味小館 退回報價,請重新報價 — 訂單 #EDCF4143");
    expect(m.body).toContain("原因:高麗菜改成 20 顆");
    expect(m.url).toBe(`https://site.example/supplier/orders?order=${ORDER_ID}`);
  });

  it("平台取消:供應商那封叫他不要出貨、餐廳那封說可以重新叫貨,兩封都有原因", () => {
    const toSupplier = renderMail(CANCELLED_BY_PLATFORM_RULE, ctx({ reason: "供應商兩天沒回應" }), "supplier", "https://s", ORDER_ID);
    const toRestaurant = renderMail(CANCELLED_BY_PLATFORM_RULE, ctx({ reason: "供應商兩天沒回應" }), "restaurant", "https://s", ORDER_ID);
    expect(toSupplier.subject).toBe("訂單已取消 — 訂單 #EDCF4143");
    expect(toSupplier.body).toContain("請不要出貨");
    expect(toSupplier.body).toContain("原因:供應商兩天沒回應");
    expect(toRestaurant.body).toContain("可以在後台重新叫貨");
    expect(toRestaurant.body).toContain("原因:供應商兩天沒回應");
    expect(toRestaurant.url).toBe("https://s/restaurant/orders");
  });

  it("原因是使用者填的字:內文一樣跳脫,不能塞 HTML", () => {
    const m = renderMail(REQUOTE_RULE, ctx({ reason: '<a href="https://evil.example">點我</a>' }), "supplier", "https://s", ORDER_ID);
    expect(m.body).not.toContain('<a href="https://evil.example">');
    expect(m.body).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });
});

