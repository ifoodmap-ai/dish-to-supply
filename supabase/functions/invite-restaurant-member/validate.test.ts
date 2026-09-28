import { describe, expect, it } from "vitest";
import { NAME_MAX, parseInviteInput } from "./validate";

const BRANCH = "5b0e8c1a-2f4d-4b8e-9a51-0c6d3e7f9a12";
const RESTAURANT = "0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f";

const valid = {
  email: "  Member.Test+1@Example.COM ",
  name: "  王  小明 ",
  role: "purchaser",
  branch_id: BRANCH,
  restaurant_id: RESTAURANT,
};

describe("parseInviteInput", () => {
  it("接受合法輸入,並把 email 轉小寫、姓名收斂空白", () => {
    const r = parseInviteInput(valid);
    expect(r).toEqual({
      ok: true,
      value: {
        email: "member.test+1@example.com",
        name: "王 小明",
        role: "purchaser",
        branchId: BRANCH,
        restaurantId: RESTAURANT,
      },
    });
  });

  it.each(["owner", "manager", "purchaser"])("接受程式實際使用的角色 %s", (role) => {
    expect(parseInviteInput({ ...valid, role }).ok).toBe(true);
  });

  it("分店可省略(= 全店),空字串也視為沒有", () => {
    const r1 = parseInviteInput({ ...valid, branch_id: null });
    const r2 = parseInviteInput({ ...valid, branch_id: "" });
    const r3 = parseInviteInput({ email: valid.email, name: valid.name, role: "manager" });
    for (const r of [r1, r2, r3]) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.branchId).toBeNull();
    }
  });

  it.each([
    [null, "INVALID_BODY", undefined],
    [[], "INVALID_BODY", undefined],
    ["email=a@b.co", "INVALID_BODY", undefined],
    [{ ...valid, email: undefined }, "EMAIL_REQUIRED", "email"],
    [{ ...valid, email: "   " }, "EMAIL_REQUIRED", "email"],
    [{ ...valid, email: "not-an-email" }, "EMAIL_INVALID", "email"],
    [{ ...valid, email: "a@b" }, "EMAIL_INVALID", "email"],
    [{ ...valid, email: "a b@c.co" }, "EMAIL_INVALID", "email"],
    [{ ...valid, email: 123 }, "EMAIL_INVALID", "email"],
    [{ ...valid, email: `${"a".repeat(250)}@b.co` }, "EMAIL_INVALID", "email"],
    [{ ...valid, name: undefined }, "NAME_REQUIRED", "name"],
    [{ ...valid, name: "  " }, "NAME_REQUIRED", "name"],
    [{ ...valid, name: "王\u0000小明" }, "NAME_INVALID", "name"],
    [{ ...valid, name: "字".repeat(NAME_MAX + 1) }, "NAME_TOO_LONG", "name"],
    [{ ...valid, role: undefined }, "ROLE_REQUIRED", "role"],
    [{ ...valid, role: "buyer" }, "ROLE_INVALID", "role"],
    [{ ...valid, role: "admin" }, "ROLE_INVALID", "role"],
    [{ ...valid, role: "OWNER" }, "ROLE_INVALID", "role"],
    [{ ...valid, branch_id: "not-a-uuid" }, "BRANCH_INVALID", "branch_id"],
    [{ ...valid, branch_id: 42 }, "BRANCH_INVALID", "branch_id"],
    [{ ...valid, restaurant_id: "x'; drop table--" }, "RESTAURANT_INVALID", "restaurant_id"],
  ])("拒絕不合法輸入 %#", (body, code, field) => {
    const r = parseInviteInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.field).toBe(field);
      expect(r.message).toMatch(/\S/);
    }
  });

  it(`姓名剛好 ${NAME_MAX} 個字(中文)可以過`, () => {
    expect(parseInviteInput({ ...valid, name: "字".repeat(NAME_MAX) }).ok).toBe(true);
  });
});
