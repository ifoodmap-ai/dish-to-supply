import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage";

type Listener = (event: string, session: unknown) => void;

const { auth, listeners, navigate, toastSuccess, toastError } = vi.hoisted(() => {
  const listeners: Listener[] = [];
  return {
    listeners,
    navigate: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn((cb: Listener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/components/PublicHeader", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, info: vi.fn() } }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const SESSION = { access_token: "at", user: { id: "u1" } };

const visit = (pathWithQueryAndHash: string) => window.history.replaceState({}, "", pathWithQueryAndHash);
const renderPage = () =>
  render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
const withSession = (session: unknown) => auth.getSession.mockResolvedValue({ data: { session }, error: null });
const heading = () => screen.findByRole("heading", { level: 1 });

const fillPassword = async (pw: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/密碼$/, { selector: "#new-password" }), pw);
  await user.type(screen.getByLabelText("再輸入一次"), pw);
  return user;
};

beforeEach(() => {
  listeners.length = 0;
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
});

afterEach(() => {
  cleanup();
  visit("/");
});

describe("ResetPasswordPage:recovery(維持原本行為)", () => {
  it("忘記密碼的信點回來(#type=recovery)→「設定新密碼」,送出後更新密碼並回登入頁", async () => {
    visit("/reset-password#access_token=at&refresh_token=rt&type=recovery");
    withSession(SESSION);
    renderPage();

    expect(await heading()).toHaveTextContent("設定新密碼");
    expect(screen.getByText("設定完成後會自動帶你進入系統")).toBeInTheDocument();
    const user = await fillPassword("secret123");
    await user.click(screen.getByRole("button", { name: "更新密碼" }));

    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "secret123" }));
    expect(toastSuccess).toHaveBeenCalledWith("密碼已更新", { description: "正在帶你進入系統…" });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }), { timeout: 2500 });
  });

  it("餐廳成員邀請(?type=recovery,hash 是 type=invite)一樣進「設定新密碼」", async () => {
    visit("/reset-password?type=recovery#access_token=at&refresh_token=rt&type=invite");
    withSession(SESSION);
    renderPage();
    expect(await heading()).toHaveTextContent("設定新密碼");
    expect(screen.queryByText("設定密碼以啟用供應商帳號")).not.toBeInTheDocument();
  });

  it("網址沒有線索時先顯示「忘記密碼」,收到 PASSWORD_RECOVERY 事件再切到「設定新密碼」", async () => {
    visit("/reset-password");
    withSession(null);
    renderPage();
    expect(await heading()).toHaveTextContent("忘記密碼");

    listeners.forEach((cb) => cb("PASSWORD_RECOVERY", SESSION));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("設定新密碼"));
  });

  it("「忘記密碼」寄出的連結一樣回 /reset-password(不帶 type)", async () => {
    visit("/reset-password");
    withSession(null);
    renderPage();
    await heading();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("電子郵件"), " Someone@Example.com ");
    await user.click(screen.getByRole("button", { name: "寄送重設連結" }));

    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("someone@example.com", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    expect(await heading()).toHaveTextContent("重設信已寄出");
  });
});

describe("ResetPasswordPage:供應商邀請(?type=invite)", () => {
  it("邀請連結打開就是「設定密碼以啟用供應商帳號」", async () => {
    visit("/reset-password?type=invite#access_token=at&refresh_token=rt&type=invite");
    withSession(SESSION);
    renderPage();

    expect(await heading()).toHaveTextContent("設定密碼以啟用供應商帳號");
    expect(screen.queryByText("忘記密碼")).not.toBeInTheDocument();
    const user = await fillPassword("secret123");
    await user.click(screen.getByRole("button", { name: "設定密碼並啟用帳號" }));

    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "secret123" }));
    expect(toastSuccess).toHaveBeenCalledWith("密碼已設定,帳號已啟用", { description: "正在帶你進入供應商後台…" });
  });

  it("session 晚一步才到(SIGNED_IN 事件)也會進設定密碼", async () => {
    visit("/reset-password?type=invite#access_token=at&type=invite");
    withSession(null);
    renderPage();
    listeners.forEach((cb) => cb("SIGNED_IN", SESSION));
    expect(await heading()).toHaveTextContent("設定密碼以啟用供應商帳號");
  });

  it("換不到 session(連結已用過、網址不完整)→ 顯示連結失效,不會停在「忘記密碼」", async () => {
    visit("/reset-password?type=invite");
    withSession(null);
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "設定密碼的連結已失效" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新寄送設定密碼連結" })).toBeInTheDocument();
  });
});

describe("ResetPasswordPage:連結過期或無效", () => {
  const EXPIRED = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

  it("邀請連結過期:說明原因,並可重新寄送設定密碼連結(寄回 ?type=invite)", async () => {
    visit(`/reset-password?type=invite${EXPIRED}`);
    withSession(null);
    renderPage();

    expect(await heading()).toHaveTextContent("設定密碼的連結已失效");
    expect(screen.getByText(/只能使用一次,而且寄出後 1 小時內有效/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("電子郵件"), "Supplier@Example.com");
    await user.click(screen.getByRole("button", { name: "重新寄送設定密碼連結" }));

    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("supplier@example.com", {
        redirectTo: `${window.location.origin}/reset-password?type=invite`,
      }),
    );
    expect(await heading()).toHaveTextContent("設定密碼的信已寄出");
  });

  it("重設 / 餐廳邀請的連結過期:一樣顯示失效說明,重寄的連結走原本的 recovery", async () => {
    visit(`/reset-password?type=recovery${EXPIRED}`);
    withSession(null);
    renderPage();

    expect(await heading()).toHaveTextContent("這個連結已失效");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("電子郵件"), "member@example.com");
    await user.click(screen.getByRole("button", { name: "重新寄送設定密碼連結" }));
    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("member@example.com", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
  });

  it("連結失效時,就算之後收到登入事件也不會跳去設定密碼", async () => {
    visit(`/reset-password?type=invite${EXPIRED}`);
    withSession(null);
    renderPage();
    expect(await heading()).toHaveTextContent("設定密碼的連結已失效");
    listeners.forEach((cb) => cb("SIGNED_IN", SESSION));
    listeners.forEach((cb) => cb("PASSWORD_RECOVERY", SESSION));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("設定密碼的連結已失效");
  });

  it("重寄失敗(例如太頻繁)時提示錯誤,停在原畫面", async () => {
    visit(`/reset-password?type=invite${EXPIRED}`);
    withSession(null);
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: new Error("For security purposes, you can only request this after 20 seconds.") });
    renderPage();
    await heading();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("電子郵件"), "supplier@example.com");
    await user.click(screen.getByRole("button", { name: "重新寄送設定密碼連結" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("寄送失敗", expect.anything()));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("設定密碼的連結已失效");
  });
});
