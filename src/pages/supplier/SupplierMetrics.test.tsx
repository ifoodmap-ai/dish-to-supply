// 供應商後台的「本月成交額」與「客戶管理」改用 src/lib/metrics.ts 的共用定義(業主拍板 Q5-A)。
//   - 營運總覽:成交 = 餐廳確認收貨之後,算在第一次進入成交狀態的那一天(舊算法從「餐廳確認報價」就算);
//     已結案的單要收過貨才算(業主 2026-09-29 決定:爭議直接結案不算)
//   - 客戶管理:這是「訂單金額」(不含草稿、取消、拒單、逾時),標籤不再叫「累計成交金額」
// 每頁都餵「狀態矩陣」(每種狀態一張單、金額是 2 的次方),驗:①數字 = metrics.ts 對同一份資料的結果
// ②頁面真的呼叫了 metrics.ts(函式包成 spy)。預期值在 describe 層先算好,it() 裡的呼叫都是頁面發出的。

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '@/pages/admin/testFakeSupabase';
import SupplierDashboard from './SupplierDashboard';
import SupplierCustomersPage from './SupplierCustomersPage';
import * as metrics from '@/lib/metrics';
import type { OrderStatus } from '@/lib/orders';
import { orderIdFor, orderMatrix, sumFor, usd } from '@/test/orderMatrix';

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('@/pages/admin/testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('@/lib/metrics', async (importOriginal) =>
  (await import('@/test/metricsSpy')).spyOnMetrics(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const NOW = new Date(2026, 8, 15, 12, 0, 0); // 本地 2026-09-15 中午
const localIso = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

const cellOf = (label: string) => screen.getByText(label).parentElement as HTMLElement;

let fetchGuard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeSupabase.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  fetchGuard = vi.fn(() => Promise.reject(new Error('測試不准打網路')));
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(fetchGuard).not.toHaveBeenCalled();
  expect(fakeSupabase.writes()).toEqual([]);
});

/** 舊算法的「成交」:從餐廳確認報價(confirmed)之後都算 */
const OLD_DEAL: OrderStatus[] = ['confirmed', 'shipped', 'in_transit', 'delivered', 'received', 'reviewed', 'closed', 'completed'];

const respondWith = (tables: Record<string, unknown>) =>
  fakeSupabase.respond((q) => {
    if (q.table === 'supplier_accounts') return { data: { supplier_id: 'sup-1' } };
    if (q.table === 'supplier_leads') return { count: 0 };
    return { data: tables[q.table] ?? [] };
  });

/* ------------------------------------------------------------------ */
describe('供應商 › 營運總覽(SupplierDashboard):本月成交額', () => {
  const ORDERS = orderMatrix(() => ({
    restaurant_id: 'rest-1',
    created_at: localIso(2026, 9, 1),
    current_stage_since: localIso(2026, 9, 10),
  }));
  // 每張走過 confirmed 的單都有一筆 9/03 的 confirmed 事件;成交單另有 9/10 的 received 事件
  const GMV_CANDIDATES: OrderStatus[] = ['received', 'reviewed', 'closed', 'completed'];
  const EVENTS = [
    ...OLD_DEAL.map((s) => ({ order_id: orderIdFor(s), to_status: 'confirmed', created_at: localIso(2026, 9, 3) })),
    ...GMV_CANDIDATES.map((s) => ({ order_id: orderIdFor(s), to_status: 'received', created_at: localIso(2026, 9, 10) })),
  ];
  const LEDGER = metrics.dealLedger(EVENTS);
  const EXPECTED = usd(metrics.sumGmv(ORDERS, LEDGER));
  const DEALS = metrics.countDeals(ORDERS, LEDGER);
  const OLD = usd(sumFor(OLD_DEAL));
  // 爭議直接結案版本:closed 那張沒有收貨事件(只有 confirmed / disputed / closed)
  const DISPUTE_EVENTS = [
    ...EVENTS.filter((e) => !(e.order_id === orderIdFor('closed') && e.to_status === 'received')),
    { order_id: orderIdFor('closed'), to_status: 'disputed', created_at: localIso(2026, 9, 10) },
    { order_id: orderIdFor('closed'), to_status: 'closed', created_at: localIso(2026, 9, 12) },
  ];
  const EXPECTED_DISPUTE = usd(metrics.sumGmv(ORDERS, metrics.dealLedger(DISPUTE_EVENTS)));

  it('只算餐廳確認收貨的單(confirmed / 出貨 / 待收貨都不算)', async () => {
    respondWith({ supplier_orders: ORDERS, order_events: EVENTS, restaurants: [{ id: 'rest-1', name: '好味小館' }] });
    render(<MemoryRouter><SupplierDashboard /></MemoryRouter>);

    await waitFor(() => expect(within(cellOf('本月成交額')).getByText(EXPECTED)).toBeInTheDocument());
    expect(cellOf('本月成交額')).toHaveTextContent(`本月成交 ${DEALS} 單`);
    // 舊算法的數字(confirmed 之後都算)不見了
    expect(screen.queryByText(OLD)).toBeNull();
    // 近 30 天趨勢的合計也是同一個數字
    expect(screen.getByText('近 30 天成交趨勢').parentElement).toHaveTextContent(`合計 ${EXPECTED}`);
    expect(metrics.isDeal).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' }),
      expect.objectContaining({ received: expect.any(Set) }),
    );
    expect(metrics.dealLedger).toHaveBeenCalledWith(EVENTS);
    // 流失預警 / 合作餐廳數也用共用的訂單定義
    expect(metrics.isCountedOrder).toHaveBeenCalledWith('draft');
    expect(cellOf('流失預警客戶')).toHaveTextContent('合作餐廳共 1 家');
  });

  it('事件超過 1,000 筆:分頁讀完,排在後面的收貨事件也算得到', async () => {
    // 1,500 筆別張單的事件排前面,這家店的事件放最後:不分頁讀完,已結案那張就會被漏算
    const filler = Array.from({ length: 1500 }, (_, i) => ({
      order_id: `filler-${i}`, to_status: 'confirmed', created_at: localIso(2026, 9, 1),
    }));
    respondWith({ supplier_orders: ORDERS, order_events: [...filler, ...EVENTS], restaurants: [{ id: 'rest-1', name: '好味小館' }] });
    render(<MemoryRouter><SupplierDashboard /></MemoryRouter>);

    await waitFor(() => expect(within(cellOf('本月成交額')).getByText(EXPECTED)).toBeInTheDocument());
    // 翻頁要固定排序:created_at 再加 id(正式庫就有同一秒的事件,少了 id 頁界可能重複或漏掉)
    const reads = fakeSupabase.queriesOf('order_events');
    expect(reads.length).toBeGreaterThanOrEqual(2);
    reads.forEach((q) => {
      expect(q.filters.some((f) => f.op === 'range')).toBe(true);
      expect(q.filters.filter((f) => f.op === 'order').map((f) => [f.column, f.value])).toEqual([
        ['created_at', { ascending: true }],
        ['id', { ascending: true }],
      ]);
    });
  });

  it.each([
    ['一開始就失敗', false],
    ['讀到第二頁才失敗(不能拿半套)', true],
  ] as const)('事件讀取失敗(%s):已結案的單不算成交額,並提示', async (_label, failLater) => {
    // 讀到第二頁才失敗:第一頁裡有已結案那張的收貨事件 —— 拿半套資料的話它會被算進去,那就錯了
    const filler = Array.from({ length: 1500 }, (_, i) => ({
      order_id: `filler-${i}`, to_status: 'confirmed', created_at: localIso(2026, 9, 1),
    }));
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_accounts') return { data: { supplier_id: 'sup-1' } };
      if (q.table === 'supplier_leads') return { count: 0 };
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') {
        const range = q.filters.find((f) => f.op === 'range')?.value as [number, number] | undefined;
        if (!failLater || (range && range[0] >= 1000)) return { error: { message: '模擬:事件讀取失敗' } };
        return { data: [...EVENTS, ...filler] };
      }
      return { data: [] };
    });
    render(<MemoryRouter><SupplierDashboard /></MemoryRouter>);

    // 沒有事件 → 已結案不算;其餘成交單改用建立時間(9/01,本月)
    await waitFor(() => expect(within(cellOf('本月成交額')).getByText(EXPECTED_DISPUTE)).toBeInTheDocument());
    expect(screen.getByText(/已結案的單無法確認收過貨、暫不計入成交額/)).toBeInTheDocument();
  });

  it('爭議直接結案(沒收過貨)的已結案單不算成交額', async () => {
    respondWith({ supplier_orders: ORDERS, order_events: DISPUTE_EVENTS, restaurants: [{ id: 'rest-1', name: '好味小館' }] });
    render(<MemoryRouter><SupplierDashboard /></MemoryRouter>);

    await waitFor(() => expect(within(cellOf('本月成交額')).getByText(EXPECTED_DISPUTE)).toBeInTheDocument());
    expect(EXPECTED_DISPUTE).toBe(usd(sumFor(['received', 'reviewed', 'completed'])));
    expect(cellOf('本月成交額')).toHaveTextContent('本月成交 3 單');
  });

  // 上個月確認報價、本月才收貨 → 本月(舊算法看確認報價的時間,會算到上個月)
  // 上個月就收貨 → 不算本月;舊資料沒有事件 → 用建立時間
  const TIMING_ORDERS = [
    { id: 'late', status: 'received', total_amount: 1000, restaurant_id: 'rest-1', created_at: localIso(2026, 8, 25), current_stage_since: localIso(2026, 9, 2) },
    { id: 'early', status: 'reviewed', total_amount: 5000, restaurant_id: 'rest-1', created_at: localIso(2026, 8, 5), current_stage_since: localIso(2026, 8, 12) },
    { id: 'legacy', status: 'completed', total_amount: 300, restaurant_id: 'rest-1', created_at: localIso(2026, 9, 4), current_stage_since: localIso(2026, 9, 4) },
  ];
  const TIMING_EVENTS = [
    { order_id: 'late', to_status: 'confirmed', created_at: localIso(2026, 8, 28) },
    { order_id: 'late', to_status: 'received', created_at: localIso(2026, 9, 2) },
    { order_id: 'early', to_status: 'confirmed', created_at: localIso(2026, 8, 6) },
    { order_id: 'early', to_status: 'received', created_at: localIso(2026, 8, 10) },
    { order_id: 'early', to_status: 'reviewed', created_at: localIso(2026, 8, 12) },
  ];

  it('成交算在確認收貨的那天,不是確認報價的那天', async () => {
    respondWith({ supplier_orders: TIMING_ORDERS, order_events: TIMING_EVENTS });
    render(<MemoryRouter><SupplierDashboard /></MemoryRouter>);

    // 新:late 1000 + legacy 300;舊算法只有 legacy 300(late 的確認報價在 8/28)
    await waitFor(() => expect(within(cellOf('本月成交額')).getByText(usd(1300))).toBeInTheDocument());
    expect(cellOf('本月成交額')).toHaveTextContent('本月成交 2 單');
    expect(metrics.dealRecognizedAt).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
describe('供應商 › 客戶管理(SupplierCustomersPage):累計訂單金額', () => {
  const ORDERS = orderMatrix(() => ({ restaurant_id: 'rest-1', created_at: localIso(2026, 9, 1) }));
  const TOTAL = usd(metrics.sumOrderAmount(ORDERS));
  const COUNT = metrics.countOrders(ORDERS);
  const GMV_IS_SMALLER = metrics.sumGmv(ORDERS, metrics.dealLedger([])) < metrics.sumOrderAmount(ORDERS);

  it('合作單數與累計訂單金額用共用的訂單定義;標籤不再叫「累計成交金額」', async () => {
    respondWith({
      supplier_orders: ORDERS,
      restaurants: [{ id: 'rest-1', name: '好味小館', city: '台北市', cuisine_type: '台式', contact_name: null, contact_phone: null, contact_line: null }],
    });
    render(<MemoryRouter><SupplierCustomersPage /></MemoryRouter>);

    // 最上方的彙總卡(第一個「累計訂單金額」);下面每家客戶卡也有一個
    await waitFor(() => expect(screen.getAllByText('累計訂單金額')).toHaveLength(2));
    const summary = screen.getAllByText('累計訂單金額')[0].parentElement as HTMLElement;
    expect(within(summary).getByText(TOTAL)).toBeInTheDocument();
    expect(screen.queryByText('累計成交金額')).toBeNull();
    expect(screen.queryByText('累計金額')).toBeNull();

    const card = screen.getByText('好味小館').closest('.p-4') as HTMLElement;
    expect(within(card).getByText('合作單數').parentElement).toHaveTextContent(`合作單數${COUNT}`);
    expect(within(card).getByText('累計訂單金額').parentElement).toHaveTextContent(TOTAL);
    // 這是訂單金額,不是成交:含還沒收貨的單,所以比 GMV 大
    expect(GMV_IS_SMALLER).toBe(true);
    expect(metrics.isCountedOrder).toHaveBeenCalledWith('draft');
    expect(metrics.orderAmount).toHaveBeenCalled();
  });
});
