import { describe, expect, it } from "vitest";
import { parseAuthLink } from "./auth-link";

const SITE = "https://dish-to-supply.vercel.app";

describe("parseAuthLink", () => {
  it("供應商邀請:query 的 type=invite", () => {
    expect(parseAuthLink(`${SITE}/reset-password?type=invite#access_token=abc&refresh_token=r&type=invite`)).toEqual({
      type: "invite",
      hashType: "invite",
      hasAccessToken: true,
      error: null,
    });
  });

  it("餐廳成員邀請:query 的 type=recovery 蓋過 hash 的 type=invite(跟 supabase-js 一樣)", () => {
    expect(parseAuthLink(`${SITE}/reset-password?type=recovery#access_token=abc&type=invite`)).toMatchObject({
      type: "recovery",
      hashType: "invite",
      hasAccessToken: true,
    });
  });

  it("忘記密碼的信:只有 hash 的 type=recovery", () => {
    expect(parseAuthLink(`${SITE}/reset-password#access_token=abc&type=recovery`)).toMatchObject({
      type: "recovery",
      hashType: "recovery",
    });
  });

  it("連結過期:GoTrue 把錯誤放在 hash", () => {
    const info = parseAuthLink(
      `${SITE}/reset-password?type=invite#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    );
    expect(info.type).toBe("invite");
    expect(info.hasAccessToken).toBe(false);
    expect(info.error).toEqual({ code: "otp_expired", description: "Email link is invalid or has expired" });
  });

  it("錯誤放在 query 也認得(PKCE 流程)", () => {
    expect(parseAuthLink(`${SITE}/reset-password?error=access_denied&error_description=bad`).error).toEqual({
      code: "access_denied",
      description: "bad",
    });
  });

  it("什麼都沒有 / 網址壞掉", () => {
    expect(parseAuthLink(`${SITE}/reset-password`)).toEqual({ type: null, hashType: null, hasAccessToken: false, error: null });
    expect(parseAuthLink("not a url")).toEqual({ type: null, hashType: null, hasAccessToken: false, error: null });
  });
});
