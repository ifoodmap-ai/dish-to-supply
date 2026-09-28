import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminApplicationsPage from "./AdminApplicationsPage";

const { toast, rows } = vi.hoisted(() => ({
  toast: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    order: () => query,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return {
    supabase: {
      from: () => query,
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "admin-jwt" } }, error: null }),
      },
    },
  };
});

const PENDING = {
  id: "7d1e0c52-1111-4a2b-8c3d-000000000001",
  created_at: "2026-09-28T09:00:00.000Z",
  company_name: "鮮采農產",
  contact_name: "王小明",
  contact_email: "supplier@example.com",
  contact_phone: null,
  contact_line: null,
  categories: "蔬菜",
  service_areas: "台北",
  description: null,
  status: "pending",
  admin_notes: null,
  applicant_message: null,
  reviewed_at: null,
};

const fetchMock = vi.fn();
const respond = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const sentBody = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i][1] as RequestInit).body)) as Record<string, unknown>;

beforeEach(() => {
  rows.length = 0;
  rows.push({ ...PENDING });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openApprove = async () => {
  render(<AdminApplicationsPage />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "核准" }));
  return { user, dialog: await screen.findByRole("alertdialog") };
};

describe("AdminApplicationsPage:核准", () => {
  it("確認框不再說「回傳一組臨時密碼」,改說明邀請信與既有帳號的處理", async () => {
    const { dialog } = await openApprove();
    expect(dialog).not.toHaveTextContent("臨時密碼");
    expect(dialog).toHaveTextContent("寄一封「設定密碼」的邀請信到 supplier@example.com");
    expect(dialog).toHaveTextContent("不會更動該帳號原有的身分與權限");
  });

  it("Email 原本就有帳號:顯示「沿用既有帳號、已寄核准通知」,不會顯示寄信失敗", async () => {
    respond(200, {
      data: {
        supplier_id: "s1",
        supplier_name: "鮮采農產",
        login_email: "supplier@example.com",
        account: "existing",
        invited: false,
        temp_password: null,
        notified: true,
        mail_error: null,
      },
    });
    const { user, dialog } = await openApprove();
    await user.click(within(dialog).getByRole("button", { name: "確定核准" }));

    const result = await screen.findByRole("dialog");
    expect(result).toHaveTextContent("已核准（沿用既有帳號）");
    expect(result).toHaveTextContent("請用原本的帳號登入");
    expect(result).toHaveTextContent("沿用原本的密碼");
    expect(result).not.toHaveTextContent("寄信失敗");
    expect(result).not.toHaveTextContent("寄送失敗");
    expect(result).not.toHaveTextContent("臨時密碼");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/functions\/v1\/approve-supplier$/);
    expect(sentBody()).toEqual({ application_id: PENDING.id });
  });

  it("新帳號:顯示「已寄出邀請信」", async () => {
    respond(200, {
      data: { supplier_id: "s1", supplier_name: "鮮采農產", login_email: "supplier@example.com", account: "new", invited: true, temp_password: null },
    });
    const { user, dialog } = await openApprove();
    await user.click(within(dialog).getByRole("button", { name: "確定核准" }));
    const result = await screen.findByRole("dialog");
    expect(result).toHaveTextContent("已寄出邀請信");
    expect(result).toHaveTextContent("由供應商自行設定");
  });

  it("邀請信寄不出去時才顯示臨時密碼", async () => {
    respond(200, {
      data: { supplier_id: "s1", supplier_name: "鮮采農產", login_email: "supplier@example.com", account: "new", invited: false, temp_password: "TempPass-123", mail_error: "smtp down" },
    });
    const { user, dialog } = await openApprove();
    await user.click(within(dialog).getByRole("button", { name: "確定核准" }));
    const result = await screen.findByRole("dialog");
    expect(result).toHaveTextContent("邀請信寄送失敗，改用臨時密碼");
    expect(result).toHaveTextContent("TempPass-123");
  });

  it("函式回錯誤時顯示錯誤訊息", async () => {
    respond(409, { code: "ACCOUNT_ALREADY_LINKED", message: "這個 Email 的帳號已經綁定其他供應商" });
    const { user, dialog } = await openApprove();
    await user.click(within(dialog).getByRole("button", { name: "確定核准" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "核准失敗", description: "這個 Email 的帳號已經綁定其他供應商" })),
    );
  });
});

describe("AdminApplicationsPage:退件", () => {
  it("「給申請者的說明」與內部備註分開送給 approve-supplier(action=reject)", async () => {
    respond(200, { data: { status: "rejected", notified: true, mail_error: null } });
    render(<AdminApplicationsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "拒絕" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("內部備註不會寄出");

    await user.type(within(dialog).getByLabelText(/給申請者的說明/), "目前服務區域尚未開放");
    await user.type(within(dialog).getByLabelText(/內部備註/), "上次合作欠款");
    await user.click(within(dialog).getByRole("button", { name: "確定拒絕" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      action: "reject",
      application_id: PENDING.id,
      admin_notes: "上次合作欠款",
      applicant_message: "目前服務區域尚未開放",
    });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已拒絕", description: expect.stringContaining("已寄出通知信") })),
    );
  });

  it("退件成功但信沒寄出:明講沒寄出", async () => {
    respond(200, { data: { status: "rejected", notified: false, mail_error: "Resend 500" } });
    render(<AdminApplicationsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "拒絕" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "確定拒絕" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已拒絕，但通知信沒有寄出" })),
    );
    expect(sentBody()).toMatchObject({ action: "reject", admin_notes: null, applicant_message: null });
  });
});
