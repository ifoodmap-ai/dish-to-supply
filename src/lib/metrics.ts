// 全站「成交／GMV」與「採購金額／訂單金額」的唯一定義(業主拍板:後台精簡 Q5-A)。
//
// 兩個詞、兩套規則,畫面上不可以混用:
//
//   成交 / GMV        餐廳確認收貨之後才算:
//                       received(待評價)、reviewed(已評價)、completed(舊資料「已完成」)
//                       closed(已結案)—— 只有「曾經進過 received」的才算(業主 2026-09-29 決定)
//                     「received 只有餐廳能觸發」(orders.ts 的 TRANSITIONS)—— 這就是 GMV 可信的原因。
//                     供應商推到 delivered(待收貨)、餐廳確認報價 confirmed(待出貨)都還不是成交。
//
//   採購金額 / 訂單金額 排除 draft(草稿)、cancelled(已取消)、rejected(供應商拒單)、expired(逾時未回應),
//   (含「訂單數」       其他狀態都算 —— 包含進行中的單、收貨有差異／爭議中的單、全部成交單,
//    「合作單數」)      以及爭議直接結案、沒收過貨的單。
//
// 成交是採購的子集合:每一筆成交也都算在採購金額裡。
//
// 已結案(closed)怎麼判斷「收過貨」:
//   closed 有兩條來路(20260929100000_order_transition_rules.sql 的轉移表):
//     - 收貨後結案:received → closed、reviewed → closed(reviewed 只能從 received 來)
//     - 爭議直接結案:discrepancy → closed、disputed → closed(管理員 / 系統),餐廳從沒按收貨
//   supplier_orders 沒有欄位分得出這兩種(delivery_receipts 是選填的送貨單照片,不是收貨紀錄),
//   所以看訂單事件履歷:有一筆 to_status = received 或 reviewed 的 order_events,就是收過貨。
//   爭議後管理員判定「有收到」(discrepancy / disputed → received)也是進過 received,之後結案照樣算成交。
//   沒有任何收貨事件的 closed(爭議直接結案,或沒有事件紀錄的舊資料)一律不算成交 —— 寧可少算,不灌水。
//   → 用到成交的頁面都要讀 order_events(DEAL_EVENT_STATUSES),丟給 dealLedger() 做成帳本,再傳給下面的函式。
//
// 規則:
//   - 各頁一律從這裡取狀態集合與計算函式,不要再自己寫一份狀態清單(metrics.guard.test.ts 會掃原始碼擋)。
//   - 狀態的顯示名稱在 src/lib/orders.ts 的 ORDER_STATUS;這裡只管「算不算」。
//     OrderStatus 新增一種狀態時:tsc 會在下面的 METRIC_CLASS 報錯(Record 必須列齊;但 CI 的 tsc 目前只報告不擋),
//     真正會讓 CI 變紅的是 metrics.test.ts 的「每一種狀態都有歸類」—— 請先決定它歸哪一類。
//   - 資料庫裡沒有另外彙總這些數字的 view 或 RPC。order_pipeline 是看板用的逐列清單
//     (排除 closed / cancelled / rejected,沒有加總),不是 GMV 也不是採購金額。

import type { OrderStatus } from '@/lib/orders';

/** 一種狀態在金額指標裡的歸類 */
export type MetricClass =
  /** 不算訂單:不進採購金額、也不進成交 */
  | 'excluded'
  /** 有效訂單、還沒結束、餐廳還沒確認收貨:算採購金額,不算成交,算在途 */
  | 'in_progress'
  /** 成交:算 GMV,也算採購金額 */
  | 'deal'
  /** 已結案:收過貨才算成交;沒收過貨(爭議直接結案)只算採購金額。兩種都不算在途 */
  | 'deal_if_received';

/** 每一種訂單狀態歸哪一類 —— 全站只有這一份 */
export const METRIC_CLASS: Readonly<Record<OrderStatus, MetricClass>> = {
  draft: 'excluded', //              草稿:還沒送出
  submitted: 'in_progress', //       待派發
  dispatched: 'in_progress', //      待接單
  accepted: 'in_progress', //        待報價
  quoted: 'in_progress', //          待確認
  confirmed: 'in_progress', //       待出貨 —— 餐廳確認報價不等於成交
  shipped: 'in_progress', //         已出貨
  in_transit: 'in_progress', //      運送中
  delivered: 'in_progress', //       待收貨 —— 供應商說送到了,餐廳還沒確認,不算成交
  received: 'deal', //               待評價 —— 餐廳確認收貨,從這裡開始算成交
  reviewed: 'deal', //               已評價(只能從 received 來)
  closed: 'deal_if_received', //     已結案 —— 收過貨才算成交(見檔頭)
  rejected: 'excluded', //           供應商拒單
  discrepancy: 'in_progress', //     收貨有差異 —— 餐廳沒有確認收貨,不算成交;仍是有效訂單
  disputed: 'in_progress', //        爭議中 —— 同上
  cancelled: 'excluded', //          已取消
  expired: 'excluded', //            逾時未回應
  pending: 'in_progress', //         舊資料「待處理」
  sent: 'in_progress', //            舊資料「已派發」
  completed: 'deal', //              舊資料「已完成」
};

const statusesOf = (...classes: MetricClass[]): readonly OrderStatus[] =>
  Object.freeze(
    (Object.keys(METRIC_CLASS) as OrderStatus[]).filter((s) => classes.includes(METRIC_CLASS[s])),
  );

/** 一定算成交的狀態:received、reviewed、completed */
export const DEAL_STATUSES = statusesOf('deal');

/** 收過貨才算成交的狀態:closed */
export const RECEIPT_REQUIRED_STATUSES = statusesOf('deal_if_received');

/** 不算訂單的狀態(不進採購金額、也不進成交):draft、rejected、cancelled、expired */
export const EXCLUDED_ORDER_STATUSES = statusesOf('excluded');

/** 算進採購金額 / 訂單金額 / 訂單數的狀態(= 全部狀態扣掉 EXCLUDED_ORDER_STATUSES,含 closed) */
export const ORDER_STATUSES = statusesOf('in_progress', 'deal', 'deal_if_received');

/** 在途:有效、還沒結束、還沒收貨的狀態(不含 closed) */
export const IN_PROGRESS_STATUSES = statusesOf('in_progress');

/** 證明「收過貨」的事件:進入 received;reviewed 只能從 received 來,也算 */
export const RECEIPT_EVENT_STATUSES: readonly OrderStatus[] = Object.freeze(['received', 'reviewed']);

/**
 * 用到成交的頁面要讀的訂單事件(order_events.to_status in …):
 * 收貨事件(判斷 closed 收過貨沒、成交算在哪天),加上舊資料的 completed。
 */
export const DEAL_EVENT_STATUSES: readonly OrderStatus[] = Object.freeze([
  ...RECEIPT_EVENT_STATUSES,
  'completed',
]);

/**
 * 一個狀態字串歸哪一類;不是已知狀態(null、空字串、打錯字)就回 null。
 * 資料庫的 CHECK 限制讓 status 不可能是未知值,真遇到了就兩邊都不算,寧可少算也不要灌水。
 */
export const metricClassOf = (status: string | null | undefined): MetricClass | null =>
  status != null && Object.prototype.hasOwnProperty.call(METRIC_CLASS, status)
    ? METRIC_CLASS[status as OrderStatus]
    : null;

/** 算不算訂單(採購金額 / 訂單金額 / 訂單數)—— 只看狀態,closed 不管收過貨沒都算 */
export const isCountedOrder = (status: string | null | undefined): boolean => {
  const c = metricClassOf(status);
  return c === 'deal' || c === 'in_progress' || c === 'deal_if_received';
};

/** 在途(有效、還沒結束、還沒收貨)—— 只看狀態 */
export const isInProgress = (status: string | null | undefined): boolean =>
  metricClassOf(status) === 'in_progress';

/* --------------------------------------------------------------------------
 * 收貨帳本:從訂單事件算出「哪些單收過貨」與「每張單成交的時間」
 * ------------------------------------------------------------------------ */

export interface StatusEventRow {
  order_id: string;
  to_status: string | null;
  created_at: string;
}

export interface DealLedger {
  /** 曾經進過 received 的訂單 id(有 to_status = received / reviewed 的事件) */
  readonly received: ReadonlySet<string>;
  /** 每張單第一次進入成交狀態的事件時間(原字串),成交算在這一天 */
  readonly firstDealAt: ReadonlyMap<string, string>;
}

/**
 * 用訂單事件做成收貨帳本。events 至少要有 DEAL_EVENT_STATUSES 這幾種(多給其他狀態的事件沒關係,會略過)。
 * 事件讀不到時傳空陣列:closed 的單會一律不算成交、成交時間退回訂單建立時間 —— 頁面上要提示。
 */
export const dealLedger = (events: readonly StatusEventRow[]): DealLedger => {
  const received = new Set<string>();
  const firstDealAt = new Map<string, string>();
  events.forEach((e) => {
    const to = e.to_status;
    if (to == null || !(DEAL_EVENT_STATUSES as readonly string[]).includes(to)) return;
    if ((RECEIPT_EVENT_STATUSES as readonly string[]).includes(to)) received.add(e.order_id);
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) return;
    const prev = firstDealAt.get(e.order_id);
    if (prev == null || t < Date.parse(prev)) firstDealAt.set(e.order_id, e.created_at);
  });
  return { received, firstDealAt };
};

/* --------------------------------------------------------------------------
 * 把事件讀完整:PostgREST 一次最多回 1000 筆(Supabase 的 max rows),超過的會被截掉,
 * 截掉的收貨事件會讓已結案的單悄悄不算成交 —— 所以收貨事件一律用 fetchAllPages 分頁讀完。
 * ------------------------------------------------------------------------ */

/** 每頁要幾筆(= Supabase 預設的 max rows) */
export const PAGE_SIZE = 1000;
/** 保險:最多翻幾頁(20 萬筆),避免查詢寫錯時無限迴圈 */
const MAX_PAGES = 200;

/**
 * 分頁把一個查詢讀完。page(from, to) 要回傳加上 `.range(from, to)` 的查詢,
 * 而且排序要固定(例如 created_at 再加 id),不然翻頁時可能重複或漏掉。
 * 每次從「已經讀到的筆數」接著讀,讀到空的一頁才停 —— 就算伺服器的上限比 PAGE_SIZE 小也不會漏。
 * 中途失敗就回傳錯誤、資料給空陣列(半套資料會讓部分已結案的單算、部分不算,乾脆不給,以免被誤用)。
 */
export const fetchAllPages = async <T, E extends { message?: string }>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
): Promise<{ data: T[]; error: E | { message: string } | null }> => {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const from = rows.length;
    const res = await page(from, from + PAGE_SIZE - 1);
    if (res.error) return { data: [], error: res.error };
    const batch = res.data ?? [];
    if (batch.length === 0) return { data: rows, error: null };
    rows.push(...batch);
  }
  return { data: [], error: { message: `資料超過 ${MAX_PAGES} 頁(${MAX_PAGES * PAGE_SIZE} 筆),沒有讀完` } };
};

/* --------------------------------------------------------------------------
 * 從訂單列計算
 * ------------------------------------------------------------------------ */

export interface StatusRow {
  status: string | null;
}

export interface AmountRow extends StatusRow {
  total_amount?: number | string | null;
}

/** 判斷成交要看是哪一張單(closed 要查帳本) */
export interface DealRow extends StatusRow {
  id: string;
}

/** 一張單的金額:還沒報價(null)或不是數字 → 0 */
export const orderAmount = (row: { total_amount?: number | string | null }): number => {
  const n = Number(row.total_amount ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const sumAmount = (rows: readonly { total_amount?: number | string | null }[]): number =>
  rows.reduce((s, r) => s + orderAmount(r), 0);

/**
 * 這張單算不算成交 / GMV:received、reviewed、completed 一定算;
 * closed 要帳本裡有它的收貨事件;其他狀態都不算。
 */
export const isDeal = (order: DealRow, ledger: DealLedger): boolean => {
  const c = metricClassOf(order.status);
  if (c === 'deal') return true;
  if (c === 'deal_if_received') return ledger.received.has(order.id);
  return false;
};

/** 成交的單 */
export const dealOrders = <T extends DealRow>(rows: readonly T[], ledger: DealLedger): T[] =>
  rows.filter((r) => isDeal(r, ledger));

/** 算進採購 / 訂單的單 */
export const countedOrders = <T extends StatusRow>(rows: readonly T[]): T[] =>
  rows.filter((r) => isCountedOrder(r.status));

/** 在途的單(有效、還沒結束、還沒收貨) */
export const inProgressOrders = <T extends StatusRow>(rows: readonly T[]): T[] =>
  rows.filter((r) => isInProgress(r.status));

/** GMV(成交金額):成交單的金額加總,沒有金額的單以 0 計 */
export const sumGmv = (rows: readonly (DealRow & AmountRow)[], ledger: DealLedger): number =>
  sumAmount(dealOrders(rows, ledger));

/** 成交單數 */
export const countDeals = (rows: readonly DealRow[], ledger: DealLedger): number =>
  dealOrders(rows, ledger).length;

/** 採購金額 / 訂單金額 */
export const sumOrderAmount = (rows: readonly AmountRow[]): number => sumAmount(countedOrders(rows));

/** 訂單數(採購單數、合作單數) */
export const countOrders = (rows: readonly StatusRow[]): number => countedOrders(rows).length;

/** 在途金額:有效、還沒結束、還沒收貨的單 */
export const sumInProgressAmount = (rows: readonly AmountRow[]): number =>
  sumAmount(inProgressOrders(rows));

/** 有金額(>0)的成交單 —— 平均成交金額的分母,還沒填金額的單不拉低平均 */
export const pricedDeals = <T extends DealRow & AmountRow>(rows: readonly T[], ledger: DealLedger): T[] =>
  dealOrders(rows, ledger).filter((r) => orderAmount(r) > 0);

/** 平均成交金額(AOV)= GMV ÷ 有金額的成交單數;沒有樣本回 0 */
export const averageDealAmount = (rows: readonly (DealRow & AmountRow)[], ledger: DealLedger): number => {
  const priced = pricedDeals(rows, ledger);
  return priced.length > 0 ? sumAmount(priced) / priced.length : 0;
};

/**
 * 一張成交單算在什麼時間(本月 GMV、本月成交額、趨勢圖都用這個):
 * 第一次進入成交狀態的事件時間(通常是餐廳按下收貨);舊資料沒有事件紀錄,就用訂單建立時間。
 */
export const dealRecognizedAt = (order: { id: string; created_at: string }, ledger: DealLedger): string =>
  ledger.firstDealAt.get(order.id) ?? order.created_at;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 本地時區的 'YYYY-MM'。不能用 toISOString().slice(0, 7) —— 那是 UTC,
 * 台灣每月 1 號早上 8 點前的單會被算到上個月。
 */
export const localMonthKey = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
