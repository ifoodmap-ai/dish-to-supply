import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  CalendarDays,
  Coins,
  Inbox,
  Percent,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ORDER_STATUS, type OrderStatus } from '@/lib/orders';

/* ---------------------------------------------------------------
 * 新資料表尚未進 types.ts,沿用專案既有的 cast 慣例
 * ------------------------------------------------------------- */
type Res<T> = { data: T[] | null; error: { message: string } | null };

interface Chain<T> extends PromiseLike<Res<T>> {
  eq(col: string, v: unknown): Chain<T>;
  in(col: string, v: readonly unknown[]): Chain<T>;
  order(col: string, opts?: { ascending: boolean }): Chain<T>;
}

const table = <T,>(name: string) =>
  (supabase as never as {
    from: (t: string) => { select: (c: string) => Chain<T> };
  }).from(name);

/* ------------------------------ types ------------------------------ */
interface OrderRow {
  id: string;
  status: OrderStatus;
  restaurant_id: string | null;
  supplier_id: string | null;
  total_amount: number | null;
  created_at: string;
}

interface PaymentRow {
  id: string;
  order_id: string | null;
  amount: number | null;
  status: string;
  method: string | null;
  paid_at: string | null;
  created_at: string;
}

interface NameRow {
  id: string;
  name: string;
}

interface MonthBucket {
  month: string;
  label: string;
  gmv: number;
  orders: number;
  paid: number;
}

/* ------------------------------ constants ------------------------------ */
/** 認列 GMV 的狀態:餐廳確認收貨之後才算數(completed 為既有資料的舊「已完成」) */
const GMV_STATUSES: OrderStatus[] = ['received', 'reviewed', 'closed', 'completed'];

const DEFAULT_RATE = 3;
const MIN_RATE = 3;
const MAX_RATE = 5;

const money = (v: number): string =>
  `NT$ ${Math.round(v).toLocaleString('zh-TW')}`;

const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-');
  return `${y}/${m}`;
};

/* ------------------------------ page ------------------------------ */
export default function AdminRevenuePage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [rate, setRate] = useState(DEFAULT_RATE);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const [oRes, pRes, restRes, supRes] = await Promise.all([
      table<OrderRow>('supplier_orders').select(
        'id, status, restaurant_id, supplier_id, total_amount, created_at',
      ),
      table<PaymentRow>('order_payments').select(
        'id, order_id, amount, status, method, paid_at, created_at',
      ),
      table<NameRow>('restaurants').select('id, name'),
      table<NameRow>('suppliers').select('id, name'),
    ]);

    if (oRes.error) {
      setLoadError(oRes.error.message);
      toast.error('讀取訂單失敗', { description: oRes.error.message });
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setOrders(oRes.data ?? []);
    // order_payments 不存在或無權限時 → null,金流欄位顯示「—」
    setPayments(pRes.error ? null : pRes.data ?? []);

    const rMap: Record<string, string> = {};
    (restRes.data ?? []).forEach((r) => {
      rMap[r.id] = r.name;
    });
    setRestaurantMap(rMap);
    const sMap: Record<string, string> = {};
    (supRes.data ?? []).forEach((s) => {
      sMap[s.id] = s.name;
    });
    setSupplierMap(sMap);

    setFetchedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------- GMV ---------------- */
  const gmvOrders = useMemo(
    () => orders.filter((o) => GMV_STATUSES.includes(o.status)),
    [orders],
  );

  const paidByOrder = useMemo(() => {
    const map = new Map<string, number>();
    (payments ?? [])
      .filter((p) => p.status === 'paid' && p.order_id)
      .forEach((p) => {
        map.set(p.order_id as string, (map.get(p.order_id as string) ?? 0) + (Number(p.amount) || 0));
      });
    return map;
  }, [payments]);

  const months = useMemo<MonthBucket[]>(() => {
    const byMonth = new Map<string, MonthBucket>();
    gmvOrders.forEach((o) => {
      const ym = o.created_at.slice(0, 7);
      const b =
        byMonth.get(ym) ?? { month: ym, label: monthLabel(ym), gmv: 0, orders: 0, paid: 0 };
      b.gmv += Number(o.total_amount) || 0;
      b.orders += 1;
      b.paid += paidByOrder.get(o.id) ?? 0;
      byMonth.set(ym, b);
    });
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [gmvOrders, paidByOrder]);

  const chartData = useMemo(
    () =>
      months.map((m) => ({
        label: m.label,
        gmv: Math.round(m.gmv),
        commission: Math.round((m.gmv * rate) / 100),
      })),
    [months, rate],
  );

  const stats = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const totalGmv = gmvOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const monthGmv = months.find((m) => m.month === thisMonth)?.gmv ?? 0;
    const monthOrders = months.find((m) => m.month === thisMonth)?.orders ?? 0;
    const avgOrder = gmvOrders.length > 0 ? totalGmv / gmvOrders.length : 0;
    // 尚未認列 GMV 的在途訂單(已報價但還沒收貨)
    const pipelineAmount = orders
      .filter((o) => !GMV_STATUSES.includes(o.status))
      .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

    return { totalGmv, monthGmv, monthOrders, avgOrder, pipelineAmount, thisMonth };
  }, [gmvOrders, months, orders]);

  const paymentStats = useMemo(() => {
    if (payments == null) return null;
    const sum = (st: string) =>
      payments.filter((p) => p.status === st).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paid = sum('paid');
    const pending = sum('pending');
    const failed = sum('failed');
    return {
      paid,
      pending,
      failed,
      count: payments.length,
      /** GMV 中還沒有對應收款紀錄的部分 */
      uncollected: Math.max(0, stats.totalGmv - paid),
    };
  }, [payments, stats.totalGmv]);

  const commission = (stats.totalGmv * rate) / 100;
  const monthCommission = (stats.monthGmv * rate) / 100;

  const recent = useMemo(
    () =>
      [...gmvOrders]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10),
    [gmvOrders],
  );

  const kpis = [
    {
      title: '本月 GMV',
      value: money(stats.monthGmv),
      hint: `${stats.monthOrders} 筆已收貨訂單`,
      icon: CalendarDays,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: '累計 GMV',
      value: money(stats.totalGmv),
      hint: `${gmvOrders.length} 筆已收貨訂單`,
      icon: ShoppingBag,
      accent: 'text-slate-800',
      bg: 'bg-slate-100',
    },
    {
      title: `本月抽成試算 (${rate.toFixed(1)}%)`,
      value: money(monthCommission),
      hint: '試算,非實收',
      icon: Percent,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: '平均客單價',
      value: money(stats.avgOrder),
      hint: '已收貨訂單的平均金額',
      icon: Coins,
      accent: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ];

  /* ------------------------------ render ------------------------------ */
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">營收與抽成 (Revenue)</h1>
        <p className="text-sm text-slate-500 mb-6">平台成交總額與抽成收入試算</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4">
                <Skeleton className="h-7 w-7 rounded-lg mb-2" />
                <Skeleton className="h-7 w-28 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-slate-200">
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-60 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">營收與抽成 (Revenue)</h1>
        <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          重新整理
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        GMV 只認列餐廳已確認收貨的訂單(已收貨／已評價／已結案)
        {fetchedAt && (
          <span className="text-slate-400"> · 更新於 {fetchedAt.toLocaleTimeString('zh-TW')}</span>
        )}
      </p>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">讀取失敗:{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchData()}>
            重新載入
          </Button>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ title, value, hint, icon: Icon, accent, bg }) => (
          <Card key={title} className="border border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-xl font-bold tabular-nums ${accent}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{title}</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">{hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {gmvOrders.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-20 text-center text-slate-400">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm text-slate-500 font-medium">還沒有可認列 GMV 的訂單</p>
            <p className="text-xs mt-1.5 max-w-md mx-auto leading-relaxed">
              訂單要走到「餐廳確認收貨」才會計入 GMV。目前有 {orders.length} 筆訂單在流程中
              {stats.pipelineAmount > 0 && `,在途金額 ${money(stats.pipelineAmount)}`}。
            </p>
            {orders.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => navigate('/admin/pipeline')}
              >
                看交易全流程看板
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 抽成試算 */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">抽成收入試算</CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                依累計 GMV × 費率推估,<span className="font-medium text-amber-700">試算,非實收</span>
                。實際抽成方式與費率尚未定案。
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-600">抽成費率</span>
                    <span className="text-lg font-bold text-blue-600 tabular-nums">
                      {rate.toFixed(1)}%
                    </span>
                  </div>
                  <Slider
                    value={[rate]}
                    min={MIN_RATE}
                    max={MAX_RATE}
                    step={0.1}
                    onValueChange={(v) => setRate(v[0])}
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>{MIN_RATE}% 保守</span>
                    <span>{MAX_RATE}% 積極</span>
                  </div>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-xs text-blue-700">累計抽成試算</p>
                  <p className="text-2xl font-bold text-blue-700 tabular-nums">
                    {money(commission)}
                  </p>
                  <p className="text-[11px] text-blue-600/80 mt-1">
                    {money(stats.totalGmv)} × {rate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 月度 GMV */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">月度 GMV 與抽成試算</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={70}
                    tickFormatter={(v: number) =>
                      v >= 10000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [money(Number(v)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="gmv" name="GMV" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="commission"
                    name={`抽成試算 ${rate.toFixed(1)}%`}
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 應收 / 已收 */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base text-slate-700">應收 / 已收</CardTitle>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                資料來源:order_payments
                {paymentStats == null && ' —— 目前尚未接上金流,所有欄位顯示「—」'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: '已收款',
                    value: paymentStats ? money(paymentStats.paid) : '—',
                    accent: 'text-emerald-600',
                    icon: Banknote,
                  },
                  {
                    label: '待收款',
                    value: paymentStats ? money(paymentStats.pending) : '—',
                    accent: 'text-amber-600',
                    icon: Receipt,
                  },
                  {
                    label: '收款失敗',
                    value: paymentStats ? money(paymentStats.failed) : '—',
                    accent: 'text-red-600',
                    icon: Receipt,
                  },
                  {
                    label: 'GMV 未對應收款',
                    value: paymentStats ? money(paymentStats.uncollected) : '—',
                    accent: 'text-slate-700',
                    icon: Coins,
                  },
                ].map(({ label, value, accent, icon: Icon }) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                    <p className={`text-lg font-bold tabular-nums ${accent}`}>{value}</p>
                  </div>
                ))}
              </div>
              {paymentStats != null && paymentStats.count === 0 && (
                <p className="text-xs text-slate-400 mt-3">
                  order_payments 目前沒有任何收款紀錄,金額全部顯示為 0
                </p>
              )}
            </CardContent>
          </Card>

          {/* 月度明細 */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">月度明細</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-slate-600">月份</TableHead>
                      <TableHead className="text-slate-600 text-right">訂單數</TableHead>
                      <TableHead className="text-slate-600 text-right">GMV</TableHead>
                      <TableHead className="text-slate-600 text-right">
                        抽成試算 {rate.toFixed(1)}%
                      </TableHead>
                      <TableHead className="text-slate-600 text-right">平均客單價</TableHead>
                      <TableHead className="text-slate-600 text-right">已收款</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...months].reverse().map((m) => (
                      <TableRow key={m.month} className="hover:bg-slate-50">
                        <TableCell className="text-sm font-medium text-slate-800 whitespace-nowrap">
                          {m.label}
                          {m.month === stats.thisMonth && (
                            <Badge
                              variant="outline"
                              className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0"
                            >
                              本月
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                          {m.orders}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-slate-800 tabular-nums whitespace-nowrap">
                          {money(m.gmv)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-blue-600 tabular-nums whitespace-nowrap">
                          {money((m.gmv * rate) / 100)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-600 tabular-nums whitespace-nowrap">
                          {money(m.orders > 0 ? m.gmv / m.orders : 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-600 tabular-nums whitespace-nowrap">
                          {payments == null ? '—' : money(m.paid)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-medium">
                      <TableCell className="text-sm text-slate-800">合計</TableCell>
                      <TableCell className="text-right text-sm text-slate-800 tabular-nums">
                        {gmvOrders.length}
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-800 tabular-nums whitespace-nowrap">
                        {money(stats.totalGmv)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-blue-700 tabular-nums whitespace-nowrap">
                        {money(commission)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-800 tabular-nums whitespace-nowrap">
                        {money(stats.avgOrder)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-800 tabular-nums whitespace-nowrap">
                        {paymentStats ? money(paymentStats.paid) : '—'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 最近認列的訂單 */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-700">最近認列 GMV 的訂單</CardTitle>
              <p className="text-xs text-slate-500 mt-1">點任一列可看該筆訂單的完整履歷</p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-slate-600">訂單</TableHead>
                      <TableHead className="text-slate-600">餐廳</TableHead>
                      <TableHead className="text-slate-600">供應商</TableHead>
                      <TableHead className="text-slate-600">狀態</TableHead>
                      <TableHead className="text-slate-600 text-right">金額</TableHead>
                      <TableHead className="text-slate-600 text-right">已收款</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((o) => (
                      <TableRow
                        key={o.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => navigate(`/admin/orders/${o.id}/timeline`)}
                      >
                        <TableCell className="font-mono text-xs text-slate-500">
                          #{o.id.slice(-8)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {(o.restaurant_id && restaurantMap[o.restaurant_id]) || (
                            <span className="text-slate-400 italic">未指定</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {(o.supplier_id && supplierMap[o.supplier_id]) || (
                            <span className="text-slate-400 italic">未指定</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              ORDER_STATUS[o.status]?.className ??
                              'bg-slate-100 text-slate-700 border-slate-300'
                            }
                          >
                            {ORDER_STATUS[o.status]?.label ?? o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-800 tabular-nums whitespace-nowrap">
                          {money(Number(o.total_amount) || 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-600 tabular-nums whitespace-nowrap">
                          {payments == null ? '—' : money(paidByOrder.get(o.id) ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
