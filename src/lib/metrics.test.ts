// src/lib/metrics.ts 的規格測試:全站「成交／GMV」與「採購金額／訂單金額」的唯一定義(業主拍板 Q5-A)。
// 這支測試就是定義本身 —— 每一種訂單狀態歸哪一類都逐一寫死在下面,改定義要先改這裡。
// 2026-09-29 業主決定:已結案(closed)只有「曾經進過 received」才算成交;爭議直接結案不算成交,但仍算採購金額。

import { describe, expect, it, vi } from 'vitest';

// orders.ts 會載入 supabase client;這裡只要它的狀態表與轉移表,不需要(也不准)連線
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { ORDER_STATUS, allowedTransitions, type ActorRole, type OrderStatus } from '@/lib/orders';
import {
  DEAL_EVENT_STATUSES,
  DEAL_STATUSES,
  EXCLUDED_ORDER_STATUSES,
  IN_PROGRESS_STATUSES,
  METRIC_CLASS,
  ORDER_STATUSES,
  RECEIPT_EVENT_STATUSES,
  RECEIPT_REQUIRED_STATUSES,
  averageDealAmount,
  countDeals,
  countOrders,
  countedOrders,
  dealLedger,
  dealOrders,
  dealRecognizedAt,
  fetchAllPages,
  PAGE_SIZE,
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

/** 業主拍板的定義,逐一列出(這張表就是驗收標準) */
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
  closed: 'deal_if_received', // 收過貨才算成交;爭議直接結案只算採購金額(業主 2026-09-29 決定)
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
const ROLES: ActorRole[] = ['restaurant', 'supplier', 'admin', 'system'];

/** 每種狀態一張單,金額是 2 的次方 —— 任何一組狀態的加總都獨一無二,算錯哪一種一看就知道 */
const MATRIX = ALL_STATUSES.map((status, i) => ({
  id: `order-${status}`,
  status,
  total_amount: 2 ** i,
  created_at: '2026-09-10T02:00:00Z',
}));
const amountOf = (status: OrderStatus) => 2 ** ALL_STATUSES.indexOf(status);
const sumOf = (statuses: readonly OrderStatus[]) => statuses.reduce((s, st) => s + amountOf(st), 0);

const ev = (order_id: string, to_status: string, created_at = '2026-09-11T02:00:00Z') => ({
  order_id,
  to_status,
  created_at,
});
/** 沒有任何事件的帳本(closed 一律不算) */
const NO_EVENTS = dealLedger([]);
/** 矩陣裡那張 closed 收過貨 */
const CLOSED_RECEIVED = dealLedger([ev('order-closed', 'received'), ev('order-closed', 'closed')]);

describe('狀態歸類 —— 每一種狀態都有明確歸屬', () => {
  it('orders.ts 的每一種狀態都有歸類,也沒有多出不存在的狀態', () => {
    expect(Object.keys(METRIC_CLASS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(ALL_STATUSES).toHaveLength(20);
  });

  it.each(ALL_STATUSES)('%s 的歸類符合業主定義', (status) => {
    const cls = EXPECTED[status];
    expect(metricClassOf(status)).toBe(cls);
    expect(isCountedOrder(status)).toBe(cls !== 'excluded');
    expect(isInProgress(status)).toBe(cls === 'in_progress');
    // 成交:deal 不管帳本都算;deal_if_received 只有帳本裡收過貨才算;其他都不算
    const order = { id: `x-${status}`, status };
    const received = dealLedger([ev(order.id, 'received')]);
    expect(isDeal(order, NO_EVENTS)).toBe(cls === 'deal');
    expect(isDeal(order, received)).toBe(cls === 'deal' || cls === 'deal_if_received');
  });

  it('一定算成交 = received、reviewed、completed;收過貨才算 = closed', () => {
    expect([...DEAL_STATUSES]).toEqual(['received', 'reviewed', 'completed']);
    expect([...RECEIPT_REQUIRED_STATUSES]).toEqual(['closed']);
  });

  it('不算訂單 = draft、rejected、cancelled、expired;其餘 16 種(含 closed)都算採購 / 訂單', () => {
    expect([...EXCLUDED_ORDER_STATUSES].sort()).toEqual(['cancelled', 'draft', 'expired', 'rejected']);
    expect(ORDER_STATUSES).toHaveLength(16);
    expect(ORDER_STATUSES).toContain('closed');
    expect([...ORDER_STATUSES].sort()).toEqual(
      ALL_STATUSES.filter((s) => !EXCLUDED_ORDER_STATUSES.includes(s)).sort(),
    );
  });

  it('四類剛好切分全部狀態;在途不含 closed', () => {
    const union = [...EXCLUDED_ORDER_STATUSES, ...IN_PROGRESS_STATUSES, ...DEAL_STATUSES, ...RECEIPT_REQUIRED_STATUSES];
    expect([...union].sort()).toEqual([...ALL_STATUSES].sort());
    expect(new Set(union).size).toBe(ALL_STATUSES.length); // 沒有重複歸類
    expect(IN_PROGRESS_STATUSES).toHaveLength(12);
    expect(IN_PROGRESS_STATUSES).not.toContain('closed');
  });

  it('收貨事件 = received、reviewed;頁面要查的事件再加上舊資料的 completed', () => {
    expect([...RECEIPT_EVENT_STATUSES]).toEqual(['received', 'reviewed']);
    expect([...DEAL_EVENT_STATUSES]).toEqual(['received', 'reviewed', 'completed']);
    expect(DEAL_EVENT_STATUSES).not.toContain('closed'); // 結案事件本身不證明收過貨
  });

  it('狀態集合是唯讀的,別處改不動', () => {
    [DEAL_STATUSES, RECEIPT_REQUIRED_STATUSES, ORDER_STATUSES, EXCLUDED_ORDER_STATUSES, IN_PROGRESS_STATUSES,
      RECEIPT_EVENT_STATUSES, DEAL_EVENT_STATUSES].forEach((set) => expect(Object.isFrozen(set)).toBe(true));
  });
});

describe('對照轉移規則(20260929100000_order_transition_rules.sql / orders.ts 的 TRANSITIONS)', () => {
  const into = (target: OrderStatus) =>
    ROLES.flatMap((role) =>
      ALL_STATUSES.filter((from) => allowedTransitions(role, from).includes(target)).map((from) => ({ role, from })),
    );

  it('能結案的來路只有「收貨後」(received / reviewed)與「爭議直接結案」(discrepancy / disputed)', () => {
    const froms = [...new Set(into('closed').map((t) => t.from))].sort();
    expect(froms).toEqual(['discrepancy', 'disputed', 'received', 'reviewed']);
    // 爭議直接結案是管理員 / 系統的動作
    into('closed')
      .filter((t) => t.from === 'discrepancy' || t.from === 'disputed')
      .forEach((t) => expect(['admin', 'system']).toContain(t.role));
  });

  it('reviewed 只能從 received 來 —— 所以 reviewed 事件也證明收過貨', () => {
    expect([...new Set(into('reviewed').map((t) => t.from))]).toEqual(['received']);
  });

  it('進 received 的來路:待收貨(餐廳收貨),或爭議後管理員 / 系統判定有收到', () => {
    const froms = [...new Set(into('received').map((t) => t.from))].sort();
    expect(froms).toEqual(['delivered', 'discrepancy', 'disputed']);
    into('received')
      .filter((t) => t.from !== 'delivered')
      .forEach((t) => expect(['admin', 'system']).toContain(t.role));
  });
});

describe('收貨帳本 dealLedger', () => {
  it('收過貨 = 有 to_status = received 或 reviewed 的事件', () => {
    const ledger = dealLedger([
      ev('a', 'received'),
      ev('b', 'reviewed'),
      ev('c', 'closed'),
      ev('d', 'disputed'),
      ev('e', 'completed'),
      ev('f', 'delivered'),
    ]);
    expect([...ledger.received].sort()).toEqual(['a', 'b']);
  });

  it('成交時間 = 第一筆 received / reviewed / completed 事件(結案事件不算)', () => {
    const ledger = dealLedger([
      ev('a', 'closed', '2026-07-06T10:00:00Z'),
      ev('a', 'received', '2026-07-04T11:00:00Z'),
      ev('a', 'reviewed', '2026-07-05T10:00:00Z'),
      ev('c', 'closed', '2026-08-02T09:00:00Z'),
    ]);
    expect(ledger.firstDealAt.get('a')).toBe('2026-07-04T11:00:00Z');
    expect(ledger.firstDealAt.has('c')).toBe(false);
  });

  it('時間格式不同也照時間先後比(不是字串比);壞掉的時間略過', () => {
    const ledger = dealLedger([
      ev('d', 'reviewed', '2026-07-05T01:00:00+08:00'), // = 07-04T17:00Z
      ev('d', 'received', '2026-07-04T18:00:00Z'),
      ev('e', 'received', 'not-a-date'),
      ev('e', 'reviewed', '2026-07-05T00:00:00Z'),
    ]);
    expect(ledger.firstDealAt.get('d')).toBe('2026-07-05T01:00:00+08:00');
    expect(ledger.firstDealAt.get('e')).toBe('2026-07-05T00:00:00Z');
    expect(ledger.received.has('e')).toBe(true); // 時間壞了,但收過貨這件事還是成立
  });

  it('沒有事件的舊資料:成交時間退回建立時間', () => {
    const ledger = dealLedger([ev('f', 'received', '2026-07-17T12:00:00Z')]);
    expect(dealRecognizedAt({ id: 'f', created_at: '2026-07-14T10:00:00Z' }, ledger)).toBe('2026-07-17T12:00:00Z');
    expect(dealRecognizedAt({ id: 'legacy', created_at: '2026-06-09T06:17:15Z' }, ledger)).toBe('2026-06-09T06:17:15Z');
  });

  it('空事件:帳本是空的', () => {
    expect(NO_EVENTS.received.size).toBe(0);
    expect(NO_EVENTS.firstDealAt.size).toBe(0);
  });
});

describe('已結案(closed)算不算成交 —— 看有沒有收過貨', () => {
  const closed = { id: 'o1', status: 'closed', total_amount: 11000, created_at: '2026-07-27T16:52:28Z' };

  it.each([
    ['收貨後結案:received → closed', [ev('o1', 'received'), ev('o1', 'closed')], true],
    ['收貨、評價後結案:received → reviewed → closed', [ev('o1', 'received'), ev('o1', 'reviewed'), ev('o1', 'closed')], true],
    ['爭議後判定有收到再結案:disputed → received → closed', [ev('o1', 'disputed'), ev('o1', 'received'), ev('o1', 'closed')], true],
    ['爭議直接結案:discrepancy → disputed → closed', [ev('o1', 'discrepancy'), ev('o1', 'disputed'), ev('o1', 'closed')], false],
    ['收貨有差異直接結案:discrepancy → closed', [ev('o1', 'discrepancy'), ev('o1', 'closed')], false],
    ['沒有任何事件紀錄的舊資料', [], false],
    ['別張單收過貨不算數', [ev('other', 'received'), ev('o1', 'closed')], false],
  ])('%s → 成交 %s', (_label, events, expected) => {
    const ledger = dealLedger(events);
    expect(isDeal(closed, ledger)).toBe(expected);
    expect(sumGmv([closed], ledger)).toBe(expected ? 11000 : 0);
    // 不管收過貨沒:都算採購金額 / 訂單數,都不算在途
    expect(sumOrderAmount([closed])).toBe(11000);
    expect(countOrders([closed])).toBe(1);
    expect(sumInProgressAmount([closed])).toBe(0);
  });
});

describe('邊界 —— 最容易算錯的幾個狀態', () => {
  const row = (status: string) => ({ id: `b-${status}`, status });
  const receivedAll = (status: string) => dealLedger([ev(`b-${status}`, 'received')]);

  it('confirmed(餐廳確認報價)、delivered(供應商說送到了)都還不是成交,即使事件亂填也一樣', () => {
    for (const s of ['confirmed', 'delivered']) {
      expect(isDeal(row(s), receivedAll(s))).toBe(false);
      expect(isCountedOrder(s)).toBe(true);
    }
  });

  it('received / reviewed / completed 不需要事件也算成交(狀態本身就是收過貨)', () => {
    for (const s of ['received', 'reviewed', 'completed']) expect(isDeal(row(s), NO_EVENTS)).toBe(true);
  });

  it('收貨有差異 / 爭議中:餐廳沒確認收貨 → 不是成交,但仍是有效訂單、算在途', () => {
    for (const s of ['discrepancy', 'disputed']) {
      expect(isDeal(row(s), receivedAll(s))).toBe(false);
      expect(isCountedOrder(s)).toBe(true);
      expect(isInProgress(s)).toBe(true);
    }
  });

  it('草稿與取消單不算訂單 —— 管理員餐廳管理、餐廳我的供應商的舊算法把它們算進去', () => {
    for (const s of ['draft', 'cancelled', 'rejected', 'expired']) {
      expect(isCountedOrder(s)).toBe(false);
      expect(isDeal(row(s), receivedAll(s))).toBe(false);
    }
  });

  it('舊資料狀態:pending / sent 算有效訂單,completed 算成交', () => {
    expect(isCountedOrder('pending')).toBe(true);
    expect(isCountedOrder('sent')).toBe(true);
    expect(isDeal(row('pending'), NO_EVENTS)).toBe(false);
    expect(isDeal(row('sent'), NO_EVENTS)).toBe(false);
  });

  it.each([null, undefined, '', 'RECEIVED', ' received', 'paid', 'toString', '__proto__'])(
    '未知狀態 %j:兩邊都不算(寧可少算,不灌水)',
    (status) => {
      const s = status as string | null | undefined;
      expect(metricClassOf(s)).toBeNull();
      expect(isDeal({ id: 'u', status: s ?? null }, dealLedger([ev('u', 'received')]))).toBe(false);
      expect(isCountedOrder(s)).toBe(false);
      expect(isInProgress(s)).toBe(false);
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
  it('GMV:closed 收過貨 → received + reviewed + closed + completed', () => {
    expect(sumGmv(MATRIX, CLOSED_RECEIVED)).toBe(sumOf(['received', 'reviewed', 'closed', 'completed']));
    expect(countDeals(MATRIX, CLOSED_RECEIVED)).toBe(4);
    expect(dealOrders(MATRIX, CLOSED_RECEIVED).map((o) => o.status)).toEqual(['received', 'reviewed', 'closed', 'completed']);
  });

  it('GMV:closed 沒收過貨 → 不算,只剩 received + reviewed + completed', () => {
    expect(sumGmv(MATRIX, NO_EVENTS)).toBe(sumOf(['received', 'reviewed', 'completed']));
    expect(countDeals(MATRIX, NO_EVENTS)).toBe(3);
  });

  it('採購金額 / 訂單金額 = 全部扣掉草稿、取消、拒單、逾時(不看帳本,closed 都算)', () => {
    const all = sumOf(ALL_STATUSES);
    expect(sumOrderAmount(MATRIX)).toBe(all - sumOf(['draft', 'cancelled', 'rejected', 'expired']));
    expect(countOrders(MATRIX)).toBe(16);
    expect(countedOrders(MATRIX).map((o) => o.status)).toContain('closed');
    expect(countedOrders(MATRIX).map((o) => o.status)).not.toContain('draft');
  });

  it('在途 = 採購金額 − GMV − 已結案(closed 不管收過貨沒都不算在途)', () => {
    expect(inProgressOrders(MATRIX)).toHaveLength(12);
    expect(sumInProgressAmount(MATRIX)).toBe(
      sumOrderAmount(MATRIX) - sumOf(['received', 'reviewed', 'completed', 'closed']),
    );
  });

  it('還沒報價(金額 null)的成交單:算成交單數,金額以 0 計', () => {
    const rows = [
      { id: 'n1', status: 'received', total_amount: null },
      { id: 'n2', status: 'closed', total_amount: 500 },
    ];
    const ledger = dealLedger([ev('n2', 'received')]);
    expect(countDeals(rows, ledger)).toBe(2);
    expect(sumGmv(rows, ledger)).toBe(500);
  });

  it('平均成交金額:分母只算有金額的成交單;沒收過貨的 closed、非成交單都不影響', () => {
    const rows = [
      { id: 'p1', status: 'received', total_amount: 1000 },
      { id: 'p2', status: 'reviewed', total_amount: 3000 },
      { id: 'p3', status: 'closed', total_amount: null }, //   收過貨但沒金額:不拉低平均
      { id: 'p4', status: 'completed', total_amount: 0 }, //   金額 0:同上
      { id: 'p5', status: 'closed', total_amount: 99999 }, //  爭議直接結案:不是成交
      { id: 'p6', status: 'delivered', total_amount: 99999 }, // 還沒成交
      { id: 'p7', status: 'cancelled', total_amount: 99999 },
    ];
    const ledger = dealLedger([ev('p3', 'received'), ev('p5', 'disputed'), ev('p5', 'closed')]);
    expect(pricedDeals(rows, ledger)).toHaveLength(2);
    expect(averageDealAmount(rows, ledger)).toBe(2000);
  });

  it('空資料:全部是 0,不會 NaN', () => {
    expect(sumGmv([], NO_EVENTS)).toBe(0);
    expect(countDeals([], NO_EVENTS)).toBe(0);
    expect(sumOrderAmount([])).toBe(0);
    expect(countOrders([])).toBe(0);
    expect(sumInProgressAmount([])).toBe(0);
    expect(averageDealAmount([], NO_EVENTS)).toBe(0);
    expect(pricedDeals([], NO_EVENTS)).toEqual([]);
  });

  it('只有不算的單:GMV 與採購金額都是 0', () => {
    const rows = ['draft', 'cancelled', 'rejected', 'expired'].map((status) => ({ id: status, status, total_amount: 100 }));
    const ledger = dealLedger(rows.map((r) => ev(r.id, 'received')));
    expect(sumGmv(rows, ledger)).toBe(0);
    expect(sumOrderAmount(rows)).toBe(0);
    expect(averageDealAmount(rows, ledger)).toBe(0);
  });

  it('任何資料下:成交 ≤ 採購(成交是子集合)', () => {
    for (const ledger of [NO_EVENTS, CLOSED_RECEIVED]) {
      expect(countDeals(MATRIX, ledger)).toBeLessThanOrEqual(countOrders(MATRIX));
      expect(sumGmv(MATRIX, ledger)).toBeLessThanOrEqual(sumOrderAmount(MATRIX));
    }
  });
});

describe('正式庫情境(2026-09-29 唯讀匯出的 7 張單與收貨相關事件)', () => {
  const ORDERS = [
    { id: '6b50229d-d1b6-4217-8ebb-d547b086f975', status: 'pending', total_amount: null, created_at: '2026-06-09T06:17:15Z' },
    { id: '500143e5-05ab-4035-befb-c2ee3115391a', status: 'closed', total_amount: 6900, created_at: '2026-07-01T10:00:35Z' },
    { id: 'c2177e2a-bb32-4d58-8933-c61bb4b4764f', status: 'received', total_amount: 3250, created_at: '2026-07-14T10:00:35Z' },
    { id: 'dcdf26f3-58c3-4ade-acba-ab6bba49c8ec', status: 'received', total_amount: 8400, created_at: '2026-07-20T10:00:35Z' },
    { id: 'a1e337b0-de8c-4e65-b22a-ca76edcf4143', status: 'delivered', total_amount: 1800, created_at: '2026-07-23T10:00:35Z' },
    { id: '99999999-0000-0000-0000-000000000001', status: 'disputed', total_amount: 11000, created_at: '2026-07-27T16:52:28Z' },
    { id: '45e87158-0e81-4ade-be31-559dc3439760', status: 'submitted', total_amount: null, created_at: '2026-07-28T11:13:34Z' },
  ];
  const EVENTS = [
    ev('500143e5-05ab-4035-befb-c2ee3115391a', 'received', '2026-07-04T11:00:35Z'),
    ev('500143e5-05ab-4035-befb-c2ee3115391a', 'reviewed', '2026-07-05T10:00:35Z'),
    ev('500143e5-05ab-4035-befb-c2ee3115391a', 'closed', '2026-07-06T10:00:35Z'),
    ev('c2177e2a-bb32-4d58-8933-c61bb4b4764f', 'received', '2026-07-17T12:00:35Z'),
    ev('dcdf26f3-58c3-4ade-acba-ab6bba49c8ec', 'received', '2026-07-26T10:27:53Z'),
    ev('99999999-0000-0000-0000-000000000001', 'discrepancy', '2026-07-27T18:23:43Z'),
    ev('99999999-0000-0000-0000-000000000001', 'disputed', '2026-07-27T18:23:43Z'),
  ];
  const DISPUTED_ID = '99999999-0000-0000-0000-000000000001';

  it('現在:GMV NT$18,550(3 筆,已結案那張收過貨)、採購金額 NT$31,350、在途 NT$12,800 —— 跟改之前一樣', () => {
    const ledger = dealLedger(EVENTS);
    expect(sumGmv(ORDERS, ledger)).toBe(18550);
    expect(countDeals(ORDERS, ledger)).toBe(3);
    expect(sumOrderAmount(ORDERS)).toBe(31350);
    expect(sumInProgressAmount(ORDERS)).toBe(12800);
  });

  it('假設 NT$11,000 那張爭議單被管理員直接結案(disputed → closed):GMV 不變,採購金額不變,在途少 11,000', () => {
    const orders = ORDERS.map((o) => (o.id === DISPUTED_ID ? { ...o, status: 'closed' } : o));
    const ledger = dealLedger([...EVENTS, ev(DISPUTED_ID, 'closed', '2026-09-30T02:00:00Z')]);
    expect(sumGmv(orders, ledger)).toBe(18550); // 只看狀態的舊規則會變成 29,550
    expect(countDeals(orders, ledger)).toBe(3);
    expect(sumOrderAmount(orders)).toBe(31350);
    expect(sumInProgressAmount(orders)).toBe(1800);
    // 對照:只看狀態的舊規則
    const statusOnly = orders.filter((o) => ['received', 'reviewed', 'closed', 'completed'].includes(o.status));
    expect(statusOnly.reduce((s, o) => s + orderAmount(o), 0)).toBe(29550);
  });

  it('假設管理員判定有收到(disputed → received)再結案:算成交,GMV 29,550,算在判定收到的那天', () => {
    const orders = ORDERS.map((o) => (o.id === DISPUTED_ID ? { ...o, status: 'closed' } : o));
    const ledger = dealLedger([
      ...EVENTS,
      ev(DISPUTED_ID, 'received', '2026-09-30T02:00:00Z'),
      ev(DISPUTED_ID, 'closed', '2026-10-01T02:00:00Z'),
    ]);
    expect(sumGmv(orders, ledger)).toBe(29550);
    expect(dealRecognizedAt(orders.find((o) => o.id === DISPUTED_ID)!, ledger)).toBe('2026-09-30T02:00:00Z');
  });
});

describe('fetchAllPages —— 收貨事件要讀完整(PostgREST 一次最多 1000 筆)', () => {
  /** 假的分頁查詢:照 (from, to) 切陣列;cap 模擬伺服器的 max rows */
  const pager = (total: number, cap = PAGE_SIZE) => {
    const all = Array.from({ length: total }, (_, i) => i);
    const calls: [number, number][] = [];
    const page = (from: number, to: number) => {
      calls.push([from, to]);
      return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + cap)), error: null });
    };
    return { page, calls };
  };

  it('沒有資料:問一次就停', async () => {
    const { page, calls } = pager(0);
    expect(await fetchAllPages(page)).toEqual({ data: [], error: null });
    expect(calls).toEqual([[0, PAGE_SIZE - 1]]);
  });

  it('2,500 筆:從已讀到的筆數接著讀,讀到空的一頁才停,一筆不漏也不重複', async () => {
    const { page, calls } = pager(2500);
    const res = await fetchAllPages(page);
    expect(res.error).toBeNull();
    expect(res.data).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
  });

  it('剛好 1,000 筆的整數倍也會讀完', async () => {
    const res = await fetchAllPages(pager(2000).page);
    expect(res.data).toHaveLength(2000);
  });

  it('伺服器上限比 PAGE_SIZE 小(例如 400)也不會漏', async () => {
    const res = await fetchAllPages(pager(1000, 400).page);
    expect(res.data).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });

  it('中途失敗:回傳錯誤,資料給空陣列(不給半套)', async () => {
    let n = 0;
    const res = await fetchAllPages((from: number) => {
      n += 1;
      return Promise.resolve(
        n === 2
          ? { data: null, error: { message: 'boom' } }
          : { data: Array.from({ length: PAGE_SIZE }, (_, i) => from + i), error: null },
      );
    });
    expect(res.error).toEqual({ message: 'boom' });
    expect(res.data).toEqual([]);
  });

  it('查詢寫錯(每頁都回一樣的東西)時不會無限迴圈', async () => {
    const res = await fetchAllPages(() => Promise.resolve({ data: [1], error: null }));
    expect(res.error?.message).toMatch(/沒有讀完/);
    expect(res.data).toEqual([]);
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
