import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicCopyFiles = [
  "src/pages/LoginPortal.tsx",
  "src/pages/RestaurantRegisterPage.tsx",
  "src/pages/JoinSupplierPage.tsx",
  "src/components/investors/roadmap-config.ts",
];

const source = publicCopyFiles
  .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
  .join("\n");

describe("registration and listing copy", () => {
  it("does not market registration or supplier listing as free", () => {
    expect(source).not.toMatch(
      /餐廳免費註冊|免費建立餐廳帳號|供應商免費上架|免費申請供應商上架|免費上架申請|免費上架|不收上架費|零成本/,
    );
  });
});
