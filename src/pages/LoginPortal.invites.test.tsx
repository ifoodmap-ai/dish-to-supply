import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  session: null as unknown,
  accounts: { restaurant_accounts: [] as unknown[], supplier_accounts: [] as unknown[] } as Record<string, unknown[]>,
  errors: {} as Record<string, { message: string } | null>,
  invites: [] as unknown[],
  signIn: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: h.toastError },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "zh", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: h.errors[table] ? null : h.accounts[table] ?? [], error: h.errors[table] ?? null }).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: h.session } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: h.signIn,
        signOut: h.signOut,
      },
      from,
      rpc: h.rpc,
    },
  };
});

import LoginPortal from "./LoginPortal";

// 同時跑很多測試檔時 CPU 會被搶,逐字打字(預設每個字之間讓出一次 event loop)偶爾會超過 5 秒:
// 打字不延遲,逾時也放寬到 15 秒(單獨跑時整支不到 3 秒)。
vi.setConfig({ testTimeout: 15_000 });
const setupUser = () => userEvent.setup({ delay: null });

// 登入表單的 Radix Checkbox 在 jsdom 需要 ResizeObserver
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const SESSION = {
  access_token: "tok",
  user: { id: "u-invitee", email: "invitee@example.com", app_metadata: {}, user_metadata: { display_name: "陳新人" } },
};
const INVITE = {
  invite_id: "inv-1",
  restaurant_name: "好味小館",
  role: "purchaser",
  branch_name: null,
  invited_at: "2026-09-28T07:00:00Z",
};

beforeEach(() => {
  h.navigate.mockReset();
  h.signIn.mockReset();
  h.signOut.mockReset();
  h.toastError.mockReset();
  h.session = null;
  h.accounts = { restaurant_accounts: [], supplier_accounts: [] };
  h.errors = {};
  h.invites = [];
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string) =>
    fn === "my_pending_restaurant_invites" ? { data: h.invites, error: null } : { data: null, error: { message: "unexpected" } },
  );
  h.signOut.mockResolvedValue({ error: null });
});

afterEach(cleanup);

const renderPortal = () =>
  render(
    <MemoryRouter>
      <LoginPortal />
    </MemoryRouter>,
  );

describe("LoginPortal —— 受邀者登入後先看到接受/拒絕", () => {
  it("已登入(例如從邀請信設定完密碼回來)、只有待接受的邀請 → 顯示邀請,不導進任何後台", async () => {
    h.session = SESSION;
    // 就算資料庫意外回了待接受的列,也不算餐廳身分
    h.accounts.restaurant_accounts = [{ restaurant_id: "r-1", accepted_at: null, restaurants: { name: "好味小館" } }];
    h.invites = [INVITE];
    renderPortal();

    expect(await screen.findByText("「好味小館」邀請你以「採購員」加入")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "接受" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒絕" })).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("已登入、沒有邀請、有已接受的餐廳身分 → 照舊直接進餐廳後台", async () => {
    h.session = SESSION;
    h.accounts.restaurant_accounts = [{ restaurant_id: "r-1", accepted_at: "2026-09-01T00:00:00Z", restaurants: { name: "我的店" } }];
    renderPortal();

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/restaurant", { replace: true }));
    expect(screen.queryByText(/邀請你以/)).not.toBeInTheDocument();
  });

  it("用帳密登入、沒有任何身分但有邀請 → 不登出,顯示邀請", async () => {
    h.invites = [INVITE];
    h.signIn.mockResolvedValue({ data: { session: SESSION }, error: null });
    const user = setupUser();
    renderPortal();

    await user.click(await screen.findByText("我是餐廳"));
    await user.type(screen.getByLabelText("電子郵件"), "invitee@example.com");
    await user.type(screen.getByLabelText("密碼"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByText("「好味小館」邀請你以「採購員」加入")).toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("用帳密登入、沒有身分也沒有邀請(例如之前拒絕了邀請)→ 不登出,直接讓他建立自己的餐廳", async () => {
    h.signIn.mockResolvedValue({ data: { session: SESSION }, error: null });
    const user = setupUser();
    renderPortal();

    await user.click(await screen.findByText("我是餐廳"));
    await user.type(screen.getByLabelText("電子郵件"), "nobody@example.com");
    await user.type(screen.getByLabelText("密碼"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByText("這個帳號還沒有後台身分")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建立我的餐廳" })).toBeInTheDocument();
    expect(screen.getByLabelText("聯絡人(選填)")).toHaveValue("陳新人");
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("已登入、沒有邀請也沒有身分(拒絕後還沒建店就離開,再回來)→ 顯示建立自己的餐廳,不是卡在登入表單", async () => {
    h.session = SESSION;
    renderPortal();

    expect(await screen.findByText("這個帳號還沒有後台身分")).toBeInTheDocument();
    expect(screen.getByLabelText("餐廳名稱")).toBeInTheDocument();
    expect(screen.queryByLabelText("密碼")).not.toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("已登入、身分查詢失敗(例如供應商表逾時)、沒有邀請 → 只顯示「讀不到資料,請重試」,不給建店表單、不登出", async () => {
    h.session = SESSION;
    h.errors.supplier_accounts = { message: "upstream timeout" };
    renderPortal();

    expect(await screen.findByText("暫時讀不到你的帳號資料")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
    expect(screen.queryByText("這個帳號還沒有後台身分")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("餐廳名稱")).not.toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("用帳密登入、邀請查詢失敗、手上沒有身分 → 一樣只顯示「請重試」,不登出", async () => {
    h.signIn.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.rpc.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    const user = setupUser();
    renderPortal();

    await user.click(await screen.findByText("我是餐廳"));
    await user.type(screen.getByLabelText("電子郵件"), "invitee@example.com");
    await user.type(screen.getByLabelText("密碼"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByText("暫時讀不到你的帳號資料")).toBeInTheDocument();
    expect(screen.queryByLabelText("餐廳名稱")).not.toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("供應商表查詢失敗、但已有餐廳身分 → 照常進餐廳後台", async () => {
    h.session = SESSION;
    h.errors.supplier_accounts = { message: "upstream timeout" };
    h.accounts.restaurant_accounts = [{ restaurant_id: "r-1", accepted_at: "2026-09-01T00:00:00Z", restaurants: { name: "我的店" } }];
    renderPortal();

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/restaurant", { replace: true }));
    expect(screen.queryByText("暫時讀不到你的帳號資料")).not.toBeInTheDocument();
  });

  it("在邀請畫面按「登出」→ 真的登出並回到登入畫面", async () => {
    h.session = SESSION;
    h.invites = [INVITE];
    const user = setupUser();
    renderPortal();

    await user.click(await screen.findByRole("button", { name: "登出" }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("我是餐廳")).toBeInTheDocument();
  });
});
