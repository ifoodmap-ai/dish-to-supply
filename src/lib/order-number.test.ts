import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatOrderNo } from "./order-number";

const ROOT = resolve(__dirname, "../..");

describe("formatOrderNo", () => {
  it("取 id 最後 8 碼、轉大寫、前面加 #", () => {
    expect(formatOrderNo("a1e337b0-de8c-4e65-b22a-ca76edcf4143")).toBe("#EDCF4143");
  });

  it("同一張單在任何地方都是同一個編號(不是前 8 碼)", () => {
    const id = "a1e337b0-de8c-4e65-b22a-ca76edcf4143";
    expect(formatOrderNo(id)).not.toBe("#A1E337B0");
    expect(formatOrderNo(id.toUpperCase())).toBe(formatOrderNo(id));
  });

  it("短 id 原樣大寫;空值給佔位符,不會噴錯", () => {
    expect(formatOrderNo("abc")).toBe("#ABC");
    expect(formatOrderNo("")).toBe("#—");
    expect(formatOrderNo(null)).toBe("#—");
    expect(formatOrderNo(undefined)).toBe("#—");
  });
});

describe("誰在用 formatOrderNo", () => {
  it("notify 通知信直接 import 這支(Deno 的相對路徑 + .ts),沒有自己截字串", () => {
    const notify = readFileSync(resolve(ROOT, "supabase/functions/notify/index.ts"), "utf8");
    expect(notify).toContain('from "../../../src/lib/order-number.ts"');
    expect(notify).toMatch(/orderShort:\s*formatOrderNo\(/);
    expect(notify).not.toMatch(/slice\(-8\)/);
  });

  it("這支檔案不 import 任何東西(Edge Function 要能直接載入)", () => {
    const src = readFileSync(resolve(__dirname, "order-number.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  it.each([
    "src/pages/supplier/SupplierOrdersPage.tsx",
    "src/pages/admin/AdminPipelinePage.tsx",
    "src/pages/admin/AdminOrderTimelinePage.tsx",
    "src/pages/admin/DispatchOrderDialog.tsx",
    "src/pages/restaurant/RestaurantOrdersPage.tsx",
    "src/components/restaurant/ReceiveOrderDialog.tsx",
    "src/components/restaurant/OrderReviewDialog.tsx",
  ])("%s 用 formatOrderNo,不再自己截 id", (file) => {
    const src = readFileSync(resolve(ROOT, file), "utf8");
    expect(src).toContain("formatOrderNo(");
    expect(src).not.toMatch(/\.id\.slice\(-8\)|\.id\.slice\(0,\s*8\)|order_id\.slice\(/);
  });
});
