import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  accountRows: [] as unknown[],
  filters: [] as string[],
  session: null as unknown,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "zh", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => {
      h.filters.push(`${col}=eq.${String(v)}`);
      return chain;
    },
    not: (col: string, op: string, v: unknown) => {
      h.filters.push(`${col}=not.${op}.${String(v)}`);
      return chain;
    },
    limit: () => Promise.resolve({ data: h.accountRows }),
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: h.session } }) },
      from: () => chain,
      rpc: h.rpc,
    },
  };
});

import RegisterCompletePage from "./RegisterCompletePage";

const sessionWith = (meta: Record<string, unknown>) => ({
  user: { id: "u-victim", email: "victim@example.com", user_metadata: meta },
});

const PENDING_INVITE_ROW = {
  invite_id: "inv-evil",
  restaurant_name: "搶先邀請的店",
  role: "owner",
  branch_name: null,
  invited_at: "2026-09-28T07:00:00Z",
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h.navigate.mockReset();
  h.rpc.mockReset();
  h.accountRows = [];
  h.filters = [];
  h.session = sessionWith({ pending_restaurant_name: "我的新店", pending_contact_name: "王小明", pending_contact_phone: "0912345678" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <RegisterCompletePage />
    </MemoryRouter>,
  );

describe("RegisterCompletePage —— 待接受的邀請不會搶走註冊", () => {
  it("只有待接受的邀請列(accepted_at = null)→ 不當成已有餐廳,照樣建立自己的店", async () => {
    // 伺服器端已經篩掉,這裡模擬「萬一還是回來了」
    h.accountRows = [{ id: "acc-evil", accepted_at: null }];
    h.rpc.mockResolvedValue({ data: "rest-own", error: null });
    renderPage();

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("create_restaurant_onboarding", {
        p_name: "我的新店",
        p_contact_name: "王小明",
        p_contact_phone: "0912345678",
      }),
    );
    expect(h.filters).toEqual(["user_id=eq.u-victim", "is_active=eq.true", "accepted_at=not.is.null"]);
    expect(await screen.findByText("註冊完成")).toBeInTheDocument();
  });

  it("已經有「已接受」的餐廳身分 → 直接進後台,不重建", async () => {
    h.accountRows = [{ id: "acc-mine", accepted_at: "2026-09-01T00:00:00Z" }];
    renderPage();
    expect(await screen.findByText("註冊完成")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.navigate).toHaveBeenCalledWith("/restaurant", { replace: true });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("沒有註冊暫存資料(帳號先被邀請過,GoTrue 不更新 metadata)但有待接受邀請 → 回登入首頁去接受/拒絕", async () => {
    h.session = sessionWith({ display_name: "受害者" });
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "my_pending_restaurant_invites" ? { data: [PENDING_INVITE_ROW], error: null } : { data: null, error: { message: "unexpected" } },
    );
    renderPage();

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(h.rpc).not.toHaveBeenCalledWith("create_restaurant_onboarding", expect.anything());
    expect(h.navigate).not.toHaveBeenCalledWith("/restaurant", expect.anything());
  });

  it("沒有暫存資料、也沒有邀請 → 維持原本的「回註冊頁補資料」", async () => {
    h.session = sessionWith({});
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderPage();
    expect(await screen.findByText("還差一步")).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
