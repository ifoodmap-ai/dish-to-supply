// 訂單狀態機 + 事件流 —— 三端共用的單一入口。
//
// 設計原則(docs/PORTALS_PLAN.md 第 4 節):
//   1. 任何狀態變更都只透過 recordOrderEvent() 寫 order_events
//   2. order_events 的 trigger 會同步更新 supplier_orders.status
//      → 前端永遠不要直接 update status,否則停留時間與履歷會失真
//   3. received 只能由餐廳端觸發,供應商最多推到 delivered

import { supabase } from "@/integrations/supabase/client";

export type OrderStatus =
  | "draft" | "submitted" | "dispatched" | "accepted" | "quoted" | "confirmed"
  | "shipped" | "in_transit" | "delivered" | "received" | "reviewed" | "closed"
  | "rejected" | "discrepancy" | "disputed" | "cancelled" | "expired"
  // 相容既有資料
  | "pending" | "sent" | "completed";

export type ActorRole = "restaurant" | "supplier" | "admin" | "system";
export type EventSource =
  | "restaurant_portal" | "supplier_portal" | "admin_portal"
  | "line_bot" | "api" | "cron" | "system";

export interface OrderEvent {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  actor_role: ActorRole;
  actor_label: string | null;
  source: EventSource;
  payload: Record<string, unknown>;
  note: string | null;
  created_at: string;
}

interface StatusMeta {
  label: string;
  /** 正常流程的順序;異常分支為 -1 */
  step: number;
  className: string;
  /** 卡在這一階段多久算異常(小時);null = 不計 SLA */
  slaHours: number | null;
  /** 誰該採取下一步 */
  waitingOn: ActorRole | null;
}

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  draft:       { label: "草稿",     step: 0,  className: "bg-slate-100 text-slate-600 border-slate-300", slaHours: null, waitingOn: "restaurant" },
  submitted:   { label: "待派發",   step: 1,  className: "bg-slate-100 text-slate-700 border-slate-300", slaHours: 12,   waitingOn: "admin" },
  dispatched:  { label: "待接單",   step: 2,  className: "bg-blue-50 text-blue-700 border-blue-200",     slaHours: 24,   waitingOn: "supplier" },
  accepted:    { label: "待報價",   step: 3,  className: "bg-blue-50 text-blue-700 border-blue-200",     slaHours: 24,   waitingOn: "supplier" },
  quoted:      { label: "待確認",   step: 4,  className: "bg-amber-50 text-amber-700 border-amber-200",  slaHours: 48,   waitingOn: "restaurant" },
  confirmed:   { label: "待出貨",   step: 5,  className: "bg-amber-50 text-amber-700 border-amber-200",  slaHours: 48,   waitingOn: "supplier" },
  shipped:     { label: "已出貨",   step: 6,  className: "bg-indigo-50 text-indigo-700 border-indigo-200", slaHours: 48, waitingOn: "supplier" },
  in_transit:  { label: "運送中",   step: 7,  className: "bg-indigo-50 text-indigo-700 border-indigo-200", slaHours: 48, waitingOn: "supplier" },
  delivered:   { label: "待收貨",   step: 8,  className: "bg-purple-50 text-purple-700 border-purple-200", slaHours: 72, waitingOn: "restaurant" },
  received:    { label: "待評價",   step: 9,  className: "bg-emerald-50 text-emerald-700 border-emerald-200", slaHours: 168, waitingOn: "restaurant" },
  reviewed:    { label: "已評價",   step: 10, className: "bg-emerald-50 text-emerald-700 border-emerald-200", slaHours: null, waitingOn: "admin" },
  closed:      { label: "已結案",   step: 11, className: "bg-emerald-100 text-emerald-800 border-emerald-300", slaHours: null, waitingOn: null },

  rejected:    { label: "供應商拒單", step: -1, className: "bg-red-50 text-red-700 border-red-200",       slaHours: null, waitingOn: "admin" },
  discrepancy: { label: "收貨有差異", step: -1, className: "bg-orange-50 text-orange-700 border-orange-200", slaHours: 24, waitingOn: "admin" },
  disputed:    { label: "爭議中",     step: -1, className: "bg-red-50 text-red-700 border-red-200",       slaHours: 48,   waitingOn: "admin" },
  cancelled:   { label: "已取消",     step: -1, className: "bg-slate-100 text-slate-500 border-slate-300", slaHours: null, waitingOn: null },
  expired:     { label: "逾時未回應", step: -1, className: "bg-red-50 text-red-700 border-red-200",       slaHours: null, waitingOn: "admin" },

  // 既有資料的舊狀態
  pending:     { label: "待處理",   step: 1,  className: "bg-slate-100 text-slate-700 border-slate-300", slaHours: 24,   waitingOn: "admin" },
  sent:        { label: "已派發",   step: 2,  className: "bg-blue-50 text-blue-700 border-blue-200",     slaHours: 24,   waitingOn: "supplier" },
  completed:   { label: "已完成",   step: 11, className: "bg-emerald-100 text-emerald-800 border-emerald-300", slaHours: null, waitingOn: null },
};

/** 正常流程的顯示順序(看板欄位、時間軸用) */
export const PIPELINE_STAGES: OrderStatus[] = [
  "submitted", "dispatched", "accepted", "quoted", "confirmed",
  "shipped", "in_transit", "delivered", "received", "reviewed",
];

/** 各角色在某狀態下可以推進到哪些狀態 —— 前端按鈕的唯一依據 */
const TRANSITIONS: Record<ActorRole, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  restaurant: {
    draft:      ["submitted", "cancelled"],
    quoted:     ["confirmed", "cancelled"],
    // ★ received 只有餐廳能觸發 —— GMV 可信度的來源
    delivered:  ["received", "discrepancy"],
    received:   ["reviewed"],
    discrepancy:["disputed"],
  },
  supplier: {
    dispatched: ["accepted", "rejected"],
    sent:       ["accepted", "rejected"],
    accepted:   ["quoted"],
    confirmed:  ["shipped"],
    shipped:    ["in_transit", "delivered"],
    in_transit: ["delivered"],
  },
  admin: {
    submitted:  ["dispatched", "cancelled"],
    pending:    ["dispatched", "cancelled"],
    draft:      ["dispatched", "cancelled"],
    rejected:   ["dispatched", "cancelled"],
    expired:    ["dispatched", "cancelled"],
    discrepancy:["disputed", "received", "closed"],
    disputed:   ["closed", "received"],
    reviewed:   ["closed"],
    received:   ["closed"],
  },
  system: {},
};

export const allowedTransitions = (role: ActorRole, status: OrderStatus): OrderStatus[] =>
  TRANSITIONS[role]?.[status] ?? [];

export const canTransition = (role: ActorRole, from: OrderStatus, to: OrderStatus): boolean =>
  allowedTransitions(role, from).includes(to);

interface RecordEventInput {
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: ActorRole;
  source: EventSource;
  actorLabel?: string | null;
  payload?: Record<string, unknown>;
  note?: string | null;
}

/**
 * 寫一筆訂單事件。DB trigger 會同步把 supplier_orders.status 更新成 toStatus
 * 並重設 current_stage_since —— 所以呼叫端不需要(也不應該)自己 update status。
 */
export const recordOrderEvent = async (input: RecordEventInput): Promise<OrderEvent> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await (supabase as never as {
    from: (t: string) => {
      insert: (v: unknown) => {
        select: (c: string) => { single: () => Promise<{ data: OrderEvent | null; error: { message: string } | null }> };
      };
    };
  })
    .from("order_events")
    .insert({
      order_id: input.orderId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      actor_id: user?.id ?? null,
      actor_role: input.actorRole,
      actor_label: input.actorLabel ?? user?.email ?? null,
      source: input.source,
      payload: input.payload ?? {},
      note: input.note ?? null,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "寫入訂單事件失敗");
  return data;
};

/** 取一筆訂單的完整履歷(時間順序) */
export const fetchOrderTimeline = async (orderId: string): Promise<OrderEvent[]> => {
  const { data, error } = (await (supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: OrderEvent[] | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("order_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })) as { data: OrderEvent[] | null; error: { message: string } | null };

  if (error) throw new Error(error.message);
  return data ?? [];
};

/** 停留時數 */
export const hoursInStage = (since: string | null): number => {
  if (!since) return 0;
  const ms = Date.now() - new Date(since).getTime();
  return Number.isFinite(ms) ? ms / 3_600_000 : 0;
};

/** 是否卡關(超過該階段的 SLA) */
export const isStuck = (status: OrderStatus, since: string | null): boolean => {
  const sla = ORDER_STATUS[status]?.slaHours;
  return sla != null && hoursInStage(since) > sla;
};

export const formatStageAge = (since: string | null): string => {
  const h = hoursInStage(since);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} 分鐘`;
  if (h < 48) return `${Math.round(h)} 小時`;
  return `${Math.round(h / 24)} 天`;
};

/** 事件來源的顯示標籤 */
export const SOURCE_LABEL: Record<EventSource, string> = {
  restaurant_portal: "餐廳後台",
  supplier_portal: "供應商後台",
  admin_portal: "管理後台",
  line_bot: "LINE",
  api: "API",
  cron: "排程",
  system: "系統",
};

export const ROLE_LABEL: Record<ActorRole, string> = {
  restaurant: "餐廳",
  supplier: "供應商",
  admin: "管理員",
  system: "系統",
};
