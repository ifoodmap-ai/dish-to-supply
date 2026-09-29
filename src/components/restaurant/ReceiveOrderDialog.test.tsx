// 收貨對話框(F7):確認收貨 / 回報異常改成一支 RPC(restaurant_receive_order)一次交易完成,
// 前端不再分三次寫送貨單、出貨紀錄、事件。驗證:①送出的參數 ②不直接寫任何表 ③後到的人(畫面過期)
// 照實顯示錯誤、關掉對話框並讓外層重抓 ④回報異常要有差異或說明。

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiveOrderDialog from "./ReceiveOrderDialog";

const { callOrderRpc, fromSpy, toastSuccess, toastError } = vi.hoisted(() => ({
  callOrderRpc: vi.fn(),
  fromSpy: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => { fromSpy(t); throw new Error(`不應該直接查 ${t}`); } },
}));
vi.mock("@/lib/orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orders")>("@/lib/orders");
  return { ...actual, callOrderRpc };
});
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, warning: vi.fn() } }));

const ORDER = {
  id: "aaaaaaaa-0000-4000-8000-0000000000r1",
  status: "delivered" as const,
  supplier_id: "sup-1",
  supplier_name: "鮮綠農產",
  ingredient_list: [
    { name: "高麗菜", quantity: 10, unit: "顆" },
    { name: "青江菜", quantity: 5, unit: "kg" },
  ],
};

const renderDialog = (mode: "receive" | "report" = "receive") => {
  const onOpenChange = vi.fn();
  const onDone = vi.fn();
  render(<ReceiveOrderDialog open order={ORDER} mode={mode} onOpenChange={onOpenChange} onDone={onDone} />);
  return { onOpenChange, onDone };
};

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  callOrderRpc.mockReset();
  callOrderRpc.mockResolvedValue({ event_id: "ev-1" });
  fromSpy.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  fetchGuard = vi.fn(() => Promise.reject(new Error("測試不准打網路")));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
  expect(fromSpy).not.toHaveBeenCalled();
});

describe("ReceiveOrderDialog — 一次交易完成", () => {
  it("確認收貨:只呼叫 restaurant_receive_order(沒有差異、沒有照片)", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onDone } = renderDialog("receive");
    await user.click(screen.getByRole("button", { name: "確認已收到貨" }));

    await waitFor(() => expect(callOrderRpc).toHaveBeenCalledTimes(1));
    expect(callOrderRpc).toHaveBeenCalledWith("restaurant_receive_order", {
      p_order_id: ORDER.id,
      p_from_status: "delivered",
      p_has_discrepancy: false,
      p_note: null,
      p_image_url: null,
      p_discrepancies: [],
      p_items_total: 2,
    });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccess).toHaveBeenCalledWith("已確認收貨", expect.anything());
  });

  it("回報異常:要寫說明才送得出去,送出時有差異旗標與說明", async () => {
    const user = userEvent.setup();
    renderDialog("report");
    const submit = screen.getByRole("button", { name: "送出異常回報" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/請描述異常狀況/), "少兩顆");
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(callOrderRpc).toHaveBeenCalledTimes(1));
    const [fn, args] = callOrderRpc.mock.calls[0];
    expect(fn).toBe("restaurant_receive_order");
    expect(args).toMatchObject({ p_order_id: ORDER.id, p_from_status: "delivered", p_has_discrepancy: true, p_note: "少兩顆" });
  });

  it("後到的人(畫面過期):照實顯示錯誤,關掉對話框並讓外層重抓", async () => {
    const user = userEvent.setup();
    const { OrderEventError } = await vi.importActual<typeof import("@/lib/orders")>("@/lib/orders");
    callOrderRpc.mockRejectedValueOnce(
      new OrderEventError("這張訂單的狀態已經變成「收貨有差異」,畫面上的資料過期了,請重新整理後再操作", "P0001", "stale_order_status"),
    );
    const { onOpenChange, onDone } = renderDialog("receive");
    await user.click(screen.getByRole("button", { name: "確認已收到貨" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][1].description).toContain("畫面上的資料過期了");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("其他錯誤(例如權限):照實顯示,對話框留著讓人重試", async () => {
    const user = userEvent.setup();
    const { OrderEventError } = await vi.importActual<typeof import("@/lib/orders")>("@/lib/orders");
    callOrderRpc.mockRejectedValueOnce(
      new OrderEventError("你不是這家餐廳的成員(或邀請還沒接受),不能操作這張訂單", "42501", "actor_role_mismatch"),
    );
    const { onOpenChange, onDone } = renderDialog("receive");
    await user.click(screen.getByRole("button", { name: "確認已收到貨" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][1].description).toContain("你不是這家餐廳的成員");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onDone).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "確認已收到貨" })).toBeEnabled();
  });
});
