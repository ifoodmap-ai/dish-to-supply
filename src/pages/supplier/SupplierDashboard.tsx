import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  DollarSign,
  Inbox,
  ListChecks,
  Loader2,
  MessageSquareReply,
  Radar,
  UserMinus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  ORDER_STATUS,
  ROLE_LABEL,
  formatStageAge,
  isStuck,
  type OrderStatus,
} from '@/lib/orders';

interface OrderRow {
  id: string;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  restaurant_id: string | null;
  current_stage_since: string | null;
}

interface EventRow {
  order_id: string;
  to_status: string;
  created_at: string;
}

interface PipelineRow {
  id: string;
  status: string;
  restaurant_id: string | null;
  total_amount: number | null;
  current_stage_since: string | null;
  hours_in_stage: number | string | null;
  sla_hours: number | string | null;
  created_at: string;
}

/** 已成交(餐廳確認報價之後)的狀態 */
const DEAL_STATUSES = new Set<string>([
  'confirmed', 'shipped', 'in_transit', 'delivered', 'received', 'reviewed', 'closed', 'completed',
]);

/** 代表供應商已回覆過的狀態 */
const RESPONDED_STATUSES = new Set<string>([
  'accepted', 'quoted', 'rejected', ...DEAL_STATUSES,
]);

/** 代表這張單已經派到供應商手上 */
const DISPATCHED_STATUSES = new Set<string>([
  'dispatched', 'sent', ...RESPONDED_STATUSES,
]);

const DAY_MS = 86_400_000;

const statusMeta = (status: string | null) =>
  ORDER_STATUS[(status ?? '') as OrderStatus] ?? {
    label: status ?? '未知',
    step: -1,
    className: 'bg-slate-100 text-slate-600 border-slate-300',
    slaHours: null,
    waitingOn: null,
  };

const formatDuration = (hours: number): string => {
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分鐘`;
  if (hours < 48) return `${hours.toFixed(1)} 小時`;
  return `${(hours / 24).toFixed(1)} 天`;
};

const money = (v: number): string => `$${Math.round(v).toLocaleString('zh-TW')}`;

export default function SupplierDashboard() {
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [newLeads, setNewLeads] = useState(0);
  const [restaurantNames, setRestaurantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (!cancelled) setLoading(false); return; }

        const { data: acct } = (await (supabase as never)
          .from('supplier_accounts')
          .select('supplier_id')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .maybeSingle()) as { data: { supplier_id: string } | null };

        const sid = acct?.supplier_id ?? null;
        if (!sid) { if (!cancelled) setLoading(false); return; }
        if (!cancelled) setSupplierId(sid);

        const [orderRes, pipeRes, leadRes] = await Promise.all([
          (supabase as never)
            .from('supplier_orders')
            .select('id, status, total_amount, created_at, restaurant_id, current_stage_since')
            .eq('supplier_id', sid)
            .order('created_at', { ascending: false }),
          (supabase as never)
            .from('order_pipeline')
            .select('id, status, restaurant_id, total_amount, current_stage_since, hours_in_stage, sla_hours, created_at')
            .eq('supplier_id', sid),
          (supabase as never)
            .from('supplier_leads')
            .select('id', { count: 'exact', head: true })
            .eq('supplier_id', sid)
            .eq('status', 'new'),
        ]);

        const orderRows = ((orderRes as { data: OrderRow[] | null }).data) ?? [];
        const pipeRows = ((pipeRes as { data: PipelineRow[] | null }).data) ?? [];
        const leadCount = (leadRes as { count: number | null }).count ?? 0;

        // 訂單事件(算回覆時間 / 成交時間點用)
        let eventRows: EventRow[] = [];
        const orderIds = orderRows.map((o) => o.id);
        if (orderIds.length > 0) {
          const { data: ev } = (await (supabase as never)
            .from('order_events')
            .select('order_id, to_status, created_at')
            .in('order_id', orderIds)
            .order('created_at', { ascending: true })) as { data: EventRow[] | null };
          eventRows = ev ?? [];
        }

        // 餐廳名稱
        const restaurantIds = Array.from(
          new Set([...orderRows, ...pipeRows].map((r) => r.restaurant_id).filter(Boolean) as string[]),
        );
        const nameMap: Record<string, string> = {};
        if (restaurantIds.length > 0) {
          const { data: rs } = (await (supabase as never)
            .from('restaurants')
            .select('id, name')
            .in('id', restaurantIds)) as { data: { id: string; name: string }[] | null };
          (rs ?? []).forEach((r) => { nameMap[r.id] = r.name; });
        }

        if (cancelled) return;
        setOrders(orderRows);
        setEvents(eventRows);
        setPipeline(pipeRows);
        setNewLeads(leadCount);
        setRestaurantNames(nameMap);
      } catch (e) {
        if (!cancelled) toast.error('載入儀表板失敗', { description: (e as { message?: string })?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const derived = useMemo(() => {
    // ── 每張單的關鍵時間點 ───────────────────────────────
    const firstEventAt = new Map<string, Record<string, number>>();
    events.forEach((e) => {
      const bucket = firstEventAt.get(e.order_id) ?? {};
      const ts = new Date(e.created_at).getTime();
      if (!Number.isFinite(ts)) return;
      if (bucket[e.to_status] == null || ts < bucket[e.to_status]) bucket[e.to_status] = ts;
      firstEventAt.set(e.order_id, bucket);
    });

    const earliestOf = (orderId: string, statuses: string[]): number | null => {
      const bucket = firstEventAt.get(orderId);
      if (!bucket) return null;
      const hits = statuses.map((s) => bucket[s]).filter((v): v is number => v != null);
      return hits.length > 0 ? Math.min(...hits) : null;
    };

    // ── 成交(含金額與時間) ─────────────────────────────
    const deals: { at: number; amount: number }[] = [];
    orders.forEach((o) => {
      const evDealAt = earliestOf(o.id, [...DEAL_STATUSES]);
      const isDeal = evDealAt != null || DEAL_STATUSES.has(o.status ?? '');
      if (!isDeal) return;
      const at = evDealAt ?? new Date(o.created_at).getTime();
      if (!Number.isFinite(at)) return;
      deals.push({ at, amount: Number(o.total_amount ?? 0) || 0 });
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthRevenue = deals.filter((d) => d.at >= monthStart).reduce((s, d) => s + d.amount, 0);
    const monthDeals = deals.filter((d) => d.at >= monthStart).length;

    // ── 詢價回覆率 ────────────────────────────────────
    let dispatchedCount = 0;
    let respondedCount = 0;
    orders.forEach((o) => {
      const reachedMe =
        DISPATCHED_STATUSES.has(o.status ?? '') || earliestOf(o.id, ['dispatched', 'sent']) != null;
      if (!reachedMe) return;
      dispatchedCount += 1;
      const replied =
        RESPONDED_STATUSES.has(o.status ?? '') ||
        earliestOf(o.id, ['accepted', 'quoted', 'rejected']) != null;
      if (replied) respondedCount += 1;
    });
    const replyRate = dispatchedCount > 0 ? Math.round((respondedCount / dispatchedCount) * 100) : null;

    // ── 平均回覆時間 (dispatched → accepted / quoted / rejected) ──
    const gaps: number[] = [];
    orders.forEach((o) => {
      const from = earliestOf(o.id, ['dispatched', 'sent']);
      const to = earliestOf(o.id, ['accepted', 'quoted', 'rejected']);
      if (from == null || to == null || to < from) return;
      gaps.push((to - from) / 3_600_000);
    });
    const avgReplyHours = gaps.length > 0 ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null;

    // ── 流失預警客戶數 ─────────────────────────────────
    const byRestaurant = new Map<string, number[]>();
    orders.forEach((o) => {
      if (!o.restaurant_id) return;
      if (['draft', 'cancelled', 'rejected', 'expired'].includes(o.status ?? '')) return;
      const ts = new Date(o.created_at).getTime();
      if (!Number.isFinite(ts)) return;
      const list = byRestaurant.get(o.restaurant_id) ?? [];
      list.push(ts);
      byRestaurant.set(o.restaurant_id, list);
    });
    let churnRisk = 0;
    byRestaurant.forEach((tsList) => {
      if (tsList.length < 2) return;
      const sorted = [...tsList].sort((a, b) => a - b);
      const span = sorted[sorted.length - 1] - sorted[0];
      const avgCycleDays = span / (sorted.length - 1) / DAY_MS;
      if (avgCycleDays <= 0) return;
      const daysSinceLast = (Date.now() - sorted[sorted.length - 1]) / DAY_MS;
      if (daysSinceLast > avgCycleDays * 2) churnRisk += 1;
    });

    // ── 近 30 天成交趨勢(補 0,以本地時區分日) ──────────────
    const dayKey = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const revenueByDay = new Map<string, number>();
    deals.forEach((d) => {
      const k = dayKey(d.at);
      revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + d.amount);
    });
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const trend = Array.from({ length: 30 }, (_, i) => {
      const ms = todayStart - (29 - i) * DAY_MS;
      const k = dayKey(ms);
      return { date: k.slice(5), amount: revenueByDay.get(k) ?? 0 };
    });
    const trend30Total = trend.reduce((s, d) => s + d.amount, 0);

    // ── 待辦 / 卡關訂單 ────────────────────────────────
    const todos = pipeline
      .map((p) => {
        const meta = statusMeta(p.status);
        const hours = p.hours_in_stage != null
          ? Number(p.hours_in_stage)
          : (p.current_stage_since
            ? (Date.now() - new Date(p.current_stage_since).getTime()) / 3_600_000
            : 0);
        const sla = p.sla_hours != null ? Number(p.sla_hours) : meta.slaHours;
        const stuck = (sla != null && Number.isFinite(hours) && hours > sla)
          || isStuck(p.status as OrderStatus, p.current_stage_since);
        return {
          ...p,
          meta,
          hours: Number.isFinite(hours) ? hours : 0,
          stuck,
          mine: meta.waitingOn === 'supplier',
        };
      })
      .filter((p) => p.stuck || p.mine)
      .sort((a, b) => {
        if (a.stuck !== b.stuck) return a.stuck ? -1 : 1;
        if (a.mine !== b.mine) return a.mine ? -1 : 1;
        return b.hours - a.hours;
      });

    return {
      monthRevenue, monthDeals, replyRate, respondedCount, dispatchedCount,
      avgReplyHours, gapsCount: gaps.length, churnRisk, trend, trend30Total, todos,
      customerCount: byRestaurant.size,
    };
  }, [orders, events, pipeline]);

  const kpis = [
    {
      key: 'revenue',
      title: '本月成交額',
      value: money(derived.monthRevenue),
      hint: `本月成交 ${derived.monthDeals} 單`,
      icon: DollarSign,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      key: 'reply-rate',
      title: '詢價回覆率',
      value: derived.replyRate != null ? `${derived.replyRate}%` : '—',
      hint: derived.dispatchedCount > 0
        ? `已回覆 ${derived.respondedCount} / 收到 ${derived.dispatchedCount}`
        : '尚未收到派單',
      icon: MessageSquareReply,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      key: 'reply-time',
      title: '平均回覆時間',
      value: derived.avgReplyHours != null ? formatDuration(derived.avgReplyHours) : '—',
      hint: derived.gapsCount > 0 ? `取樣 ${derived.gapsCount} 筆派單` : '尚無足夠事件紀錄',
      icon: Clock,
      accent: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      key: 'leads',
      title: '待處理商機',
      value: newLeads,
      hint: newLeads > 0 ? '平台為你媒合的新需求' : '目前沒有新商機',
      icon: Radar,
      accent: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      key: 'churn',
      title: '流失預警客戶',
      value: derived.churnRisk,
      hint: derived.customerCount > 0 ? `合作餐廳共 ${derived.customerCount} 家` : '尚無合作餐廳',
      icon: UserMinus,
      accent: derived.churnRisk > 0 ? 'text-red-600' : 'text-slate-600',
      bg: derived.churnRisk > 0 ? 'bg-red-50' : 'bg-slate-100',
    },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-slate-200 lg:col-span-2">
            <CardContent className="p-6"><Skeleton className="h-56 w-full" /></CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!supplierId) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-24 text-gray-400">
          <Loader2 className="mx-auto mb-3 opacity-30" size={36} />
          <p>此帳號尚未綁定供應商</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">營運總覽</h1>
      <p className="text-sm text-gray-500 mb-6">你的成交、回覆效率與待辦一眼掌握</p>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {kpis.map(({ key, title, value, hint, icon: Icon, accent, bg }) => (
          <Card key={key} className="border border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-2xl font-bold ${accent} tabular-nums`}>{value}</div>
              <div className="text-xs text-slate-600 mt-0.5">{title}</div>
              <div className="text-[11px] text-slate-400 mt-1">{hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 成交趨勢 */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base text-slate-700">近 30 天成交趨勢</CardTitle>
            <span className="text-sm text-slate-500 tabular-nums">
              合計 <span className="font-semibold text-emerald-600">{money(derived.trend30Total)}</span>
            </span>
          </CardHeader>
          <CardContent>
            {derived.trend30Total === 0 ? (
              <div className="h-[240px] flex flex-col items-center justify-center text-slate-400 text-sm">
                <Inbox size={36} className="mb-3 opacity-30" />
                <p>近 30 天還沒有成交紀錄</p>
                <p className="text-xs mt-1">完成報價並由餐廳確認後,金額會顯示在這裡</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={derived.trend} margin={{ left: -8, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="supplierRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={4} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={64}
                    tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip formatter={(v: unknown) => [money(Number(v)), '成交額'] as [string, string]} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#supplierRevenue)"
                    name="成交額"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 待辦 */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700 flex items-center gap-2">
              <ListChecks size={16} className="text-slate-400" />
              待辦與卡關訂單
            </CardTitle>
          </CardHeader>
          <CardContent>
            {derived.todos.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                <ListChecks size={32} className="mx-auto mb-3 opacity-30" />
                <p>目前沒有等你處理的訂單</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {derived.todos.slice(0, 12).map((t) => (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-3 ${t.stuck ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {(t.restaurant_id && restaurantNames[t.restaurant_id]) || '未指定餐廳'}
                      </p>
                      {t.stuck && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 shrink-0">
                          <AlertTriangle size={11} className="mr-1" />卡關
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant="outline" className={t.meta.className}>{t.meta.label}</Badge>
                      <span className="text-xs text-slate-500">
                        停留 {formatStageAge(t.current_stage_since)}
                      </span>
                      {t.total_amount != null && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          · {money(Number(t.total_amount))}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {t.meta.waitingOn
                        ? `等待 ${ROLE_LABEL[t.meta.waitingOn]} 處理`
                        : '無待辦動作'}
                    </p>
                  </div>
                ))}
                {derived.todos.length > 12 && (
                  <p className="text-xs text-slate-400 text-center pt-1">
                    另有 {derived.todos.length - 12} 筆…
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <Link to="/supplier/leads">
          <Card className="border-slate-200 hover:border-emerald-300 hover:shadow-sm transition-all h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50"><Radar className="h-4 w-4 text-amber-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">商機雷達</p>
                <p className="text-xs text-slate-400">{newLeads} 筆待處理商機</p>
              </div>
              <ArrowRight size={16} className="text-slate-300" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/supplier/customers">
          <Card className="border-slate-200 hover:border-emerald-300 hover:shadow-sm transition-all h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50"><UserMinus className="h-4 w-4 text-red-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">客戶管理</p>
                <p className="text-xs text-slate-400">{derived.churnRisk} 家可能流失</p>
              </div>
              <ArrowRight size={16} className="text-slate-300" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/supplier/quotes">
          <Card className="border-slate-200 hover:border-emerald-300 hover:shadow-sm transition-all h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50"><MessageSquareReply className="h-4 w-4 text-blue-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">線上報價</p>
                <p className="text-xs text-slate-400">回覆買家需求</p>
              </div>
              <ArrowRight size={16} className="text-slate-300" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <p className="text-[11px] text-slate-400 text-right mt-4">
        成交額與回覆時間皆以訂單事件履歷 (order_events) 計算
      </p>
    </div>
  );
}
