import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JoinSupplierPage from "./JoinSupplierPage";

const { insert, from, track, toastError, toastInfo } = vi.hoisted(() => {
  const insert = vi.fn();
  return {
    insert,
    from: vi.fn(() => ({ insert })),
    track: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("@/lib/analytics", () => ({ track }));
vi.mock("@/components/PublicHeader", () => ({ default: () => null }));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "zh", setLanguage: vi.fn(), t: (k: string) => k }),
}));
vi.mock("sonner", () => ({ toast: { error: toastError, info: toastInfo, success: vi.fn() } }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <JoinSupplierPage />
    </MemoryRouter>,
  );

const fillRequired = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/公司名稱/), "鮮采農產");
  await user.type(screen.getByLabelText(/^Email/), "Supplier@Example.com");
  return user;
};

beforeEach(() => {
  insert.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("JoinSupplierPage", () => {
  it("正常送出:寫入申請(不含 honeypot 欄位),顯示已收到與確認信說明", async () => {
    renderPage();
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: "送出申請" }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("supplier_applications");
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ company_name: "鮮采農產", contact_email: "Supplier@Example.com" });
    expect(row).not.toHaveProperty("website");
    expect(track).toHaveBeenCalledWith("supplier_applied", {});
    expect(await screen.findByText("已收到申請")).toBeInTheDocument();
    expect(screen.getByText(/我們會寄一封確認信到/)).toBeInTheDocument();
    expect(screen.getByText("Supplier@Example.com")).toBeInTheDocument();
    expect(screen.getByText(/審核約需 3 個工作天/)).toBeInTheDocument();
  });

  it("honeypot 被填了(機器人):假裝成功,但完全不寫資料庫、不會觸發任何寄信", async () => {
    renderPage();
    const user = await fillRequired();
    fireEvent.change(document.getElementById("website")!, { target: { value: "https://spam.example" } });
    await user.click(screen.getByRole("button", { name: "送出申請" }));

    expect(await screen.findByText("已收到申請")).toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("honeypot 欄位真人看不到也跳不到(aria-hidden、tabIndex=-1)", () => {
    renderPage();
    const trap = document.getElementById("website")!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    // 螢幕閱讀器讀不到:用無障礙名稱找不到這個欄位
    expect(screen.queryByRole("textbox", { name: /公司網站/ })).toBeNull();
  });

  it("同一個 Email 已有待審申請(23505):告訴對方不用重送,不顯示成功", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key value violates unique constraint" } });
    renderPage();
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: "送出申請" }));

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith("這個 Email 已經有一筆申請在審核中", {
        description: "不需要重複送出,審核結果會寄到這個信箱。",
      }),
    );
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByText("已收到申請")).toBeNull();
  });

  it("其他錯誤維持原本的「送出失敗」", async () => {
    insert.mockResolvedValueOnce({ error: { code: "42501", message: "new row violates row-level security policy" } });
    renderPage();
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: "送出申請" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("送出失敗,請稍後再試"));
  });

  it.each(["中獎請加LINE<victim@gmail.com>", "x@gmail.com.", "x@gmail.com。"])(
    "Email 是 `%s` 這種寫法:瀏覽器內建的 email 檢查就擋下,根本不會送出",
    async (bad) => {
      renderPage();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/公司名稱/), "鮮采農產");
      const input = screen.getByLabelText(/^Email/) as HTMLInputElement;
      await user.type(input, bad);
      await user.click(screen.getByRole("button", { name: "送出申請" }));
      expect(input.validity.valid).toBe(false);
      expect(insert).not.toHaveBeenCalled();
      expect(screen.queryByText("已收到申請")).toBeNull();
    },
  );

  it.each(["x@localhost", "a@b.c"])(
    "瀏覽器放行、但不是一般 email 的寫法(%s)→ 我們自己的檢查擋下,不寫資料庫",
    async (bad) => {
      renderPage();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/公司名稱/), "鮮采農產");
      await user.type(screen.getByLabelText(/^Email/), bad);
      await user.click(screen.getByRole("button", { name: "送出申請" }));
      await waitFor(() => expect(toastError).toHaveBeenCalledWith("Email 格式不正確,請確認後再送出"));
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it.each(["o'brien@example.com", "user@example.xn--kpry57d"])("合法但少見的寫法照收:%s", async (ok) => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/公司名稱/), "鮮采農產");
    await user.type(screen.getByLabelText(/^Email/), ok);
    await user.click(screen.getByRole("button", { name: "送出申請" }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect((insert.mock.calls[0][0] as Record<string, unknown>).contact_email).toBe(ok);
  });

  it("欄位長度上限跟資料庫 policy 一致", () => {
    renderPage();
    expect(screen.getByLabelText(/公司名稱/)).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("maxlength", "254");
    expect(screen.getByLabelText("公司簡介")).toHaveAttribute("maxlength", "5000");
  });
});
