// 管理員後台各頁的「成交／GMV」「採購金額／訂單數」都改用 src/lib/metrics.ts 的共用定義(業主拍板 Q5-A)。
//
// 每頁都餵同一份「狀態矩陣」(每種狀態一張單、金額是 2 的次方,見 src/test/orderMatrix.ts),驗兩件事:
//   ①頁面顯示的數字 = metrics.ts 對同一份資料算出來的數字,而且不是該頁舊算法的數字
//   ②頁面真的呼叫了 metrics.ts 的函式(函式包成 spy,見 src/test/metricsSpy.ts)
// 預期值一律在 describe 層先算好 —— it() 裡看到的 metrics 呼叫就一定是頁面發出的。
// 已結案(closed)要收過貨才算成交(業主 2026-09-29 決定):每頁都驗「收過貨的結案算、爭議直接結案不算」。
// supabase 換成記憶體假資料(testFakeSupabase),不打網路、不碰正式庫。

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type RecordedQuery } from './testFakeSupabase';
import AdminDashboard from './AdminDashboard';
import AdminGrowthPage from './AdminGrowthPage';
import AdminRevenuePage from './AdminRevenuePage';
import AdminMatchQualityPage from './AdminMatchQualityPage';
import AdminSuppliersPage from './AdminSuppliersPage';
import AdminRestaurantsPage from './AdminRestaurantsPage';
import * as metrics from '@/lib/metrics';
import { ALL_STATUSES, ntd, orderIdFor, orderMatrix, sumFor } from '@/test/orderMatrix';

vi.mock('@/integrations/supabase/client', async () => ({
  supabase: (await import('./testFakeSupabase')).fakeSupabase.client,
}));
vi.mock('@/lib/metrics', async (importOriginal) =>
  (await import('@/test/metricsSpy')).spyOnMetrics(await importOriginal()),
);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { DEAL_EVENT_STATUSES, ORDER_STATUSES } = metrics;

/** 會變成 GMV 的四種狀態(closed 要收過貨) */
const GMV_CANDIDATES = ['received', 'reviewed', 'closed', 'completed'] as const;
/** 收貨事件:四種各一筆 received(closed 那張收過貨) */
const receivedEvents = (at: string) =>
  GMV_CANDIDATES.map((status) => ({ order_id: orderIdFor(status), to_status: 'received', created_at: at }));
/** 同上,但 closed 那張是爭議直接結案:沒有收貨事件,只有 disputed / closed */
const disputeClosedEvents = (at: string) => [
  ...GMV_CANDIDATES.filter((s) => s !== 'closed').map((status) => ({
    order_id: orderIdFor(status), to_status: 'received', created_at: at,
  })),
  { order_id: orderIdFor('closed'), to_status: 'disputed', created_at: at },
  { order_id: orderIdFor('closed'), to_status: 'closed', created_at: at },
];
/** spy 呼叫時的第二個參數:收貨帳本 */
const anyLedger = expect.objectContaining({ received: expect.any(Set), firstDealAt: expect.any(Map) });

/**
 * 1,500 筆別張單的收貨事件排前面,目標事件放在最後(第 1,501 筆之後):
 * 不分頁讀完就看不到 → 已結案那張會被漏算(假 supabase 跟 PostgREST 一樣照 .range 切)。
 */
const behindFirstPage = <T,>(tail: T[]) => [
  ...Array.from({ length: 1500 }, (_, i) => ({
    order_id: `filler-${i}`, to_status: 'received', created_at: '2026-09-01T02:00:00.000Z',
  })),
  ...tail,
];
/** order_events 查詢一律照 created_at、id 排序並分頁 */
const expectPagedEventReads = () => {
  const reads = fakeSupabase.queriesOf('order_events');
  expect(reads.length).toBeGreaterThanOrEqual(2);
  reads.forEach((q) => {
    expect(q.filters.some((f) => f.op === 'range')).toBe(true);
    expect(q.filters.filter((f) => f.op === 'order').map((f) => [f.column, f.value])).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });
};
const EVENTS_ERROR = { error: { message: '模擬:事件讀取失敗' } };
/**
 * 收貨事件在第一頁、第二頁讀取失敗:整份要當成讀取失敗(不能拿半套事件算),
 * 所以已結案那張「不算」才對;如果頁面拿了半套資料,它反而會被算進去。
 */
const failOnSecondPage = (head: unknown[]) => (q: RecordedQuery) => {
  const range = q.filters.find((f) => f.op === 'range')?.value as [number, number] | undefined;
  if (range && range[0] >= 1000) return EVENTS_ERROR;
  return { data: [...head, ...behindFirstPage([])] };
};

// recharts 的 ResponsiveContainer 需要 ResizeObserver,jsdom 沒有
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const renderIn = (ui: JSX.Element, path = '/admin') =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

/** 某個標籤所在的那張卡片 / 那一格(標籤與數字是兄弟節點) */
const cellOf = (label: string) => screen.getByText(label).parentElement as HTMLElement;
/** 那一格裡剛好有一個節點的文字就是這個數字(不是子字串比對) */
const expectValueIn = (label: string, value: string) =>
  expect(within(cellOf(label)).getByText(value)).toBeInTheDocument();

/** 固定「現在」= 2026-09-15 中午(本地時區),本月 = 2026-09 */
const NOW = new Date(2026, 8, 15, 12, 0, 0);
const localIso = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

const statusFilterOf = (q: RecordedQuery, column: string) =>
  q.filters.find((f) => f.op === 'in' && f.column === column)?.value;

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
  expect(fakeSupabase.writes()).toEqual([]); // 這些都是唯讀頁
});

/* ------------------------------------------------------------------ */
describe('總覽 › 營運(AdminDashboard):總訂單', () => {
  const EXPECTED = String(metrics.countOrders(ALL_STATUSES.map((status) => ({ status })))); // 16

  it('交給資料庫去數的是共用的 ORDER_STATUSES(不含草稿、取消、拒單、逾時)', async () => {
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders' && q.options?.head) {
        // 假資料照篩選條件回筆數:有帶共用狀態集合才回 16,沒帶(舊算法)回全部 20
        return { count: statusFilterOf(q, 'status') === ORDER_STATUSES ? Number(EXPECTED) : 20 };
      }
      return undefined;
    });
    renderIn(<AdminDashboard />);

    await waitFor(() => expectValueIn('總訂單', EXPECTED));
    const countQuery = fakeSupabase.queriesOf('supplier_orders').find((q) => q.options?.head);
    expect(statusFilterOf(countQuery!, 'status')).toBe(ORDER_STATUSES);
  });
});

/* ------------------------------------------------------------------ */
describe('總覽 › 成長(AdminGrowthPage):GMV、AOV、漏斗', () => {
  // 全部 8/20 建立;成交單 9/05 餐廳收貨
  const ORDERS = orderMatrix((status) => ({
    restaurant_id: status === 'draft' ? 'rest-2' : 'rest-1',
    created_at: localIso(2026, 8, 20),
  }));
  const EVENTS = receivedEvents(localIso(2026, 9, 5));
  const LEDGER = metrics.dealLedger(EVENTS);
  const GMV = ntd(metrics.sumGmv(ORDERS, LEDGER));
  const DEALS = metrics.countDeals(ORDERS, LEDGER); // 4
  const AOV = ntd(metrics.averageDealAmount(ORDERS, LEDGER));
  const PLACED = String(metrics.countOrders(ORDERS)); // 16;舊算法(只排除草稿、取消)是 18

  // 爭議直接結案版本:closed 那張沒收過貨
  const DISPUTE_EVENTS = disputeClosedEvents(localIso(2026, 9, 5));
  const DISPUTE_LEDGER = metrics.dealLedger(DISPUTE_EVENTS);
  const GMV_DISPUTE = ntd(metrics.sumGmv(ORDERS, DISPUTE_LEDGER));
  const DEALS_DISPUTE = metrics.countDeals(ORDERS, DISPUTE_LEDGER); // 3
  const AOV_DISPUTE = ntd(metrics.averageDealAmount(ORDERS, DISPUTE_LEDGER));

  const respond = (events: unknown[]) =>
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return { data: events };
      if (q.table === 'restaurants') return { data: [{ id: 'rest-1', created_at: localIso(2026, 7, 1) }] };
      return { data: [] };
    });

  beforeEach(() => respond(EVENTS));

  it('累計 GMV / 近 30 天 / 成交筆數 = metrics.ts 的成交定義', async () => {
    renderIn(<AdminGrowthPage />, '/admin/growth');

    await waitFor(() => expectValueIn('累計 GMV', GMV));
    // 收貨在 9/05,距 9/15 在 30 天內 → 近 30 天 = 累計;筆數用「成交」
    expect(cellOf('累計 GMV')).toHaveTextContent(`近 30 天 ${GMV} · ${DEALS} 筆成交`);
    expect(GMV).toBe(ntd(sumFor(['received', 'reviewed', 'closed', 'completed'])));

    // 頁面呼叫的是共用函式,收貨事件查的是共用的 DEAL_EVENT_STATUSES
    expect(metrics.sumGmv).toHaveBeenCalledWith(ORDERS, anyLedger);
    expect(metrics.dealOrders).toHaveBeenCalledWith(ORDERS, anyLedger);
    expect(metrics.dealLedger).toHaveBeenCalledWith(EVENTS);
    expect(statusFilterOf(fakeSupabase.queriesOf('order_events')[0], 'to_status')).toBe(DEAL_EVENT_STATUSES);
    // GMV 月趨勢用本地時區、以收貨時間分月(月份函式跟營收頁共用)
    expect(metrics.localMonthKey).toHaveBeenCalledWith(EVENTS[0].created_at);
  });

  it('平均成交金額(AOV)用共用函式;標籤不再叫「平均訂單金額」', async () => {
    renderIn(<AdminGrowthPage />, '/admin/growth');
    await waitFor(() => expectValueIn('平均成交金額 (AOV)', AOV));
    expect(screen.queryByText('平均訂單金額 (AOV)')).toBeNull();
    expect(metrics.averageDealAmount).toHaveBeenCalledWith(ORDERS, anyLedger);
  });

  it('爭議直接結案(沒收過貨)的已結案單:不算 GMV、不算完成收貨、不進 AOV,但仍算成立訂單', async () => {
    respond(DISPUTE_EVENTS);
    renderIn(<AdminGrowthPage />, '/admin/growth');

    await waitFor(() => expectValueIn('累計 GMV', GMV_DISPUTE));
    expect(GMV_DISPUTE).toBe(ntd(sumFor(['received', 'reviewed', 'completed'])));
    expect(cellOf('累計 GMV')).toHaveTextContent(`${DEALS_DISPUTE} 筆成交`);
    expectValueIn('完成收貨', String(DEALS_DISPUTE));
    expectValueIn('成立訂單', PLACED); // closed 還是有效訂單
    expectValueIn('平均成交金額 (AOV)', AOV_DISPUTE);
    expect(cellOf('平均成交金額 (AOV)')).toHaveTextContent(`樣本 ${DEALS_DISPUTE} 筆有金額的成交訂單`);
  });

  it('收貨事件超過 1,000 筆:分頁讀完,排在後面的收貨事件也算得到', async () => {
    respond(behindFirstPage(EVENTS));
    renderIn(<AdminGrowthPage />, '/admin/growth');
    await waitFor(() => expectValueIn('累計 GMV', GMV)); // 含已結案那張
    expectPagedEventReads();
  });

  it.each([
    ['一開始就失敗', () => EVENTS_ERROR],
    ['讀到第二頁才失敗(不能拿半套)', failOnSecondPage(EVENTS)],
  ] as const)('收貨事件讀取失敗(%s):已結案的單不算 GMV,並常駐提示', async (_label, events) => {
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return (events as (q: RecordedQuery) => unknown)(q) as never;
      if (q.table === 'restaurants') return { data: [{ id: 'rest-1', created_at: localIso(2026, 7, 1) }] };
      return { data: [] };
    });
    renderIn(<AdminGrowthPage />, '/admin/growth');
    await waitFor(() => expectValueIn('累計 GMV', GMV_DISPUTE));
    expect(screen.getByText(/已結案的單無法確認收過貨、暫不計入 GMV/)).toBeInTheDocument();
  });

  it('漏斗「成立訂單」= 共用的訂單數(舊算法連拒單、逾時也算),「完成收貨」= 成交單數', async () => {
    renderIn(<AdminGrowthPage />, '/admin/growth');
    await waitFor(() => expectValueIn('成立訂單', PLACED));
    expectValueIn('完成收貨', String(DEALS));
    expect(metrics.countedOrders).toHaveBeenCalledWith(ORDERS);
  });
});

/* ------------------------------------------------------------------ */
describe('財務 › 營收與抽成(AdminRevenuePage)', () => {
  // 全部 8/20 建立;成交單 9/02 收貨 —— 舊算法用建立月份,本月(9 月)GMV 會是 0
  const ORDERS = orderMatrix(() => ({
    restaurant_id: 'rest-1',
    supplier_id: 'sup-1',
    created_at: localIso(2026, 8, 20),
  }));
  const EVENTS = receivedEvents(localIso(2026, 9, 2));
  const LEDGER = metrics.dealLedger(EVENTS);
  const GMV = ntd(metrics.sumGmv(ORDERS, LEDGER));
  const DEALS = metrics.countDeals(ORDERS, LEDGER);
  const DISPUTE_EVENTS = disputeClosedEvents(localIso(2026, 9, 2));
  const GMV_DISPUTE = ntd(metrics.sumGmv(ORDERS, metrics.dealLedger(DISPUTE_EVENTS)));
  const AVG_DISPUTE = ntd(metrics.averageDealAmount(ORDERS, metrics.dealLedger(DISPUTE_EVENTS)));

  const UNPRICED = {
    id: 'order-unpriced', status: 'received', total_amount: null,
    restaurant_id: 'rest-1', supplier_id: 'sup-1', created_at: localIso(2026, 8, 21),
  };
  const WITH_UNPRICED = [...ORDERS, UNPRICED];
  const AVG = metrics.averageDealAmount(WITH_UNPRICED, LEDGER); // 分母 4(舊算法除以 5)
  const AVG_OLD = metrics.sumGmv(ORDERS, LEDGER) / 5;

  const NO_DEALS = ORDERS.filter((o) => !(GMV_CANDIDATES as readonly string[]).includes(o.status));
  const IN_PROGRESS_COUNT = metrics.countOrders(NO_DEALS); // 12(沒有成交單時,在途 = 全部有效訂單)
  const IN_PROGRESS_AMOUNT = ntd(metrics.sumOrderAmount(NO_DEALS));

  const respond = (orders: unknown[], events: unknown[]) =>
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { data: orders };
      if (q.table === 'order_events') return { data: events };
      return { data: [] };
    });

  it('本月 GMV 算在餐廳確認收貨的月份;累計 GMV = metrics.ts 的 GMV', async () => {
    respond(ORDERS, EVENTS);
    renderIn(<AdminRevenuePage />, '/admin/revenue');

    await waitFor(() => expectValueIn('本月 GMV', GMV));
    expectValueIn('累計 GMV', GMV);
    expect(cellOf('累計 GMV')).toHaveTextContent(`${DEALS} 筆成交`);
    expect(metrics.sumGmv).toHaveBeenCalledWith(ORDERS, anyLedger);
    // 本月 GMV、月度表、最近認列清單、累計筆數都從這一份成交單來
    expect(metrics.dealOrders).toHaveBeenCalledWith(ORDERS, anyLedger);
    expect(metrics.dealLedger).toHaveBeenCalledWith(EVENTS);
    expect(metrics.dealRecognizedAt).toHaveBeenCalled();
    expect(statusFilterOf(fakeSupabase.queriesOf('order_events')[0], 'to_status')).toBe(DEAL_EVENT_STATUSES);
  });

  it('爭議直接結案(沒收過貨)的已結案單不算 GMV,也不算在途', async () => {
    respond(ORDERS, DISPUTE_EVENTS);
    renderIn(<AdminRevenuePage />, '/admin/revenue');

    await waitFor(() => expectValueIn('累計 GMV', GMV_DISPUTE));
    expect(GMV_DISPUTE).toBe(ntd(sumFor(['received', 'reviewed', 'completed'])));
    expectValueIn('本月 GMV', GMV_DISPUTE);
    expect(cellOf('累計 GMV')).toHaveTextContent('3 筆成交');
    expectValueIn('成交訂單的平均金額(不含還沒填金額的單)', AVG_DISPUTE);
  });

  it('收貨事件超過 1,000 筆:分頁讀完,排在後面的收貨事件也算得到', async () => {
    respond(ORDERS, behindFirstPage(EVENTS));
    renderIn(<AdminRevenuePage />, '/admin/revenue');
    await waitFor(() => expectValueIn('累計 GMV', GMV));
    expectPagedEventReads();
    expect(screen.queryByText(/單次查詢已達/)).toBeNull(); // 事件讀完整了,不再誤報上限
  });

  it.each([
    ['一開始就失敗', () => EVENTS_ERROR],
    ['讀到第二頁才失敗(不能拿半套)', failOnSecondPage(EVENTS)],
  ] as const)('收貨事件讀取失敗(%s):已結案的單不算 GMV,並常駐提示', async (_label, events) => {
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return (events as (q: RecordedQuery) => unknown)(q) as never;
      return { data: [] };
    });
    renderIn(<AdminRevenuePage />, '/admin/revenue');
    await waitFor(() => expectValueIn('累計 GMV', GMV_DISPUTE));
    expect(screen.getByText(/已結案的單無法確認收過貨、暫不計入 GMV/)).toBeInTheDocument();
  });

  it('月初清晨確認收貨的單算在當月(本地時區,不是 UTC)', async () => {
    // 台灣 9/01 00:30 收貨 = UTC 8/31 16:30;用 toISOString().slice(0, 7) 分月會被算到 8 月
    // (vitest 設定固定 TZ=Asia/Taipei,CI 跑在 UTC 也驗得出來)
    const order = { id: 'order-dawn', status: 'received', total_amount: 777, restaurant_id: 'rest-1', supplier_id: 'sup-1', created_at: localIso(2026, 8, 30) };
    const dawn = new Date(2026, 8, 1, 0, 30, 0).toISOString();
    respond([order], [{ order_id: 'order-dawn', to_status: 'received', created_at: dawn }]);
    renderIn(<AdminRevenuePage />, '/admin/revenue');

    await waitFor(() => expectValueIn('本月 GMV', ntd(777)));
    expect(metrics.localMonthKey).toHaveBeenCalledWith(dawn);
  });

  it('平均成交金額跟成長分頁同一個函式:沒填金額的成交單不拉低平均;月度表的筆數叫「成交單數」', async () => {
    respond(WITH_UNPRICED, EVENTS);
    renderIn(<AdminRevenuePage />, '/admin/revenue');

    // KPI 卡用說明文字定位(「平均成交金額」同時也是月度表的欄名)
    await waitFor(() => expectValueIn('成交訂單的平均金額(不含還沒填金額的單)', ntd(AVG)));
    expect(AVG).not.toBe(AVG_OLD);
    expect(metrics.averageDealAmount).toHaveBeenCalledWith(WITH_UNPRICED, anyLedger);
    expect(screen.getAllByText('平均成交金額')).toHaveLength(2); // KPI 標題 + 月度表欄名
    expect(screen.queryByText('平均客單價')).toBeNull();
    expect(screen.getByRole('columnheader', { name: '成交單數' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '訂單數' })).toBeNull();
  });

  it('還沒有成交時:在途只算有效訂單(不含草稿、取消、拒單、逾時)', async () => {
    respond(NO_DEALS, []);
    renderIn(<AdminRevenuePage />, '/admin/revenue');

    expect(await screen.findByText(/筆訂單在途/)).toHaveTextContent(
      `目前有 ${IN_PROGRESS_COUNT} 筆訂單在途(還沒確認收貨),在途金額 ${IN_PROGRESS_AMOUNT}`,
    );
    expect(metrics.sumInProgressAmount).toHaveBeenCalledWith(NO_DEALS);
    expect(metrics.inProgressOrders).toHaveBeenCalledWith(NO_DEALS);
  });
});

/* ------------------------------------------------------------------ */
describe('需求與媒合 › 供給缺口與品質(AdminMatchQualityPage)', () => {
  const ORDERS = orderMatrix(() => ({
    restaurant_id: 'rest-1',
    supplier_id: 'sup-1',
    current_stage_since: localIso(2026, 9, 14),
    created_at: localIso(2026, 9, 1),
  }));
  const EVENTS = receivedEvents(localIso(2026, 9, 5));
  const LEDGER = metrics.dealLedger(EVENTS);
  const DEALS = String(metrics.countDeals(ORDERS, LEDGER)); // 4
  const DEALS_DISPUTE = String(metrics.countDeals(ORDERS, metrics.dealLedger(disputeClosedEvents(localIso(2026, 9, 5))))); // 3
  const ORDER_COUNT = metrics.countOrders(ORDERS); // 16
  const DEAL_RATE = Math.round((metrics.countDeals(ORDERS, LEDGER) / ORDER_COUNT) * 100); // 25(舊算法:4 ÷ 全部 20 = 20)
  // 未接單 4 張(待接單 / 已派發 / 拒單 / 逾時),其中拒單、逾時不算訂單 → 分母 = 16 + 2
  const LOST_RATE = Math.round((4 / (ORDER_COUNT + 2)) * 100); // 22

  const respond = (events: unknown[]) =>
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return { data: events };
      return { data: [] };
    });

  it('已成交筆數 = 共用成交定義;「派發後未成交」改叫「派發後未接單」', async () => {
    respond(EVENTS);
    renderIn(<AdminMatchQualityPage />, '/admin/match-quality');

    await waitFor(() => expectValueIn('已成交筆數', DEALS));
    expect(metrics.countDeals).toHaveBeenCalledWith(ORDERS, anyLedger);
    expect(statusFilterOf(fakeSupabase.queriesOf('order_events')[0], 'to_status')).toBe(DEAL_EVENT_STATUSES);
    expectValueIn('未接單筆數', '4'); // dispatched / sent / rejected / expired
    expect(screen.getByText('派發後未接單')).toBeInTheDocument();
    expect(screen.queryByText('派發後未成交')).toBeNull();
    expect(screen.queryByText('媒合了但沒成交')).toBeNull();
  });

  it('爭議直接結案(沒收過貨)的已結案單不算已成交', async () => {
    respond(disputeClosedEvents(localIso(2026, 9, 5)));
    renderIn(<AdminMatchQualityPage />, '/admin/match-quality');
    await waitFor(() => expectValueIn('已成交筆數', DEALS_DISPUTE));
    expect(DEALS_DISPUTE).toBe('3');
  });

  it('收貨事件超過 1,000 筆:分頁讀完,排在後面的收貨事件也算得到', async () => {
    respond(behindFirstPage(EVENTS));
    renderIn(<AdminMatchQualityPage />, '/admin/match-quality');
    await waitFor(() => expectValueIn('已成交筆數', DEALS));
    expectPagedEventReads();
  });

  it.each([
    ['一開始就失敗', () => EVENTS_ERROR],
    ['讀到第二頁才失敗(不能拿半套)', failOnSecondPage(EVENTS)],
  ] as const)('收貨事件讀取失敗(%s):已結案的單不算已成交,並常駐提示', async (_label, events) => {
    fakeSupabase.respond((q) => {
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return (events as (q: RecordedQuery) => unknown)(q) as never;
      return { data: [] };
    });
    renderIn(<AdminMatchQualityPage />, '/admin/match-quality');
    await waitFor(() => expectValueIn('已成交筆數', '3'));
    expect(screen.getByText(/已結案的單無法確認收過貨,暫不計入已成交/)).toBeInTheDocument();
  });

  it('訂單數與成交率用共用定義:成交率 = 成交單數 ÷ 訂單數;未接單比例的分母把拒單、逾時加回來', async () => {
    respond(EVENTS);
    renderIn(<AdminMatchQualityPage />, '/admin/match-quality');

    await waitFor(() => expect(screen.getByText(/成交率/)).toHaveTextContent(`成交率 ${DEAL_RATE}%(成交單數 ÷ 訂單數)`));
    expect(screen.getByText(/成交率/)).toHaveTextContent('以下用全部 20 筆單據(含草稿、取消、拒單、逾時)的狀態分布替代');
    expectValueIn('未接單比例', `${LOST_RATE}%`);
    expect(cellOf('派發後未接單')).toHaveTextContent(`訂單 ${ORDER_COUNT} 筆;另有拒單 / 逾時 2 筆`);
    expect(screen.queryByText(/筆訂單中/)).toBeNull(); // 舊的「全部 20 筆訂單中」
    expect(metrics.countOrders).toHaveBeenCalledWith(ORDERS);
    expect(metrics.isCountedOrder).toHaveBeenCalledWith('rejected');
  });
});

/* ------------------------------------------------------------------ */
describe('會員 › 供應商(AdminSuppliersPage):成交單數 / 訂單數', () => {
  const ORDERS = orderMatrix(() => ({ supplier_id: 'sup-1' }));
  const EVENTS = receivedEvents(localIso(2026, 9, 5));
  const EXPECTED = `${metrics.countDeals(ORDERS, metrics.dealLedger(EVENTS))} / ${metrics.countOrders(ORDERS)}`; // 4 / 16
  const DISPUTE_EVENTS = disputeClosedEvents(localIso(2026, 9, 5));
  const EXPECTED_DISPUTE = `${metrics.countDeals(ORDERS, metrics.dealLedger(DISPUTE_EVENTS))} / ${metrics.countOrders(ORDERS)}`; // 3 / 16

  const respond = (events: unknown[]) =>
    fakeSupabase.respond((q) => {
      if (q.table === 'suppliers') {
        return {
          data: [
            {
              id: 'sup-1', name: '鮮綠農產', description: null, service_areas: ['台北市'],
              contact_name: null, contact_email: null, phone: null, is_active: true,
              created_at: localIso(2026, 7, 1),
            },
          ],
        };
      }
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return { data: events };
      return { data: [] };
    });

  it('delivered(待收貨)不再算成交;分母只數有效訂單', async () => {
    respond(EVENTS);
    renderIn(<AdminSuppliersPage />, '/admin/suppliers');

    const row = (await screen.findByText('鮮綠農產')).closest('tr') as HTMLElement;
    expect(screen.getByRole('columnheader', { name: '成交單數 / 訂單數' })).toBeInTheDocument();
    // 新:4 / 16;舊算法是 5 / 20(把 delivered 算成交、分母連草稿取消都算)
    await waitFor(() => expect(row).toHaveTextContent(EXPECTED));
    expect(row).not.toHaveTextContent('5 / 20');
    expect(metrics.isDeal).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }), anyLedger);
    expect(metrics.isCountedOrder).toHaveBeenCalledWith('draft');
    expect(statusFilterOf(fakeSupabase.queriesOf('order_events')[0], 'to_status')).toBe(DEAL_EVENT_STATUSES);
  });

  it('爭議直接結案(沒收過貨)的已結案單不算成交,但還是算一張訂單', async () => {
    respond(DISPUTE_EVENTS);
    renderIn(<AdminSuppliersPage />, '/admin/suppliers');
    const row = (await screen.findByText('鮮綠農產')).closest('tr') as HTMLElement;
    await waitFor(() => expect(row).toHaveTextContent(EXPECTED_DISPUTE));
    expect(EXPECTED_DISPUTE).toBe('3 / 16');
  });

  it('收貨事件超過 1,000 筆:分頁讀完,排在後面的收貨事件也算得到', async () => {
    respond(behindFirstPage(EVENTS));
    renderIn(<AdminSuppliersPage />, '/admin/suppliers');
    const row = (await screen.findByText('鮮綠農產')).closest('tr') as HTMLElement;
    await waitFor(() => expect(row).toHaveTextContent(EXPECTED));
    expectPagedEventReads();
  });

  it.each([
    ['一開始就失敗', () => EVENTS_ERROR],
    ['讀到第二頁才失敗(不能拿半套)', failOnSecondPage(EVENTS)],
  ] as const)('收貨事件讀取失敗(%s):已結案的單不算成交,並常駐提示(不是只跳 toast)', async (_label, events) => {
    fakeSupabase.respond((q) => {
      if (q.table === 'suppliers') {
        return {
          data: [
            {
              id: 'sup-1', name: '鮮綠農產', description: null, service_areas: ['台北市'],
              contact_name: null, contact_email: null, phone: null, is_active: true,
              created_at: localIso(2026, 7, 1),
            },
          ],
        };
      }
      if (q.table === 'supplier_orders') return { data: ORDERS };
      if (q.table === 'order_events') return (events as (q: RecordedQuery) => unknown)(q) as never;
      return { data: [] };
    });
    renderIn(<AdminSuppliersPage />, '/admin/suppliers');
    const row = (await screen.findByText('鮮綠農產')).closest('tr') as HTMLElement;
    await waitFor(() => expect(row).toHaveTextContent('3 / 16'));
    expect(screen.getByText(/收貨紀錄讀取失敗:已結案的單無法確認收過貨/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
describe('會員 › 餐廳(AdminRestaurantsPage):累計訂單、累計採購金額', () => {
  const ORDERS = orderMatrix((status) => ({
    restaurant_id: 'rest-1',
    // 草稿是最新的一張:「最後下單」沿用原口徑(任何單都算),所以顯示草稿的日期
    created_at: status === 'draft' ? localIso(2026, 9, 14) : localIso(2026, 9, 1),
  }));
  const ORDER_COUNT = String(metrics.countOrders(ORDERS)); // 16(舊:20)
  const AMOUNT = ntd(metrics.sumOrderAmount(ORDERS));
  // 舊算法只排除取消 / 逾時 / 拒單,草稿也算進去
  const AMOUNT_OLD = ntd(sumFor(ALL_STATUSES.filter((s) => !['cancelled', 'expired', 'rejected'].includes(s))));
  const LAST_ORDER = new Date(localIso(2026, 9, 14)).toLocaleDateString('zh-TW');

  it('累計訂單與累計採購金額用共用的訂單定義;最後下單 / 活躍度維持原口徑(待業主決定)', async () => {
    fakeSupabase.respond((q) => {
      if (q.table === 'restaurants') {
        return {
          data: [
            {
              id: 'rest-1', name: '好味小館', tax_id: null, cuisine_type: '台式', seats: 40, address: null,
              city: '台北市', contact_name: null, contact_phone: null, contact_line: null,
              monthly_revenue_band: null, is_active: true, created_at: localIso(2026, 7, 1),
            },
          ],
        };
      }
      if (q.table === 'supplier_orders') return { data: ORDERS };
      return { data: [] };
    });
    renderIn(<AdminRestaurantsPage />, '/admin/restaurants');

    const row = (await screen.findByText('好味小館')).closest('tr') as HTMLElement;
    expect(screen.getByRole('columnheader', { name: '累計採購金額' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '累計金額' })).toBeNull();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    const cellUnder = (header: string) => within(row).getAllByRole('cell')[headers.indexOf(header)];
    await waitFor(() => expect(cellUnder('累計訂單')).toHaveTextContent(ORDER_COUNT));
    expect(cellUnder('累計採購金額')).toHaveTextContent(AMOUNT);
    expect(cellUnder('累計採購金額')).not.toHaveTextContent(AMOUNT_OLD);
    expect(cellUnder('最後下單')).toHaveTextContent(LAST_ORDER);
    expect(metrics.isCountedOrder).toHaveBeenCalledWith('draft');
  });
});
