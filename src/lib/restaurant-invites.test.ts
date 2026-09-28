import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc } }));

import {
  INVITE_FAILED_MESSAGE,
  INVITE_GONE_MESSAGE,
  acceptRestaurantInvite,
  createOwnRestaurant,
  declineRestaurantInvite,
  getPendingRestaurantInvites,
  loadPendingRestaurantInvites,
  validateOwnRestaurant,
} from "./restaurant-invites";

const INVITE = "c0000001-0000-4000-8000-0000000000c3";
// 資料庫「找不到這筆待接受的邀請」:accept / decline 都回這個(migration 20260928170000)
const NOT_FOUND = { code: "P0001", message: "invite not found", hint: "invite_not_found" };

beforeEach(() => {
  h.rpc.mockReset();
});

describe("getPendingRestaurantInvites", () => {
  it("呼叫 my_pending_restaurant_invites,只留格式正確的列", async () => {
    h.rpc.mockResolvedValue({
      data: [
        { invite_id: INVITE, restaurant_name: "好味小館", role: "purchaser", branch_name: "信義店", invited_at: "2026-09-28T07:00:00Z" },
        { invite_id: "x", restaurant_name: "角色亂填", role: "admin", branch_name: null, invited_at: "t" },
        { restaurant_name: "沒有 id", role: "owner" },
        null,
      ],
      error: null,
    });
    const invites = await getPendingRestaurantInvites();
    expect(h.rpc).toHaveBeenCalledWith("my_pending_restaurant_invites", undefined);
    expect(invites).toEqual([
      { invite_id: INVITE, restaurant_name: "好味小館", role: "purchaser", branch_name: "信義店", invited_at: "2026-09-28T07:00:00Z" },
    ]);
  });

  it.each([
    ["回傳 error", () => h.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } })],
    ["丟例外", () => h.rpc.mockRejectedValue(new Error("offline"))],
    ["data 不是陣列", () => h.rpc.mockResolvedValue({ data: { nope: true }, error: null })],
  ])("%s → getPendingRestaurantInvites 回空陣列;loadPendingRestaurantInvites 標記 failed", async (_label, arrange) => {
    arrange();
    await expect(getPendingRestaurantInvites()).resolves.toEqual([]);
    await expect(loadPendingRestaurantInvites()).resolves.toEqual({ invites: [], failed: true });
  });

  it("查詢成功但沒有邀請 → failed: false", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    await expect(loadPendingRestaurantInvites()).resolves.toEqual({ invites: [], failed: false });
  });
});

describe("acceptRestaurantInvite", () => {
  it("帶邀請 id 呼叫 accept_restaurant_invite,成功回餐廳 id", async () => {
    h.rpc.mockResolvedValue({ data: "rest-1", error: null });
    await expect(acceptRestaurantInvite(INVITE)).resolves.toEqual({ kind: "ok", restaurantId: "rest-1" });
    expect(h.rpc).toHaveBeenCalledWith("accept_restaurant_invite", { p_invite: INVITE });
  });

  it("資料庫說找不到(被取消/已處理/不是你的)→ gone", async () => {
    h.rpc.mockResolvedValue({ data: null, error: NOT_FOUND });
    await expect(acceptRestaurantInvite(INVITE)).resolves.toEqual({ kind: "gone", message: INVITE_GONE_MESSAGE });
  });

  it("其他錯誤 → failed,不把資料庫原文丟給使用者", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    await expect(acceptRestaurantInvite(INVITE)).resolves.toEqual({ kind: "failed", message: INVITE_FAILED_MESSAGE });
  });
});

describe("declineRestaurantInvite", () => {
  it("帶邀請 id 呼叫 decline_restaurant_invite", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    await expect(declineRestaurantInvite(INVITE)).resolves.toEqual({ kind: "ok", restaurantId: null });
    expect(h.rpc).toHaveBeenCalledWith("decline_restaurant_invite", { p_invite: INVITE });
  });

  it("找不到 → gone;網路錯誤 → failed", async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: NOT_FOUND });
    await expect(declineRestaurantInvite(INVITE)).resolves.toMatchObject({ kind: "gone" });
    h.rpc.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(declineRestaurantInvite(INVITE)).resolves.toMatchObject({ kind: "failed" });
  });
});

describe("拒絕之後建立自己的餐廳", () => {
  it("validateOwnRestaurant 與 create_restaurant_onboarding 的規則一致", () => {
    expect(validateOwnRestaurant({ restaurantName: "好", contactName: "", phone: "" })).toEqual({
      restaurantName: "餐廳名稱需為 2 至 100 個字元",
    });
    expect(
      validateOwnRestaurant({ restaurantName: "好味小館", contactName: "王".repeat(81), phone: "1".repeat(31) }),
    ).toEqual({ contactName: "聯絡人姓名不可超過 80 個字元", phone: "電話不可超過 30 個字元" });
    expect(validateOwnRestaurant({ restaurantName: "  好味小館 ", contactName: "", phone: "" })).toEqual({});
  });

  it("createOwnRestaurant 走同一支 create_restaurant_onboarding,空白欄位送 null", async () => {
    h.rpc.mockResolvedValue({ data: "rest-new", error: null });
    await expect(createOwnRestaurant({ restaurantName: " 好味小館 ", contactName: " ", phone: "" })).resolves.toEqual({
      kind: "ok",
      restaurantId: "rest-new",
    });
    expect(h.rpc).toHaveBeenCalledWith("create_restaurant_onboarding", {
      p_name: "好味小館",
      p_contact_name: null,
      p_contact_phone: null,
    });
  });

  it("建立失敗 → failed", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "restaurant name must contain between 2 and 100 characters" } });
    await expect(createOwnRestaurant({ restaurantName: "好味小館", contactName: "", phone: "" })).resolves.toMatchObject({
      kind: "failed",
    });
  });
});
