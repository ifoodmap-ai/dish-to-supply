// 測試用:每一種訂單狀態各一張單的「狀態矩陣」(只給 *.test.tsx 用,正式程式不會 import)。
//
// 金額 = 100 × 2 的次方 —— 任何一組狀態的金額加總都獨一無二,所以頁面上顯示的數字
// 直接證明它算進了哪幾種狀態。頁面測試拿同一份資料丟給 src/lib/metrics.ts,
// 兩邊一致就代表頁面用的是共用定義;再對照舊算法的數字,確認舊算法真的不見了。

import { METRIC_CLASS } from '@/lib/metrics';
import type { OrderStatus } from '@/lib/orders';

export const ALL_STATUSES = Object.keys(METRIC_CLASS) as OrderStatus[];

/** 這種狀態的那張單的金額 */
export const amountFor = (status: OrderStatus): number => 100 * 2 ** ALL_STATUSES.indexOf(status);

/** 一組狀態的金額加總(拿來寫「舊算法會算出多少」) */
export const sumFor = (statuses: readonly OrderStatus[]): number =>
  statuses.reduce((s, st) => s + amountFor(st), 0);

/** 可讀的訂單 id:order-received、order-draft… */
export const orderIdFor = (status: OrderStatus) => `order-${status}`;

/**
 * 每種狀態一張單。`extra` 可以依狀態補欄位(restaurant_id、supplier_id、created_at…)。
 */
export const orderMatrix = <T extends Record<string, unknown>>(
  extra: (status: OrderStatus, index: number) => T,
) =>
  ALL_STATUSES.map((status, index) => ({
    id: orderIdFor(status),
    status,
    total_amount: amountFor(status),
    ...extra(status, index),
  }));

/** 金額顯示:NT$ 1,234(管理員後台、餐廳營運總覽) */
export const ntd = (v: number) => `NT$ ${Math.round(v).toLocaleString('zh-TW')}`;

/** 金額顯示:$1,234(供應商後台) */
export const usd = (v: number) => `$${Math.round(v).toLocaleString('zh-TW')}`;
