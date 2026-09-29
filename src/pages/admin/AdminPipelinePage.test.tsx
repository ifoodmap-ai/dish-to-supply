// 管理員「訂單 › 看板」的派單入口(後台精簡 Q2-A)。驗證:①待派發(含舊資料 pending)的卡片有「派給…」、
// 被拒/逾時的卡片有「改派給…」,其他階段沒有 ②被拒的單(order_pipeline 不含)另外查出來放在異常欄,
// 不算進上面的數字 ③從卡片一鍵派單:只寫一筆 recordOrderEvent,成功後看板重抓 ④訂單編號用統一格式。

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './testFakeSupabase';
import AdminPipelinePage from './AdminPipelinePage';

const { matchSuppliers, recordOrderEvent } = vi.hoisted(() => ({
  matchSuppliers: vi.fn(),
  recordOrderEvent: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('./testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('@/lib/api', () => ({ matchSuppliers }));
vi.mock('@/lib/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders');
  return { ...actual, recordOrderEvent };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const now = new Date().toISOString();
const row = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  restaurant_id: 'rest-1',
  supplier_id: null,
  total_amount: null,
  current_stage_since: now,
  created_at: now,
  ...extra,
});

const PIPELINE = [
  row('order-submitted-0000000000s1', 'submitted'),
  row('order-pending-00000000000p1', 'pending', { supplier_id: 'sup-a' }),
  row('order-dispatched-0000000d1', 'dispatched', { supplier_id: 'sup-a' }),
  row('order-expired-000000000e1', 'expired', { supplier_id: 'sup-a' }),
];
const REJECTED = [row('order-rejected-00000000r1', 'rejected', { supplier_id: 'sup-a', total_amount: 999 })];

const serve = () =>
  fakeSupabase.respond((q) => {
    if (q.table === 'order_pipeline') return { data: PIPELINE };
    if (q.table === 'supplier_orders') {
      if (q.single) return { data: { ingredient_list: [{ name: '高麗菜' }] } };
      const wantsRejected = q.filters.some((f) => f.op === 'eq' && f.column === 'status' && f.value === 'rejected');
      return { data: wantsRejected ? REJECTED : [] };
    }
    if (q.table === 'restaurants') return { data: [{ id: 'rest-1', name: '好味小館' }] };
    if (q.table === 'suppliers') return { data: [{ id: 'sup-a', name: '鮮綠農產', service_areas: [] }] };
    return undefined;
  });

const renderBoard = () =>
  render(
    <MemoryRouter initialEntries={['/admin/pipeline']}>
      <AdminPipelinePage />
    </MemoryRouter>,
  );

const cardOf = (id: string) => screen.getByTestId(`pipeline-card-${id}`);

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeSupabase.reset();
  serve();
  matchSuppliers.mockReset();
  matchSuppliers.mockResolvedValue({
    requested: ['高麗菜'],
    suppliers: [{ supplier: { id: 'sup-a', name: '鮮綠農產', description: null, service_areas: [] }, score: 92, matchedCount: 1, items: [] }],
  });
  recordOrderEvent.mockReset();
  recordOrderEvent.mockResolvedValue({});
  fetchGuard = vi.fn(() => Promise.reject(new Error('測試不准打網路')));
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
  // 看板與派單都不直接寫任何表(派單只經由 recordOrderEvent)
  expect(fakeSupabase.writes()).toEqual([]);
});

describe('看板上的派單入口', () => {
  it('待派發(含舊資料 pending)有「派給…」,被拒/逾時有「改派給…」,待接單沒有', async () => {
    renderBoard();
    await screen.findByTestId('pipeline-card-order-submitted-0000000000s1');
    expect(within(cardOf('order-submitted-0000000000s1')).getByRole('button', { name: '派給…' })).toBeInTheDocument();
    expect(within(cardOf('order-pending-00000000000p1')).getByRole('button', { name: '派給…' })).toBeInTheDocument();
    expect(within(cardOf('order-expired-000000000e1')).getByRole('button', { name: '改派給…' })).toBeInTheDocument();
    expect(within(cardOf('order-rejected-00000000r1')).getByRole('button', { name: '改派給…' })).toBeInTheDocument();
    expect(within(cardOf('order-dispatched-0000000d1')).queryByRole('button', { name: /派給/ })).toBeNull();
  });

  it('被拒的單另外查、放在異常欄,但不算進「進行中訂單」', async () => {
    renderBoard();
    await screen.findByTestId('pipeline-card-order-rejected-00000000r1');
    const rejectedQuery = fakeSupabase
      .queriesOf('supplier_orders')
      .find((q) => q.filters.some((f) => f.column === 'status' && f.value === 'rejected'));
    expect(rejectedQuery).toBeTruthy();
    const kpi = screen.getByText('進行中訂單').parentElement!;
    expect(within(kpi).getByText('4')).toBeInTheDocument();
  });

  it('卡片上的訂單編號是 # + 末 8 碼大寫', async () => {
    renderBoard();
    await screen.findByTestId('pipeline-card-order-submitted-0000000000s1');
    expect(within(cardOf('order-submitted-0000000000s1')).getByText('#000000S1')).toBeInTheDocument();
  });

  it('點「派給…」→ 選供應商 → 寫一筆 dispatched 事件,成功後看板重抓', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByTestId('pipeline-card-order-submitted-0000000000s1');
    const before = fakeSupabase.queriesOf('order_pipeline').length;

    await user.click(within(cardOf('order-submitted-0000000000s1')).getByRole('button', { name: '派給…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('派單 #000000S1 — 好味小館')).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: '派給 鮮綠農產' }));

    await waitFor(() => expect(recordOrderEvent).toHaveBeenCalledTimes(1));
    expect(recordOrderEvent.mock.calls[0][0]).toMatchObject({
      orderId: 'order-submitted-0000000000s1',
      fromStatus: 'submitted',
      toStatus: 'dispatched',
      actorRole: 'admin',
      source: 'admin_portal',
      payload: { supplier_id: 'sup-a', match_score: 92 },
    });
    await waitFor(() => expect(fakeSupabase.queriesOf('order_pipeline').length).toBe(before + 1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
