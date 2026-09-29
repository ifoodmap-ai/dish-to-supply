// 管理員「派給…」(後台精簡 Q2-A)。驗證:①候選供應商依「供應商比價」同一套 matchSuppliers() 分數排序,
// 沒上架品項的啟用中供應商排在後面 ②一鍵派單只寫一筆事件、payload 帶 supplier_id ③失敗照實顯示、
// 畫面過期會通知看板重抓 ④被拒的單是「改派」,標出剛拒單的供應商 ⑤不直接寫任何表。

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './testFakeSupabase';
import DispatchOrderDialog, { type DispatchTarget } from './DispatchOrderDialog';
import { OrderEventError } from '@/lib/orders';

const { matchSuppliers, recordOrderEvent, toastSuccess, toastError } = vi.hoisted(() => ({
  matchSuppliers: vi.fn(),
  recordOrderEvent: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('./testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('@/lib/api', () => ({ matchSuppliers }));
vi.mock('@/lib/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders');
  return { ...actual, recordOrderEvent };
});
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

const ORDER: DispatchTarget = {
  id: 'a1e337b0-de8c-4e65-b22a-ca76edcf4143',
  status: 'submitted',
  supplier_id: null,
  restaurantName: '好味小館',
};

const supplierRow = (id: string, name: string) => ({ id, name, service_areas: ['台北市'] });

const RANKED = [
  { supplier: { id: 'sup-b', name: '陽光蔬果批發', description: null, service_areas: ['台北市'] }, score: 95, matchedCount: 2,
    items: [{ ingredient: '高麗菜', name: '高麗菜', price: 30, unit: 'kg', pack_size: null }] },
  { supplier: { id: 'sup-a', name: '鮮綠農產', description: null, service_areas: ['新北市'] }, score: 88, matchedCount: 1,
    items: [{ ingredient: '高麗菜', name: '高麗菜(有機)', price: 45, unit: 'kg', pack_size: null }] },
];

const serve = () =>
  fakeSupabase.respond((q) => {
    if (q.table === 'supplier_orders') {
      return { data: { ingredient_list: [{ name: '高麗菜', quantity: 10 }, { name: '青江菜', quantity: 5 }] } };
    }
    if (q.table === 'suppliers') {
      return { data: [supplierRow('sup-a', '鮮綠農產'), supplierRow('sup-b', '陽光蔬果批發'), supplierRow('sup-c', '頂鮮肉品行')] };
    }
    return undefined;
  });

const renderDialog = (order: DispatchTarget | null = ORDER) => {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(<DispatchOrderDialog order={order} onClose={onClose} onChanged={onChanged} />);
  return { onClose, onChanged };
};

const candidateIds = () =>
  screen.getAllByTestId(/^candidate-/).map((el) => el.getAttribute('data-testid')!.replace('candidate-', ''));

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeSupabase.reset();
  serve();
  matchSuppliers.mockReset();
  matchSuppliers.mockResolvedValue({ requested: ['高麗菜', '青江菜'], suppliers: RANKED });
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

describe('候選供應商', () => {
  it('用訂單品項呼叫 matchSuppliers(),依分數排序;沒上架這些品項的啟用中供應商排最後', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    expect(matchSuppliers).toHaveBeenCalledWith(['高麗菜', '青江菜']);
    expect(candidateIds()).toEqual(['sup-b', 'sup-a', 'sup-c']);

    const first = screen.getByTestId('candidate-sup-b');
    expect(within(first).getByText('比價分數 95')).toBeInTheDocument();
    expect(within(first).getByText('推薦')).toBeInTheDocument();
    expect(within(first).getByText(/上架 2\/2 項/)).toBeInTheDocument();
    expect(within(screen.getByTestId('candidate-sup-c')).getByText('沒有上架這些品項')).toBeInTheDocument();
    // 只列啟用中的供應商
    const supplierQuery = fakeSupabase.queriesOf('suppliers')[0];
    expect(supplierQuery.filters).toContainEqual({ op: 'eq', column: 'is_active', value: true });
  });

  it('標題有統一格式的訂單編號與餐廳名稱', async () => {
    renderDialog();
    expect(await screen.findByText('派單 #EDCF4143 — 好味小館')).toBeInTheDocument();
  });

  it('比價算不出來(matchSuppliers 失敗)時照名稱列出所有啟用中的供應商,還是可以派', async () => {
    matchSuppliers.mockRejectedValueOnce(new Error('網路斷了'));
    renderDialog();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    expect(screen.getByText(/比價分數算不出來\(網路斷了\)/)).toBeInTheDocument();
  });
});

describe('一鍵派單', () => {
  it('只寫一筆事件:submitted → dispatched,payload 帶 supplier_id 與比價分數', async () => {
    const user = userEvent.setup();
    const { onClose, onChanged } = renderDialog();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '派給 陽光蔬果批發' }));

    await waitFor(() => expect(recordOrderEvent).toHaveBeenCalledTimes(1));
    expect(recordOrderEvent).toHaveBeenCalledWith({
      orderId: ORDER.id,
      fromStatus: 'submitted',
      toStatus: 'dispatched',
      actorRole: 'admin',
      source: 'admin_portal',
      note: '派給 陽光蔬果批發(比價分數 95)',
      payload: { supplier_id: 'sup-b', match_score: 95, matched_count: 2, requested_count: 2 },
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccess.mock.calls[0][0]).toBe('訂單 #EDCF4143 已派給 陽光蔬果批發');
  });

  it('派給沒有分數的供應商也可以(payload 分數是 null)', async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '派給 頂鮮肉品行' }));
    await waitFor(() => expect(recordOrderEvent).toHaveBeenCalledTimes(1));
    expect(recordOrderEvent.mock.calls[0][0]).toMatchObject({
      note: '派給 頂鮮肉品行',
      payload: { supplier_id: 'sup-c', match_score: null, matched_count: 0 },
    });
  });

  it('資料庫擋下:訊息原樣顯示,對話框不關', async () => {
    const user = userEvent.setup();
    recordOrderEvent.mockRejectedValueOnce(
      new OrderEventError('平台管理員不能把訂單從「已結案」改成「待接單」', '42501', 'transition_not_allowed'),
    );
    const { onClose, onChanged } = renderDialog();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '派給 鮮綠農產' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('平台管理員不能把訂單從「已結案」改成「待接單」');
    expect(toastError).toHaveBeenCalledWith('派單失敗', { description: '平台管理員不能把訂單從「已結案」改成「待接單」' });
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('畫面過期(別人剛派過):顯示訊息並通知看板重抓', async () => {
    const user = userEvent.setup();
    recordOrderEvent.mockRejectedValueOnce(
      new OrderEventError('這張訂單的狀態已經變成「待接單」,畫面上的資料過期了,請重新整理後再操作', 'P0001', 'stale_order_status'),
    );
    const { onChanged, onClose } = renderDialog();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '派給 鮮綠農產' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('畫面上的資料過期了');
  });
});

describe('被拒的單改派', () => {
  it('標題是「改派」,標出剛拒絕的供應商', async () => {
    renderDialog({ ...ORDER, status: 'rejected', supplier_id: 'sup-a' });
    expect(await screen.findByText('改派 #EDCF4143 — 好味小館')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    expect(within(screen.getByTestId('candidate-sup-a')).getByText('剛拒絕這張單')).toBeInTheDocument();
    // 供應商自己拒的單不用提醒聯絡原供應商
    expect(screen.queryByTestId('redispatch-expired-warning')).toBeNull();
  });

  it('逾時交回的單改派:標出上次沒回應的供應商,並提醒先聯絡原供應商確認不要出貨', async () => {
    renderDialog({ ...ORDER, status: 'expired', supplier_id: 'sup-b' });
    expect(await screen.findByText('改派 #EDCF4143 — 好味小館')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId(/^candidate-/)).toHaveLength(3));
    expect(within(screen.getByTestId('candidate-sup-b')).getByText('上次沒有回應')).toBeInTheDocument();
    expect(screen.getByTestId('redispatch-expired-warning')).toHaveTextContent('請先聯絡原供應商確認不要出貨');
  });
});
