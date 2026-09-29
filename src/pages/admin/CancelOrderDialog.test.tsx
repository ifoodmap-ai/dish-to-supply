// 管理員「取消訂單」(業主拍板 F5)。驗證:①一定要填原因 ②只寫一筆 recordOrderEvent(→ cancelled,原因在 note)
// ③失敗照實顯示、對話框不關 ④畫面過期通知上層重抓 ⑤不直接寫任何表 ⑥單筆訂單頁在可取消的狀態才出現按鈕。

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './testFakeSupabase';
import CancelOrderDialog from './CancelOrderDialog';
import AdminOrderTimelinePage from './AdminOrderTimelinePage';
import { OrderEventError } from '@/lib/orders';

const { recordOrderEvent, toastSuccess, toastError } = vi.hoisted(() => ({
  recordOrderEvent: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('./testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('@/lib/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders');
  return { ...actual, recordOrderEvent, fetchOrderTimeline: vi.fn(async () => []) };
});
vi.mock('@/lib/api', () => ({ matchSuppliers: vi.fn(async () => ({ requested: [], suppliers: [] })) }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

const ORDER = { id: 'a1e337b0-de8c-4e65-b22a-ca76edcf4143', status: 'confirmed' as const };

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeSupabase.reset();
  recordOrderEvent.mockReset();
  recordOrderEvent.mockResolvedValue({});
  toastSuccess.mockReset();
  toastError.mockReset();
  fetchGuard = vi.fn(() => Promise.reject(new Error('測試不准打網路')));
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
  expect(fakeSupabase.writes()).toEqual([]);
});

const renderDialog = () => {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(<CancelOrderDialog order={ORDER} onClose={onClose} onChanged={onChanged} />);
  return { onClose, onChanged };
};

describe('CancelOrderDialog', () => {
  it('標題有統一格式的編號與目前狀態;沒填原因不能送出', async () => {
    renderDialog();
    expect(screen.getByText('取消訂單 #EDCF4143')).toBeInTheDocument();
    expect(screen.getByText(/目前是「待出貨」/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確定取消訂單' })).toBeDisabled();
  });

  it.each([
    ['confirmed', null],
    ['shipped', null],
    ['in_transit', null],
    ['expired', 'sup-1'],
  ] as const)('%s(供應商 %s):提醒另外打電話給供應商', (status, supplier_id) => {
    render(<CancelOrderDialog order={{ id: ORDER.id, status, supplier_id }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByTestId('cancel-call-supplier')).toHaveTextContent('請另外打電話給供應商');
  });

  it.each([
    ['dispatched', 'sup-1'],
    ['accepted', 'sup-1'],
    ['quoted', 'sup-1'],
    ['submitted', null],
    ['expired', null],
  ] as const)('%s(供應商 %s):還沒開始備貨,不提醒', (status, supplier_id) => {
    render(<CancelOrderDialog order={{ id: ORDER.id, status, supplier_id }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByTestId('cancel-call-supplier')).toBeNull();
  });

  it('說明與成功訊息都不宣稱已經寄信/通知(正式寄信開放前只寄內部測試信箱)', async () => {
    const user = userEvent.setup();
    render(<CancelOrderDialog order={{ id: ORDER.id, status: 'in_transit' }} onClose={vi.fn()} onChanged={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).not.toMatch(/寄給|已通知/);
    await user.type(screen.getByLabelText('取消原因(必填)'), '餐廳臨時停業');
    await user.click(screen.getByRole('button', { name: '確定取消訂單' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(toastSuccess.mock.calls[0])).not.toMatch(/寄給|已通知/);
  });

  it('只寫一筆事件:→ cancelled,原因寫在 note', async () => {
    const user = userEvent.setup();
    const { onClose, onChanged } = renderDialog();
    await user.type(screen.getByLabelText('取消原因(必填)'), '供應商兩天沒回應');
    await user.click(screen.getByRole('button', { name: '確定取消訂單' }));

    await waitFor(() => expect(recordOrderEvent).toHaveBeenCalledTimes(1));
    expect(recordOrderEvent).toHaveBeenCalledWith({
      orderId: ORDER.id,
      fromStatus: 'confirmed',
      toStatus: 'cancelled',
      actorRole: 'admin',
      source: 'admin_portal',
      note: '供應商兩天沒回應',
      payload: { reason: '供應商兩天沒回應' },
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccess.mock.calls[0][0]).toBe('訂單 #EDCF4143 已取消');
  });

  it('資料庫擋下:訊息原樣顯示,對話框不關', async () => {
    const user = userEvent.setup();
    recordOrderEvent.mockRejectedValueOnce(new OrderEventError('取消進行中的訂單要填寫原因', '22023', 'cancel_reason_required'));
    const { onClose, onChanged } = renderDialog();
    await user.type(screen.getByLabelText('取消原因(必填)'), 'x');
    await user.click(screen.getByRole('button', { name: '確定取消訂單' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('取消進行中的訂單要填寫原因');
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('畫面過期:顯示訊息並通知上層重抓', async () => {
    const user = userEvent.setup();
    recordOrderEvent.mockRejectedValueOnce(
      new OrderEventError('這張訂單的狀態已經變成「已出貨」,畫面上的資料過期了,請重新整理後再操作', 'P0001', 'stale_order_status'),
    );
    const { onChanged } = renderDialog();
    await user.type(screen.getByLabelText('取消原因(必填)'), '缺貨');
    await user.click(screen.getByRole('button', { name: '確定取消訂單' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('alert')).toHaveTextContent('畫面上的資料過期了');
  });
});

describe('單筆訂單頁的「取消訂單…」按鈕', () => {
  const orderRow = (status: string) => ({
    id: ORDER.id, created_at: '2026-09-20T02:00:00.000Z', updated_at: null, status, notes: null, sent_at: null,
    supplier_id: 'sup-1', restaurant_id: 'rest-1', branch_id: null, analysis_id: null, total_amount: 1200,
    current_stage_since: new Date().toISOString(), approved_at: null, ingredient_list: [],
  });
  const renderAt = (status: string) => {
    fakeSupabase.respond((q) => (q.table === 'supplier_orders' ? { data: [orderRow(status)] } : { data: [] }));
    render(
      <MemoryRouter initialEntries={[`/admin/orders/${ORDER.id}`]}>
        <Routes>
          <Route path="/admin/orders/:id" element={<AdminOrderTimelinePage />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it.each(['dispatched', 'accepted', 'quoted', 'confirmed', 'shipped', 'in_transit', 'submitted', 'expired'])(
    '%s:有「取消訂單…」',
    async (status) => {
      renderAt(status);
      await screen.findByRole('heading', { name: '訂單履歷' });
      expect(screen.getByRole('button', { name: '取消訂單…' })).toBeInTheDocument();
    },
  );

  it.each(['delivered', 'received', 'reviewed', 'closed', 'cancelled'])('%s:沒有「取消訂單…」', async (status) => {
    renderAt(status);
    await screen.findByRole('heading', { name: '訂單履歷' });
    expect(screen.queryByRole('button', { name: '取消訂單…' })).toBeNull();
  });

  it('按下去開對話框,送出只寫一筆事件', async () => {
    const user = userEvent.setup();
    renderAt('shipped');
    await user.click(await screen.findByRole('button', { name: '取消訂單…' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('取消原因(必填)'), '貨車出事,餐廳改訂');
    await user.click(within(dialog).getByRole('button', { name: '確定取消訂單' }));
    await waitFor(() => expect(recordOrderEvent).toHaveBeenCalledTimes(1));
    expect(recordOrderEvent.mock.calls[0][0]).toMatchObject({ fromStatus: 'shipped', toStatus: 'cancelled', note: '貨車出事,餐廳改訂' });
  });

  it('逾時的單(已經派給供應商):對話框提醒打電話 —— 頁面有把供應商帶給對話框', async () => {
    const user = userEvent.setup();
    renderAt('expired');
    await user.click(await screen.findByRole('button', { name: '取消訂單…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('cancel-call-supplier')).toHaveTextContent('請另外打電話給供應商');
  });
});
