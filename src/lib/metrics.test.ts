// src/lib/metrics.ts 的規格測試:全站「成交／GMV」與「採購金額／訂單金額」的唯一定義(業主拍板 Q5-A)。
// 這支測試就是定義本身 —— 每一種訂單狀態歸哪一類都逐一寫死在下面,改定義要先改這裡。

import { describe, expect, it, vi } from 'vitest';

// orders.ts 會載入 supabase client;這裡只要它的狀態表,不需要(也不准)連線
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { ORDER_STATUS, type OrderStatus } from '@/lib/orders';
import {
  EXCLUDED_ORDER_STATUSES,
  GMV_STATUSES,
  IN_PROGRESS_STATUSES,
  METRIC_CLASS,
  ORDER_STATUSES,
  averageDealAmount,
  countDeals,
  countOrders,
  countedOrders,
  dealOrders,
  dealRecognizedAt,
  firstDealEventAt,
  inProgressOrders,
  isCountedOrder,
  isDeal,
  isInProgress,
  localMonthKey,
  metricClassOf,
  orderAmount,
  pricedDeals,
  sumGmv,
  sumInProgressAmount,
  sumOrderAmount,
  type MetricClass,
} from './metrics';

/** 業主拍板的定義,逐一列出(這張表就是驗收標準;closed 的爭議直接結案路徑待業主決定,見 metrics.ts 檔頭) */
const EXPECTED: Record<OrderStatus, MetricClass> = {
  draft: 'excluded',
  submitted: 'in_progress',
  dispatched: 'in_progress',
  accepted: 'in_progress',
  quoted: 'in_progress',
  confirmed: 'in_progress',
  shipped: 'in_progress',
  in_transit: 'in_progress',
  delivered: 'in_progress',
  received: 'deal',
  reviewed: 'deal',
  closed: 'deal', // 含爭議直接結案(discrepancy / disputed → closed),待業主決定
  rejected: 'excluded',
  discrepancy: 'in_progress',
  disputed: 'in_progress',
  cancelled: 'excluded',
  expired: 'excluded',
  pending: 'in_progress',
  sent: 'in_progress',
  completed: 'deal',
};

const ALL_STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];

/** 每種狀態一張單,金額是 2 的次方 —— 任何一組狀態的加總都獨一無二,算錯哪一種一看就知道 */
const MATRIX = ALL_STATUSES.map((status, i) => ({
  id: `order-${status}`,
  status,
  total_amount: 2 ** i,
  created_at: '2026-09-10T02:00:00Z',
}));
const amountOf = (status: OrderStatus) => 2 ** ALL_STATUSES.indexOf(status);
const sumOf = (statuses: readonly OrderStatus[]) => statuses.reduce((s, st) => s + amountOf(st), 0);

describe('狀態歸類 —— 每一種狀態都有明確歸屬', () => {
  it('orders.ts 的每一種狀態都有歸類,也沒有多出不存在的狀態', () => {
    expect(Object.keys(METRIC_CLASS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(ALL_STATUSES).toHaveLength(20);
  });

  it.each(ALL_STATUSES)('%s 的歸類符合業主定義', (status) => {
    expect(metricClassOf(status)).toBe(EXPECTED[status]);
    expect(isDeal(status)).toBe(EXPECTED[status] === 'deal');
    expect(isCountedOrder(status)).toBe(EXPECTED[status] !== 'excluded');
    expect(isInProgress(status)).toBe(EXPECTED[status] === 'in_progress');
  });

  it('成交 / GMV = received、reviewed、closed、completed(餐廳確認收貨之後)', () => {
    expect([...GMV_STATUSES]).toEqual(['received', 'reviewed', 'closed', 'completed']);
  });

  it('不算訂單 = draft、rejected、cancelled、expired;其餘 16 種都算採購 / 訂單', () => {
    expect([...EXCLUDED_ORDER_STATUSES].sort()).toEqual(['cancelled', 'draft', 'expired', 'rejected']);
    expect(ORDER_STATUSES).toHaveLength(16);
    expect([...ORDER_STATUSES].sort()).toEqual(
      ALL_STATUSES.filter((s) => !EXCLUDED_ORDER_STATUSES.includes(s)).sort(),
    );
  });

  it('三類剛好切分全部狀態;成交是採購的子集合', () => {
    const union = [...EXCLUDED_ORDER_STATUSES, ...IN_PROGRESS_STATUSES, ...GMV_STATUSES];
    expect(union.sort()).toEqual([...ALL_STATUSES].sort());
    expect(new Set(union).size).toBe(ALL_STATUSES.length); // 沒有重複歸類
    GMV_STATUSES.forEach((s) => expect(ORDER_STATUSES).toContain(s));
    expect([...IN_PROGRESS_STATUSES].sort()).toEqual(
      ORDER_STATUSES.filter((s) => !GMV_STATUSES.includes(s)).sort(),
    );
  });

  it('狀態集合是唯讀的,別處改不動', () => {
    expect(Object.isFrozen(GMV_STATUSES)).toBe(true);
    expect(Object.isFrozen(ORDER_STATUSES)).toBe(true);
    expect(Object.isFrozen(EXCLUDED_ORDER_STATUSES)).toBe(true);
    expect(Object.isFrozen(IN_PROGRESS_STATUSES)).toBe(true);
  });
});

describe('邊界 —— 最容易算錯的幾個狀態', () => {
  it('confirmed(餐廳確認報價)還不是成交 —— 供應商總覽舊算法從這裡就算', () => {
    expect(isDeal('confirmed')).toBe(false);
    expect(isCountedOrder('confirmed')).toBe(true);
  });

  it('delivered(供應商說送到了)還不是成交 —— 供應商管理舊算法把它算成交', () => {
    expect(isDeal('delivered')).toBe(false);
    expect(isCountedOrder('delivered')).toBe(true);
  });

  it('received(餐廳按下收貨)是第一個成交狀態', () => {
    expect(isDeal('received')).toBe(true);
  });

  it('收貨有差異 / 爭議中:餐廳沒確認收貨 → 不是成交,但仍是有效訂單', () => {
    for (const s of ['discrepancy', 'disputed']) {
      expect(isDeal(s)).toBe(false);
      expect(isCountedOrder(s)).toBe(true);
    }
  });

  it('草稿與取消單不算訂單 —— 管理員餐廳管理、餐廳我的供應商的舊算法把它們算進去', () => {
    for (const s of ['draft', 'cancelled', 'rejected', 'expired']) {
      expect(isCountedOrder(s)).toBe(false);
      expect(isDeal(s)).toBe(false);
    }
  });

  it('舊資料狀態:pending / sent 算有效訂單,completed 算成交', () => {
    expect(isCountedOrder('pending')).toBe(true);
    expect(isCountedOrder('sent')).toBe(true);
    expect(isDeal('pending')).toBe(false);
    expect(isDeal('sent')).toBe(false);
    expect(isDeal('completed')).toBe(true);
  });

  it.each([null, undefined, '', 'RECEIVED', ' received', 'paid', 'toString', '__proto__'])(
    '未知狀態 %j:兩邊都不算(寧可少算,不灌水)',
    (status) => {
      expect(metricClassOf(status as string | null | undefined)).toBeNull();
      expect(isDeal(status as string | null | undefined)).toBe(false);
      expect(isCountedOrder(status as string | null | undefined)).toBe(false);
      expect(isInProgress(status as string | null | undefined)).toBe(false);
    },
  );
});

describe('金額', () => {
  it.each([
    [null, 0],
    [undefined, 0],
    [0, 0],
    [1800, 1800],
    ['6900.00', 6900], // PostgREST / SQL 可能回字串
    ['abc', 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('orderAmount(%j) = %j', (total_amount, expected) => {
    expect(orderAmount({ total_amount: total_amount as number | string | null | undefined })).toBe(expected);
  });

  it('沒有 total_amount 欄位也當 0', () => {
    expect(orderAmount({})).toBe(0);
  });
});

describe('從訂單列計算', () => {
  it('GMV 只加成交狀態的金額', () => {
    expect(sumGmv(MATRIX)).toBe(sumOf(['received', 'reviewed', 'closed', 'completed']));
  });

  it('成交單數只數成交狀態', () => {
    expect(countDeals(MATRIX)).toBe(4);
    expect(dealOrders(MATRIX).map((o) => o.status)).toEqual(['received', 'reviewed', 'closed', 'completed']);
  });

  it('採購金額 / 訂單金額 = 全部扣掉草稿、取消、拒單、逾時', () => {
    const all = sumOf(ALL_STATUSES);
    expect(sumOrderAmount(MATRIX)).toBe(all - sumOf(['draft', 'cancelled', 'rejected', 'expired']));
    expect(countOrders(MATRIX)).toBe(16);
    expect(countedOrders(MATRIX).map((o) => o.status)).not.toContain('draft');
  });

  it('在途金額 = 採購金額 − GMV', () => {
    expect(sumInProgressAmount(MATRIX)).toBe(sumOrderAmount(MATRIX) - sumGmv(MATRIX));
    expect(inProgressOrders(MATRIX)).toHaveLength(12);
  });

  it('還沒報價(金額 null)的成交單:算成交單數,金額以 0 計', () => {
    const rows = [
      { status: 'received', total_amount: null },
      { status: 'closed', total_amount: 500 },
    ];
    expect(countDeals(rows)).toBe(2);
    expect(sumGmv(rows)).toBe(500);
  });

  it('平均成交金額:分母只算有金額的成交單,非成交單不影響', () => {
    const rows = [
      { status: 'received', total_amount: 1000 },
      { status: 'reviewed', total_amount: 3000 },
      { status: 'closed', total_amount: null }, //  沒金額:不拉低平均
      { status: 'completed', total_amount: 0 }, //   金額 0:同上
      { status: 'delivered', total_amount: 99999 }, // 還沒成交
      { status: 'cancelled', total_amount: 99999 },
    ];
    expect(pricedDeals(rows)).toHaveLength(2);
    expect(averageDealAmount(rows)).toBe(2000);
  });

  it('空資料:全部是 0,不會 NaN', () => {
    expect(sumGmv([])).toBe(0);
    expect(countDeals([])).toBe(0);
    expect(sumOrderAmount([])).toBe(0);
    expect(countOrders([])).toBe(0);
    expect(sumInProgressAmount([])).toBe(0);
    expect(averageDealAmount([])).toBe(0);
    expect(pricedDeals([])).toEqual([]);
    expect(firstDealEventAt([]).size).toBe(0);
  });

  it('只有不算的單:GMV 與採購金額都是 0', () => {
    const rows = ['draft', 'cancelled', 'rejected', 'expired'].map((status) => ({ status, total_amount: 100 }));
    expect(sumGmv(rows)).toBe(0);
    expect(sumOrderAmount(rows)).toBe(0);
    expect(averageDealAmount(rows)).toBe(0);
  });

  it('任何資料下:成交 ≤ 採購(成交是子集合)', () => {
    expect(countDeals(MATRIX)).toBeLessThanOrEqual(countOrders(MATRIX));
    expect(sumGmv(MATRIX)).toBeLessThanOrEqual(sumOrderAmount(MATRIX));
  });
});

describe('成交算在哪一天', () => {
  const ev = (order_id: string, to_status: string, created_at: string) => ({ order_id, to_status, created_at });

  it('取第一次進入成交狀態的事件(received → reviewed → closed 取 received)', () => {
    const map = firstDealEventAt([
      ev('a', 'closed', '2026-07-06T10:00:00Z'),
      ev('a', 'received', '2026-07-04T11:00:00Z'),
      ev('a', 'reviewed', '2026-07-05T10:00:00Z'),
    ]);
    expect(map.get('a')).toBe('2026-07-04T11:00:00Z');
  });

  it('非成交事件(confirmed、delivered、disputed)不算時間點', () => {
    const map = firstDealEventAt([
      ev('b', 'confirmed', '2026-07-02T12:00:00Z'),
      ev('b', 'delivered', '2026-07-03T12:00:00Z'),
      ev('b', 'disputed', '2026-07-04T12:00:00Z'),
    ]);
    expect(map.has('b')).toBe(false);
  });

  // 目前的定義只看狀態,closed 一律算成交;爭議直接結案算不算成交待業主決定(見 metrics.ts 檔頭)
  it('爭議後由管理員結案(disputed → closed):照目前定義算成交,以結案時間認列', () => {
    const map = firstDealEventAt([
      ev('c', 'disputed', '2026-07-27T18:00:00Z'),
      ev('c', 'closed', '2026-08-02T09:00:00Z'),
    ]);
    expect(map.get('c')).toBe('2026-08-02T09:00:00Z');
  });

  it('時間格式不同也照時間先後比(不是字串比)', () => {
    const map = firstDealEventAt([
      ev('d', 'reviewed', '2026-07-05T01:00:00+08:00'), // = 07-04T17:00Z
      ev('d', 'received', '2026-07-04T18:00:00Z'),
    ]);
    expect(map.get('d')).toBe('2026-07-05T01:00:00+08:00');
  });

  it('壞掉的時間略過', () => {
    const map = firstDealEventAt([ev('e', 'received', 'not-a-date'), ev('e', 'reviewed', '2026-07-05T00:00:00Z')]);
    expect(map.get('e')).toBe('2026-07-05T00:00:00Z');
  });

  it('沒有事件的舊資料退回建立時間', () => {
    const map = firstDealEventAt([ev('f', 'received', '2026-07-17T12:00:00Z')]);
    expect(dealRecognizedAt({ id: 'f', created_at: '2026-07-14T10:00:00Z' }, map)).toBe('2026-07-17T12:00:00Z');
    expect(dealRecognizedAt({ id: 'legacy', created_at: '2026-06-09T06:17:15Z' }, map)).toBe('2026-06-09T06:17:15Z');
  });
});

describe('localMonthKey —— 本地時區的年月', () => {
  it('用本地時間分月(月初清晨的單不會跑到上個月)', () => {
    const earlyMorning = new Date(2026, 8, 1, 0, 30); // 本地 9/1 00:30
    expect(localMonthKey(earlyMorning.toISOString())).toBe('2026-09');
    const lastMinute = new Date(2026, 7, 31, 23, 59);
    expect(localMonthKey(lastMinute.toISOString())).toBe('2026-08');
  });

  it('空值或壞掉的時間回 null', () => {
    expect(localMonthKey(null)).toBeNull();
    expect(localMonthKey(undefined)).toBeNull();
    expect(localMonthKey('')).toBeNull();
    expect(localMonthKey('nope')).toBeNull();
  });
});
