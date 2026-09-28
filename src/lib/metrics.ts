// 全站「成交／GMV」與「採購金額／訂單金額」的唯一定義(業主拍板:後台精簡 Q5-A)。
//
// 兩個詞、兩套狀態,畫面上不可以混用:
//
//   成交 / GMV        餐廳確認收貨之後才算:
//                       received(待評價)、reviewed(已評價)、closed(已結案)、completed(舊資料「已完成」)
//                     「received 只有餐廳能觸發」(orders.ts 的 TRANSITIONS)—— 這就是 GMV 可信的原因。
//                     供應商推到 delivered(待收貨)、餐廳確認報價 confirmed(待出貨)都還不是成交。
//
//   採購金額 / 訂單金額 排除 draft(草稿)、cancelled(已取消)、rejected(供應商拒單)、expired(逾時未回應),
//   (含「訂單數」       其他狀態都算 —— 包含進行中的單、收貨有差異／爭議中的單,以及全部成交單。
//    「合作單數」)
//
// 成交是採購的子集合:每一筆成交也都算在採購金額裡。
//
// 規則:
//   - 各頁一律從這裡取狀態集合與計算函式,不要再自己寫一份狀態清單(metrics.guard.test.ts 會掃原始碼擋)。
//   - 狀態的顯示名稱在 src/lib/orders.ts 的 ORDER_STATUS;這裡只管「算不算」。
//     OrderStatus 新增一種狀態時:tsc 會在下面的 METRIC_CLASS 報錯(Record 必須列齊;但 CI 的 tsc 目前只報告不擋),
//     真正會讓 CI 變紅的是 metrics.test.ts 的「每一種狀態都有歸類」—— 請先決定它歸哪一類。
//   - 資料庫裡沒有另外彙總這些數字的 view 或 RPC。order_pipeline 是看板用的逐列清單
//     (排除 closed / cancelled / rejected,沒有加總),不是 GMV 也不是採購金額。
//
// ⚠️ 待業主決定:closed(已結案)有兩條來路 —— 收貨後結案(received / reviewed → closed),
//    以及管理員直接結掉爭議(discrepancy / disputed → closed,餐廳從沒按收貨)。
//    目前只看狀態,兩種都算成交;若要排除後者,必須改成「有收貨事件才算」,各頁都要讀 order_events。

import type { OrderStatus } from '@/lib/orders';

/** 一種狀態在金額指標裡的歸類 */
export type MetricClass =
  /** 不算訂單:不進採購金額、也不進成交 */
  | 'excluded'
  /** 有效訂單、但餐廳還沒確認收貨:算採購金額,不算成交 */
  | 'in_progress'
  /** 成交:算 GMV,也算採購金額 */
  | 'deal';

/** 每一種訂單狀態歸哪一類 —— 全站只有這一份 */
export const METRIC_CLASS: Readonly<Record<OrderStatus, MetricClass>> = {
  draft: 'excluded', //          草稿:還沒送出
  submitted: 'in_progress', //   待派發
  dispatched: 'in_progress', //  待接單
  accepted: 'in_progress', //    待報價
  quoted: 'in_progress', //      待確認
  confirmed: 'in_progress', //   待出貨 —— 餐廳確認報價不等於成交
  shipped: 'in_progress', //     已出貨
  in_transit: 'in_progress', //  運送中
  delivered: 'in_progress', //   待收貨 —— 供應商說送到了,餐廳還沒確認,不算成交
  received: 'deal', //           待評價 —— 餐廳確認收貨,從這裡開始算成交
  reviewed: 'deal', //           已評價
  closed: 'deal', //             已結案(含爭議直接結案的單,見檔頭「待業主決定」)
  rejected: 'excluded', //       供應商拒單
  discrepancy: 'in_progress', // 收貨有差異 —— 餐廳沒有確認收貨,不算成交;仍是有效訂單
  disputed: 'in_progress', //    爭議中 —— 同上
  cancelled: 'excluded', //      已取消
  expired: 'excluded', //        逾時未回應
  pending: 'in_progress', //     舊資料「待處理」
  sent: 'in_progress', //        舊資料「已派發」
  completed: 'deal', //          舊資料「已完成」
};

const statusesOf = (...classes: MetricClass[]): readonly OrderStatus[] =>
  Object.freeze(
    (Object.keys(METRIC_CLASS) as OrderStatus[]).filter((s) => classes.includes(METRIC_CLASS[s])),
  );

/** 成交 / GMV 的狀態:received、reviewed、closed、completed */
export const GMV_STATUSES = statusesOf('deal');

/** 不算訂單的狀態(不進採購金額、也不進成交):draft、rejected、cancelled、expired */
export const EXCLUDED_ORDER_STATUSES = statusesOf('excluded');

/** 算進採購金額 / 訂單金額 / 訂單數的狀態(= 全部狀態扣掉 EXCLUDED_ORDER_STATUSES) */
export const ORDER_STATUSES = statusesOf('in_progress', 'deal');

/** 有效訂單但還沒成交(在途):ORDER_STATUSES 扣掉 GMV_STATUSES */
export const IN_PROGRESS_STATUSES = statusesOf('in_progress');

/**
 * 一個狀態字串歸哪一類;不是已知狀態(null、空字串、打錯字)就回 null。
 * 資料庫的 CHECK 限制讓 status 不可能是未知值,真遇到了就兩邊都不算,寧可少算也不要灌水。
 */
export const metricClassOf = (status: string | null | undefined): MetricClass | null =>
  status != null && Object.prototype.hasOwnProperty.call(METRIC_CLASS, status)
    ? METRIC_CLASS[status as OrderStatus]
    : null;

/** 算不算成交 / GMV */
export const isDeal = (status: string | null | undefined): boolean => metricClassOf(status) === 'deal';

/** 算不算訂單(採購金額 / 訂單金額 / 訂單數) */
export const isCountedOrder = (status: string | null | undefined): boolean => {
  const c = metricClassOf(status);
  return c === 'deal' || c === 'in_progress';
};

/** 有效訂單但還沒成交(在途) */
export const isInProgress = (status: string | null | undefined): boolean =>
  metricClassOf(status) === 'in_progress';

/* --------------------------------------------------------------------------
 * 從訂單列計算
 * ------------------------------------------------------------------------ */

export interface StatusRow {
  status: string | null;
}

export interface AmountRow extends StatusRow {
  total_amount?: number | string | null;
}

/** 一張單的金額:還沒報價(null)或不是數字 → 0 */
export const orderAmount = (row: { total_amount?: number | string | null }): number => {
  const n = Number(row.total_amount ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const sumAmount = (rows: readonly AmountRow[]): number =>
  rows.reduce((s, r) => s + orderAmount(r), 0);

/** 成交的單 */
export const dealOrders = <T extends StatusRow>(rows: readonly T[]): T[] =>
  rows.filter((r) => isDeal(r.status));

/** 算進採購 / 訂單的單 */
export const countedOrders = <T extends StatusRow>(rows: readonly T[]): T[] =>
  rows.filter((r) => isCountedOrder(r.status));

/** 在途的單(有效但還沒成交) */
export const inProgressOrders = <T extends StatusRow>(rows: readonly T[]): T[] =>
  rows.filter((r) => isInProgress(r.status));

/** GMV(成交金額):成交單的金額加總,沒有金額的單以 0 計 */
export const sumGmv = (rows: readonly AmountRow[]): number => sumAmount(dealOrders(rows));

/** 成交單數 */
export const countDeals = (rows: readonly StatusRow[]): number => dealOrders(rows).length;

/** 採購金額 / 訂單金額 */
export const sumOrderAmount = (rows: readonly AmountRow[]): number => sumAmount(countedOrders(rows));

/** 訂單數(採購單數、合作單數) */
export const countOrders = (rows: readonly StatusRow[]): number => countedOrders(rows).length;

/** 在途金額:有效但還沒成交的單 */
export const sumInProgressAmount = (rows: readonly AmountRow[]): number =>
  sumAmount(inProgressOrders(rows));

/** 有金額(>0)的成交單 —— 平均成交金額的分母,還沒填金額的單不拉低平均 */
export const pricedDeals = <T extends AmountRow>(rows: readonly T[]): T[] =>
  dealOrders(rows).filter((r) => orderAmount(r) > 0);

/** 平均成交金額(AOV)= GMV ÷ 有金額的成交單數;沒有樣本回 0 */
export const averageDealAmount = (rows: readonly AmountRow[]): number => {
  const priced = pricedDeals(rows);
  return priced.length > 0 ? sumAmount(priced) / priced.length : 0;
};

/* --------------------------------------------------------------------------
 * 成交算在哪一天:第一次進入成交狀態的時間
 * ------------------------------------------------------------------------ */

export interface StatusEventRow {
  order_id: string;
  to_status: string | null;
  created_at: string;
}

/**
 * 每張單「第一次進入成交狀態」的事件時間(原字串)。只看 to_status 屬於成交的事件,
 * 通常就是餐廳按下「收貨」那一筆。
 */
export const firstDealEventAt = (events: readonly StatusEventRow[]): Map<string, string> => {
  const out = new Map<string, string>();
  events.forEach((e) => {
    if (!isDeal(e.to_status)) return;
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) return;
    const prev = out.get(e.order_id);
    if (prev == null || t < Date.parse(prev)) out.set(e.order_id, e.created_at);
  });
  return out;
};

/**
 * 一張成交單算在什麼時間(本月 GMV、本月成交額、趨勢圖都用這個):
 * 第一次進入成交狀態的事件時間;舊資料沒有事件紀錄,就用訂單建立時間。
 */
export const dealRecognizedAt = (
  order: { id: string; created_at: string },
  firstDealAt: ReadonlyMap<string, string>,
): string => firstDealAt.get(order.id) ?? order.created_at;

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
