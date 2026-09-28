import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalInfo } from "@/lib/portal";
import type { PendingRestaurantInvite } from "@/lib/restaurant-invites";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock("sonner", () => ({
  toast: { success: h.toastSuccess, info: h.toastInfo, error: vi.fn() },
}));

// 走真的 src/lib/restaurant-invites.ts,只把最底層的 supabase.rpc 換掉
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc } }));

import RestaurantInvitePanel from "./RestaurantInvitePanel";

// 同時跑很多測試檔時 CPU 會被搶,逐字打字(預設每個字之間讓出一次 event loop)偶爾會超過 5 秒:
// 打字不延遲,逾時也放寬到 15 秒(單獨跑時整支不到 3 秒)。
vi.setConfig({ testTimeout: 15_000 });
const setupUser = () => userEvent.setup({ delay: null });

const INVITE_A: PendingRestaurantInvite = {
  invite_id: "inv-a",
  restaurant_name: "好味小館",
  role: "purchaser",
  branch_name: "信義店",
  invited_at: "2026-09-28T07:00:00Z",
};
const INVITE_B: PendingRestaurantInvite = {
  invite_id: "inv-b",
  restaurant_name: "阿明熱炒",
  role: "manager",
  branch_name: null,
  invited_at: "2026-09-28T07:30:00Z",
};
const SUPPLIER_PORTAL: PortalInfo = {
  key: "supplier",
  label: "供應商後台",
  orgName: "好菜行",
  path: "/supplier",
  external: false,
};
const NOT_FOUND = { code: "P0001", message: "invite not found", hint: "invite_not_found" };

const onSignOut = vi.fn();

const renderPanel = (invites: PendingRestaurantInvite[], portals: PortalInfo[] = [], displayName: string | null = "陳新人") =>
  render(
    <MemoryRouter>
      <RestaurantInvitePanel invites={invites} portals={portals} displayName={displayName} onSignOut={onSignOut} />
    </MemoryRouter>,
  );

const card = (restaurant: string) => {
  const el = screen.getByText(new RegExp(`「${restaurant}」邀請你以`));
  const li = el.closest("li");
  if (!li) throw new Error(`找不到 ${restaurant} 的邀請卡`);
  return li as HTMLElement;
};

beforeEach(() => {
  h.navigate.mockReset();
  h.rpc.mockReset();
  h.toastSuccess.mockReset();
  h.toastInfo.mockReset();
  onSignOut.mockReset();
});

afterEach(cleanup);

describe("RestaurantInvitePanel —— 顯示", () => {
  it("每筆邀請顯示「X 餐廳」邀請你以「角色」加入,以及接受 / 拒絕", () => {
    renderPanel([INVITE_A, INVITE_B]);
    expect(screen.getByText("你有 2 個餐廳邀請")).toBeInTheDocument();
    expect(screen.getByText("「好味小館」邀請你以「採購員」加入")).toBeInTheDocument();
    expect(screen.getByText("「阿明熱炒」邀請你以「店長」加入")).toBeInTheDocument();
    expect(within(card("好味小館")).getByText(/分店:信義店/)).toBeInTheDocument();
    expect(within(card("阿明熱炒")).getByText(/全店/)).toBeInTheDocument();
    expect(within(card("好味小館")).getByRole("button", { name: "接受" })).toBeEnabled();
    expect(within(card("好味小館")).getByRole("button", { name: "拒絕" })).toBeEnabled();
    // 還沒決定之前,不會出現「建立自己的餐廳」
    expect(screen.queryByRole("button", { name: /建立我的餐廳/ })).not.toBeInTheDocument();
  });
});

describe("RestaurantInvitePanel —— 接受", () => {
  it("接受 → 呼叫 accept_restaurant_invite(只帶邀請 id)→ 進餐廳後台", async () => {
    h.rpc.mockResolvedValue({ data: "rest-1", error: null });
    const user = setupUser();
    renderPanel([INVITE_A]);

    await user.click(within(card("好味小館")).getByRole("button", { name: "接受" }));

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/restaurant", { replace: true }));
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith("accept_restaurant_invite", { p_invite: "inv-a" });
    expect(h.toastSuccess).toHaveBeenCalledWith("已加入「好味小館」");
  });

  it("邀請已失效(被取消)→ 顯示原因、這張卡消失,不會進後台", async () => {
    h.rpc.mockResolvedValue({ data: null, error: NOT_FOUND });
    const user = setupUser();
    renderPanel([INVITE_A, INVITE_B]);

    await user.click(within(card("好味小館")).getByRole("button", { name: "接受" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("這個邀請已經失效");
    expect(screen.queryByText(/「好味小館」邀請你以/)).not.toBeInTheDocument();
    expect(screen.getByText(/「阿明熱炒」邀請你以/)).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("其他錯誤 → 顯示「稍後再試」,卡片留著可以重試", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const user = setupUser();
    renderPanel([INVITE_A]);

    await user.click(within(card("好味小館")).getByRole("button", { name: "接受" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("請稍後再試");
    expect(within(card("好味小館")).getByRole("button", { name: "接受" })).toBeEnabled();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});

describe("RestaurantInvitePanel —— 拒絕", () => {
  it("拒絕要再確認一次;按「取消」什麼都不會送出", async () => {
    const user = setupUser();
    renderPanel([INVITE_A]);

    await user.click(within(card("好味小館")).getByRole("button", { name: "拒絕" }));
    expect(within(card("好味小館")).getByText(/確定要拒絕「好味小館」的邀請嗎/)).toBeInTheDocument();

    await user.click(within(card("好味小館")).getByRole("button", { name: "取消" }));
    expect(h.rpc).not.toHaveBeenCalled();
    expect(within(card("好味小館")).getByRole("button", { name: "接受" })).toBeInTheDocument();
  });

  it("沒有其他身分:拒絕 → 呼叫 decline_restaurant_invite → 引導建立自己的餐廳(自己輸入餐廳名稱)", async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "decline_restaurant_invite" ? { data: null, error: null } : { data: "rest-own", error: null },
    );
    const user = setupUser();
    renderPanel([INVITE_A], [], "陳新人");

    await user.click(within(card("好味小館")).getByRole("button", { name: "拒絕" }));
    await user.click(within(card("好味小館")).getByRole("button", { name: "確定拒絕" }));

    expect(await screen.findByText(/已拒絕邀請 —— 要建立自己的餐廳嗎/)).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("decline_restaurant_invite", { p_invite: "inv-a" });
    expect(h.toastInfo).toHaveBeenCalledWith("已拒絕「好味小館」的邀請");
    expect(h.navigate).not.toHaveBeenCalled();

    // 聯絡人預填註冊時的名字;餐廳名稱要自己填(不依賴 user_metadata)
    expect(screen.getByLabelText("聯絡人(選填)")).toHaveValue("陳新人");
    await user.click(screen.getByRole("button", { name: "建立我的餐廳" }));
    expect(screen.getByText("餐廳名稱需為 2 至 100 個字元")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalledWith("create_restaurant_onboarding", expect.anything());

    await user.type(screen.getByLabelText("餐廳名稱"), "陳家小吃");
    await user.type(screen.getByLabelText("電話(選填)"), "0912345678");
    await user.click(screen.getByRole("button", { name: "建立我的餐廳" }));

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/restaurant", { replace: true }));
    expect(h.rpc).toHaveBeenCalledWith("create_restaurant_onboarding", {
      p_name: "陳家小吃",
      p_contact_name: "陳新人",
      p_contact_phone: "0912345678",
    });
  });

  it("有其他身分:拒絕全部之後,帶他去原本的後台,不出現建店表單", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    const user = setupUser();
    renderPanel([INVITE_A], [SUPPLIER_PORTAL]);

    // 還有邀請時就可以先略過
    expect(screen.getByRole("link", { name: "先不處理,前往供應商後台" })).toHaveAttribute("href", "/supplier");

    await user.click(within(card("好味小館")).getByRole("button", { name: "拒絕" }));
    await user.click(within(card("好味小館")).getByRole("button", { name: "確定拒絕" }));

    expect(await screen.findByText("已拒絕邀請")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /前往供應商後台 · 好菜行/ })).toHaveAttribute("href", "/supplier");
    expect(screen.queryByRole("button", { name: "建立我的餐廳" })).not.toBeInTheDocument();
  });

  it("兩筆邀請拒絕一筆,另一筆還在,不會提早出現建店表單", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    const user = setupUser();
    renderPanel([INVITE_A, INVITE_B]);

    await user.click(within(card("好味小館")).getByRole("button", { name: "拒絕" }));
    await user.click(within(card("好味小館")).getByRole("button", { name: "確定拒絕" }));

    await waitFor(() => expect(screen.queryByText(/「好味小館」邀請你以/)).not.toBeInTheDocument());
    expect(screen.getByText("你有 1 個餐廳邀請")).toBeInTheDocument();
    expect(screen.getByText(/「阿明熱炒」邀請你以/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "建立我的餐廳" })).not.toBeInTheDocument();
  });

  it("一開始就沒有邀請也沒有身分 → 直接顯示「建立自己的餐廳」,並說明供應商/加入別人的店要找誰", async () => {
    h.rpc.mockResolvedValue({ data: "rest-own", error: null });
    const user = setupUser();
    renderPanel([], [], null);

    expect(screen.getByText("這個帳號還沒有後台身分")).toBeInTheDocument();
    expect(screen.getByText(/如果你是供應商,或是要加入別人的餐廳/)).toBeInTheDocument();
    expect(screen.queryByText(/個餐廳邀請/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("聯絡人(選填)")).toHaveValue("");

    await user.type(screen.getByLabelText("餐廳名稱"), "我的小店");
    await user.click(screen.getByRole("button", { name: "建立我的餐廳" }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/restaurant", { replace: true }));
    expect(h.rpc).toHaveBeenCalledWith("create_restaurant_onboarding", {
      p_name: "我的小店",
      p_contact_name: null,
      p_contact_phone: null,
    });
  });

  it("可以直接登出", async () => {
    const user = setupUser();
    renderPanel([INVITE_A]);
    await user.click(screen.getByRole("button", { name: "登出" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
