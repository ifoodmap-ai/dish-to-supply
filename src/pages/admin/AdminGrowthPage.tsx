import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Gauge,
  Info,
  Receipt,
  RefreshCw,
  Repeat,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

/* ---------------------------------------------------------------
 * 新資料表尚未進 types.ts,沿用專案既有的 cast 慣例
 * ------------------------------------------------------------- */
type Res<T> = { data: T[] | null; error: { message: string } | null };

interface Chain<T> extends PromiseLike<Res<T>> {
  eq(col: string, v: unknown): Chain<T>;
  in(col: string, v: readonly unknown[]): Chain<T>;
  gte(col: string, v: unknown): Chain<T>;
  order(col: string, opts?: { ascending: boolean }): Chain<T>;
  limit(n: number): Chain<T>;
}

const table = <T,>(name: string) =>
  (supabase as never as {
    from: (t: string) => { select: (c: string) => Chain<T> };
  }).from(name);

/* ------------------------------ types ------------------------------ */
interface EntityRow {
  id: string;
  created_at: string | null;
}

interface OrderRow {
  id: string;
  restaurant_id: string | null;
  status: string;
  total_amount: number | null;
  created_at: string;
}

interface EventRow {
  order_id: string;
  created_at: string;
}

interface NpsRow {
  score: number | null;
  audience: string | null;
  created_at: string | null;
}

interface AppEventRow {
  event: string | null;
}

/* ------------------------------ 常數 ------------------------------ */
/** 圖表回看幾個月 */
const MONTHS = 12;
/** cohort 表最多顯示幾個分群(由新到舊取) */
const MAX_COHORTS = 8;
/** cohort 觀察到第幾個月 */
const COHORT_OFFSETS = [0, 1, 2, 3];
/** 複購率至少要幾家下過單的餐廳才有統計意義 */
const MIN_BUYERS = 5;
/** cohort 每一群至少幾家才不標低樣本 */
const MIN_COHORT_SIZE = 3;
/** NPS 至少要幾份回覆才報分數 */
const MIN_NPS = 10;
/** PostgREST 單次查詢的預設上限;達到就代表資料可能被截斷,數字不可信 */
const ROW_CAP = 1000;

/** 不算「有下單」的狀態 */
const NOT_PLACED = new Set(['draft', 'cancelled']);
/** 視為已收貨(含收貨之後的階段)的狀態 —— GMV 只認這些 */
const RECEIVED_STATUSES = new Set(['received', 'reviewed', 'closed', 'completed']);

const FUNNEL_APP_STAGES: { event: string; label: string }[] = [
  { event: 'analysis_started', label: '開始分析' },
  { event: 'analysis_completed', label: '完成分析' },
  { event: 'contact_captured', label: '留下聯絡' },
  { event: 'match_viewed', label: '看媒合' },
  { event: 'inquiry_sent', label: '送出詢價' },
];

/* ------------------------------ 小工具 ------------------------------ */
const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO 字串 → 當地時區的 'YYYY-MM' */
const monthKeyOf = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

const monthIndexOf = (key: string) => Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1);
const keyOfIndex = (idx: number) => `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
const monthLabel = (key: string) => `${key.slice(2, 4)}/${key.slice(5, 7)}`;

/** 最近 n 個月的月份 key(由舊到新,含本月) */
const lastMonthKeys = (n: number): string[] => {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return out;
};

const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
};

const money = (v: number) => `NT$ ${Math.round(v).toLocaleString('zh-TW')}`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** cohort 留存表的顏色深淺 */
const heatClass = (value: number | null): string => {
  if (value == null) return 'bg-slate-50 text-slate-300';
  if (value <= 0) return 'bg-slate-100 text-slate-400';
  if (value < 15) return 'bg-emerald-50 text-emerald-700';
  if (value < 30) return 'bg-emerald-100 text-emerald-800';
  if (value < 45) return 'bg-emerald-200 text-emerald-900';
  if (value < 60) return 'bg-emerald-300 text-emerald-900';
  if (value < 80) return 'bg-emerald-500 text-white';
  return 'bg-emerald-600 text-white';
};

/* ------------------------------ 子元件 ------------------------------ */
/** 指標卡 —— 每一張都要標註計算方式(投資人會問) */
const MetricCard = ({
  title,
  icon: Icon,
  accent,
  bg,
  value,
  sub,
  formula,
  insufficient,
  loading,
}: {
  title: string;
  icon: typeof Building2;
  accent: string;
  bg: string;
  value: string;
  sub?: string | null;
  formula: string;
  insufficient?: boolean;
  loading: boolean;
}) => (
  <Card className="border border-slate-200">
    <CardContent className="p-4">
      <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24 mb-1" />
      ) : insufficient ? (
        <div className="text-base font-semibold text-slate-400 leading-8">樣本數不足</div>
      ) : (
        <div className={`text-2xl font-bold leading-8 ${accent}`}>{value}</div>
      )}
      <div className="text-xs text-slate-500 mt-0.5">{title}</div>
      {!loading && sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-1 text-[11px] leading-snug text-slate-400">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>{formula}</span>
      </div>
    </CardContent>
  </Card>
);

/** 卡片標題右側的計算方式說明 */
const FormulaNote = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-1 text-[11px] leading-snug text-slate-400">
    <Info className="h-3 w-3 mt-0.5 shrink-0" />
    <span>{children}</span>
  </p>
);

const EmptyHint = ({ children }: { children: ReactNode }) => (
  <div className="py-10 text-center text-sm text-slate-400">{children}</div>
);

/* ------------------------------ page ------------------------------ */
export default function AdminGrowthPage() {
  const [restaurants, setRestaurants] = useState<EntityRow[]>([]);
  const [suppliers, setSuppliers] = useState<EntityRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [receivedEvents, setReceivedEvents] = useState<EventRow[]>([]);
  const [npsRows, setNpsRows] = useState<NpsRow[]>([]);
  const [appEvents, setAppEvents] = useState<AppEventRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const [restRes, supRes, orderRes, evRes, npsRes, appRes] = await Promise.all([
      table<EntityRow>('restaurants').select('id, created_at'),
      table<EntityRow>('suppliers').select('id, created_at'),
      table<OrderRow>('supplier_orders').select('id, restaurant_id, status, total_amount, created_at'),
      table<EventRow>('order_events').select('order_id, created_at').eq('to_status', 'received'),
      table<NpsRow>('nps_responses').select('score, audience, created_at'),
      table<AppEventRow>('app_events').select('event'),
    ]);

    // 餐廳 + 訂單是這頁的地基,讀不到就整頁報錯
    const fatal = restRes.error ?? orderRes.error;
    if (fatal) {
      setLoadError(fatal.message);
      toast.error('讀取成長數據失敗', { description: fatal.message });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const warn: string[] = [];
    if (supRes.error) warn.push(`供應商資料讀取失敗(${supRes.error.message})`);
    if (evRes.error) warn.push(`訂單事件讀取失敗,GMV 改以訂單建立時間歸月(${evRes.error.message})`);
    if (npsRes.error) warn.push(`NPS 資料讀取失敗(${npsRes.error.message})`);
    if (appRes.error) warn.push(`前台事件讀取失敗,漏斗前段無資料(${appRes.error.message})`);

    // 單次查詢達 1000 筆上限 → 數字會被低估,寧可明講也不要給投資人錯的數
    ([
      ['restaurants', restRes.data?.length ?? 0, '餐廳數與成長曲線'],
      ['suppliers', supRes.data?.length ?? 0, '供應商數與成長曲線'],
      ['supplier_orders', orderRes.data?.length ?? 0, 'GMV、複購率與 cohort'],
      ['order_events', evRes.data?.length ?? 0, 'GMV 歸月'],
      ['app_events', appRes.data?.length ?? 0, '漏斗前 5 段'],
    ] as [string, number, string][]).forEach(([t, n, affected]) => {
      if (n >= ROW_CAP) {
        warn.push(`${t} 單次查詢已達 ${ROW_CAP} 筆上限,${affected}可能被低估,需改為後端彙總`);
      }
    });

    setRestaurants(restRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setOrders(orderRes.data ?? []);
    setReceivedEvents(evRes.data ?? []);
    setNpsRows(npsRes.data ?? []);
    setAppEvents(appRes.data ?? []);
    setWarnings(warn);
    setFetchedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* --------------------------- 指標計算 --------------------------- */
  const derived = useMemo(() => {
    const monthKeys = lastMonthKeys(MONTHS);
    const currentIdx = monthIndexOf(monthKeys[monthKeys.length - 1]);

    /* 1) 雙邊成長曲線(累計) */
    const restKeys = restaurants.map((r) => monthKeyOf(r.created_at)).filter(Boolean) as string[];
    const supKeys = suppliers.map((s) => monthKeyOf(s.created_at)).filter(Boolean) as string[];
    const growthSeries = monthKeys.map((k) => ({
      month: monthLabel(k),
      restaurants: restKeys.filter((x) => x <= k).length,
      suppliers: supKeys.filter((x) => x <= k).length,
    }));

    const rest30 = restaurants.filter((r) => {
      const d = daysSince(r.created_at);
      return d != null && d <= 30;
    }).length;
    const sup30 = suppliers.filter((s) => {
      const d = daysSince(s.created_at);
      return d != null && d <= 30;
    }).length;

    /* 2) GMV —— 只認「餐廳按下收貨」的訂單 */
    const receivedAt = new Map<string, string>();
    receivedEvents.forEach((e) => {
      const prev = receivedAt.get(e.order_id);
      if (!prev || e.created_at < prev) receivedAt.set(e.order_id, e.created_at);
    });

    const receivedOrders = orders.filter(
      (o) => receivedAt.has(o.id) || RECEIVED_STATUSES.has(o.status),
    );
    const amountOf = (o: OrderRow) => Number(o.total_amount) || 0;
    const gmvMonthOf = (o: OrderRow) => monthKeyOf(receivedAt.get(o.id) ?? o.created_at);

    const gmvByMonth = new Map<string, { gmv: number; count: number }>();
    receivedOrders.forEach((o) => {
      const k = gmvMonthOf(o);
      if (!k) return;
      const cur = gmvByMonth.get(k) ?? { gmv: 0, count: 0 };
      cur.gmv += amountOf(o);
      cur.count += 1;
      gmvByMonth.set(k, cur);
    });
    const gmvSeries = monthKeys.map((k) => ({
      month: monthLabel(k),
      gmv: gmvByMonth.get(k)?.gmv ?? 0,
      count: gmvByMonth.get(k)?.count ?? 0,
    }));

    const gmvTotal = receivedOrders.reduce((s, o) => s + amountOf(o), 0);
    const gmv30 = receivedOrders
      .filter((o) => {
        const d = daysSince(receivedAt.get(o.id) ?? o.created_at);
        return d != null && d <= 30;
      })
      .reduce((s, o) => s + amountOf(o), 0);
    const pricedOrders = receivedOrders.filter((o) => amountOf(o) > 0);
    const aov = pricedOrders.length > 0 ? gmvTotal / pricedOrders.length : 0;

    /* 3) 複購率 + 下單次數分布 */
    const placed = orders.filter((o) => !NOT_PLACED.has(o.status));
    const placedWithRestaurant = placed.filter((o) => !!o.restaurant_id);
    const orphanOrders = placed.length - placedWithRestaurant.length;

    const ordersByRestaurant = new Map<string, string[]>();
    placedWithRestaurant.forEach((o) => {
      const list = ordersByRestaurant.get(o.restaurant_id as string) ?? [];
      list.push(o.created_at);
      ordersByRestaurant.set(o.restaurant_id as string, list);
    });
    const buyers = ordersByRestaurant.size;
    const repeaters = [...ordersByRestaurant.values()].filter((v) => v.length >= 2).length;
    const repeatRate = buyers > 0 ? repeaters / buyers : null;

    const buckets = [
      { label: '只下過 1 單', min: 1, max: 1, count: 0 },
      { label: '2 單', min: 2, max: 2, count: 0 },
      { label: '3–5 單', min: 3, max: 5, count: 0 },
      { label: '6 單以上', min: 6, max: Infinity, count: 0 },
    ];
    ordersByRestaurant.forEach((list) => {
      const n = list.length;
      const b = buckets.find((x) => n >= x.min && n <= x.max);
      if (b) b.count += 1;
    });

    /* 4) cohort 留存 —— 依首次下單月份分群 */
    const firstOrderMonth = new Map<string, string>();
    const activeMonths = new Set<string>();
    ordersByRestaurant.forEach((list, rid) => {
      let first: string | null = null;
      list.forEach((iso) => {
        const k = monthKeyOf(iso);
        if (!k) return;
        activeMonths.add(`${rid}|${k}`);
        if (!first || k < first) first = k;
      });
      if (first) firstOrderMonth.set(rid, first);
    });

    const cohortGroups = new Map<string, string[]>();
    firstOrderMonth.forEach((k, rid) => {
      const list = cohortGroups.get(k) ?? [];
      list.push(rid);
      cohortGroups.set(k, list);
    });

    const cohorts = [...cohortGroups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, MAX_COHORTS)
      .map(([key, members]) => ({
        key,
        size: members.length,
        cells: COHORT_OFFSETS.map((offset) => {
          const targetIdx = monthIndexOf(key) + offset;
          if (targetIdx > currentIdx) {
            return { offset, retained: null as number | null, rate: null as number | null, ongoing: false };
          }
          const targetKey = keyOfIndex(targetIdx);
          const retained = members.filter((rid) => activeMonths.has(`${rid}|${targetKey}`)).length;
          return {
            offset,
            retained,
            rate: members.length > 0 ? (retained / members.length) * 100 : null,
            ongoing: targetIdx === currentIdx,
          };
        }),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    /* 5) NPS */
    const scores = npsRows
      .map((n) => Number(n.score))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
    const promoters = scores.filter((s) => s >= 9).length;
    const passives = scores.filter((s) => s >= 7 && s <= 8).length;
    const detractors = scores.filter((s) => s <= 6).length;
    const npsScore =
      scores.length > 0
        ? Math.round(((promoters - detractors) / scores.length) * 100)
        : null;
    const npsByAudience = ['restaurant', 'supplier'].map((aud) => {
      const list = npsRows.filter((n) => n.audience === aud).map((n) => Number(n.score));
      const valid = list.filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
      const p = valid.filter((s) => s >= 9).length;
      const d = valid.filter((s) => s <= 6).length;
      return {
        audience: aud === 'restaurant' ? '餐廳端' : '供應商端',
        total: valid.length,
        score: valid.length > 0 ? Math.round(((p - d) / valid.length) * 100) : null,
      };
    });

    /* 6) 轉換漏斗 */
    const eventCounts: Record<string, number> = {};
    appEvents.forEach((e) => {
      if (e?.event) eventCounts[e.event] = (eventCounts[e.event] ?? 0) + 1;
    });
    const funnel = [
      ...FUNNEL_APP_STAGES.map((s) => ({
        key: s.event,
        label: s.label,
        count: eventCounts[s.event] ?? 0,
        source: 'app_events',
      })),
      { key: 'order_created', label: '成立訂單', count: placed.length, source: 'supplier_orders' },
      {
        key: 'order_received',
        label: '完成收貨',
        count: receivedOrders.length,
        source: 'supplier_orders',
      },
    ];
    const funnelBase = funnel[0].count || Math.max(...funnel.map((f) => f.count), 0);

    return {
      monthKeys,
      growthSeries,
      restTotal: restaurants.length,
      supTotal: suppliers.length,
      rest30,
      sup30,
      gmvSeries,
      gmvTotal,
      gmv30,
      aov,
      receivedCount: receivedOrders.length,
      pricedCount: pricedOrders.length,
      placedCount: placed.length,
      orphanOrders,
      buyers,
      repeaters,
      repeatRate,
      buckets,
      cohorts,
      npsScore,
      npsTotal: scores.length,
      promoters,
      passives,
      detractors,
      npsByAudience,
      funnel,
      funnelBase,
    };
  }, [restaurants, suppliers, orders, receivedEvents, npsRows, appEvents]);

  /* --------------------------- 指標卡 --------------------------- */
  const metrics = [
    {
      key: 'restaurants',
      title: '累計餐廳數',
      icon: Building2,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
      value: String(derived.restTotal),
      sub: `近 30 天新增 ${derived.rest30} 家`,
      formula: 'restaurants 全表筆數;新增數 = created_at 在近 30 天內',
      insufficient: false,
    },
    {
      key: 'suppliers',
      title: '累計供應商數',
      icon: Truck,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
      value: String(derived.supTotal),
      sub: `近 30 天新增 ${derived.sup30} 家`,
      formula: 'suppliers 全表筆數;新增數 = created_at 在近 30 天內',
      insufficient: false,
    },
    {
      key: 'gmv',
      title: '累計 GMV',
      icon: Wallet,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
      value: money(derived.gmvTotal),
      sub: `近 30 天 ${money(derived.gmv30)} · ${derived.receivedCount} 筆已收貨`,
      formula: 'Σ 已收貨訂單 total_amount(以餐廳按下「收貨」的時間歸月,未報價金額以 0 計)',
      insufficient: derived.receivedCount === 0,
    },
    {
      key: 'aov',
      title: '平均訂單金額 (AOV)',
      icon: Receipt,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
      value: money(derived.aov),
      sub: `樣本 ${derived.pricedCount} 筆有金額的已收貨訂單`,
      formula: '累計 GMV ÷ 有金額(>0)的已收貨訂單數',
      insufficient: derived.pricedCount === 0,
    },
    {
      key: 'repeat',
      title: '餐廳複購率',
      icon: Repeat,
      accent: 'text-purple-600',
      bg: 'bg-purple-50',
      value: derived.repeatRate == null ? '—' : pct1(derived.repeatRate),
      sub: `${derived.repeaters} / ${derived.buyers} 家下過單的餐廳`,
      formula: `下過 ≥2 單的餐廳 ÷ 下過 ≥1 單的餐廳(排除草稿與取消單);樣本需 ≥${MIN_BUYERS} 家`,
      insufficient: derived.buyers < MIN_BUYERS,
    },
    {
      key: 'nps',
      title: 'NPS',
      icon: Gauge,
      accent:
        derived.npsScore != null && derived.npsScore >= 0 ? 'text-emerald-600' : 'text-red-600',
      bg: 'bg-amber-50',
      value: derived.npsScore == null ? '—' : String(derived.npsScore),
      sub: `${derived.npsTotal} 份回覆`,
      formula: `推薦者(9–10)% − 貶損者(0–6)%;樣本需 ≥${MIN_NPS} 份`,
      insufficient: derived.npsTotal < MIN_NPS,
    },
  ];

  /* --------------------------- render --------------------------- */
  if (loadError) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-6">成長儀表板 (Growth)</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center">
          <p className="text-sm text-red-700">讀取成長數據失敗:{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchData()}>
            重新載入
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">成長儀表板 (Growth)</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          重新整理
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        投資人盡調要看的數字都在這一頁 · 每個指標都標註計算方式,樣本不足會直接標示「樣本數不足」而不是補 0
        {fetchedAt && (
          <span className="text-slate-400"> · 更新於 {fetchedAt.toLocaleTimeString('zh-TW')}</span>
        )}
      </p>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            部分資料來源讀取失敗,以下指標可能不完整
          </div>
          <ul className="mt-1.5 ml-6 list-disc text-xs text-amber-700 space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 指標卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {metrics.map((m) => (
          <MetricCard
            key={m.key}
            title={m.title}
            icon={m.icon}
            accent={m.accent}
            bg={m.bg}
            value={m.value}
            sub={m.sub}
            formula={m.formula}
            insufficient={m.insufficient}
            loading={loading}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 雙邊成長曲線 */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">
              雙邊成長曲線 · 近 {MONTHS} 個月
            </CardTitle>
            <FormulaNote>
              每個月底的累計家數(含該月之前註冊者);資料來源 restaurants.created_at 與
              suppliers.created_at
            </FormulaNote>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : derived.restTotal === 0 && derived.supTotal === 0 ? (
              <EmptyHint>尚無餐廳或供應商資料</EmptyHint>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={derived.growthSeries} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="restaurants"
                    name="餐廳(累計)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="suppliers"
                    name="供應商(累計)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* NPS */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">NPS 淨推薦值</CardTitle>
            <FormulaNote>
              NPS =(9–10 分人數 − 0–6 分人數)÷ 總回覆數 × 100;資料來源 nps_responses
            </FormulaNote>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : derived.npsTotal === 0 ? (
              <EmptyHint>尚無 NPS 回覆</EmptyHint>
            ) : (
              <div className="space-y-3">
                <div className="text-center py-2">
                  {derived.npsTotal < MIN_NPS ? (
                    <>
                      <div className="text-lg font-semibold text-slate-400">樣本數不足</div>
                      <div className="text-xs text-slate-400 mt-1">
                        目前 {derived.npsTotal} 份,需 ≥{MIN_NPS} 份才報分數
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-4xl font-bold ${
                          (derived.npsScore ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {derived.npsScore}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        共 {derived.npsTotal} 份回覆
                      </div>
                    </>
                  )}
                </div>

                <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  {[
                    { n: derived.promoters, cls: 'bg-emerald-500' },
                    { n: derived.passives, cls: 'bg-slate-300' },
                    { n: derived.detractors, cls: 'bg-red-500' },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className={s.cls}
                      style={{ width: `${(s.n / derived.npsTotal) * 100}%` }}
                    />
                  ))}
                </div>

                <div className="space-y-1 text-sm">
                  {[
                    { label: '推薦者 9–10', n: derived.promoters, cls: 'text-emerald-600' },
                    { label: '中立者 7–8', n: derived.passives, cls: 'text-slate-500' },
                    { label: '貶損者 0–6', n: derived.detractors, cls: 'text-red-600' },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="text-slate-600">{s.label}</span>
                      <span className={`tabular-nums font-medium ${s.cls}`}>
                        {s.n}
                        <span className="text-slate-400 font-normal ml-1.5">
                          {Math.round((s.n / derived.npsTotal) * 100)}%
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 mt-1 border-t border-slate-100 space-y-1">
                  {derived.npsByAudience.map((a) => (
                    <div key={a.audience} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{a.audience}</span>
                      <span className="tabular-nums text-slate-600">
                        {a.total === 0 ? (
                          <span className="text-slate-400">尚無回覆</span>
                        ) : a.total < MIN_NPS ? (
                          <span className="text-slate-400">樣本數不足({a.total})</span>
                        ) : (
                          <>
                            {a.score}
                            <span className="text-slate-400 ml-1.5">({a.total} 份)</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GMV 趨勢 */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">GMV 月趨勢 · 已收貨訂單</CardTitle>
            <FormulaNote>
              只認餐廳按下「收貨」的訂單(order_events.to_status = received;舊資料以訂單狀態
              received/reviewed/closed/completed 認列),金額取
              supplier_orders.total_amount
            </FormulaNote>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : derived.receivedCount === 0 ? (
              <EmptyHint>尚無已收貨的訂單,GMV 還沒有可信的樣本</EmptyHint>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={derived.gmvSeries} margin={{ left: -8, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === 'GMV' ? [money(Number(value)), name] : [value, name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      yAxisId="left"
                      dataKey="gmv"
                      name="GMV"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="count"
                      name="已收貨訂單數"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                {derived.gmvTotal === 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    已收貨 {derived.receivedCount} 筆,但這些訂單都還沒有金額(total_amount
                    為空),GMV 目前無法認列
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 複購分布 */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">下單次數分布</CardTitle>
            <FormulaNote>
              以餐廳為單位統計下單筆數(排除 draft / cancelled);複購率 = 2 單以上的餐廳佔比
            </FormulaNote>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : derived.buyers === 0 ? (
              <EmptyHint>還沒有餐廳下過單</EmptyHint>
            ) : (
              <div className="space-y-3">
                <div className="text-center pb-1">
                  {derived.buyers < MIN_BUYERS ? (
                    <>
                      <div className="text-lg font-semibold text-slate-400">樣本數不足</div>
                      <div className="text-xs text-slate-400 mt-1">
                        目前 {derived.buyers} 家下單餐廳,需 ≥{MIN_BUYERS} 家才報複購率
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-purple-600">
                        {pct1(derived.repeatRate ?? 0)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {derived.repeaters} / {derived.buyers} 家餐廳回頭下第二單
                      </div>
                    </>
                  )}
                </div>
                {derived.buckets.map((b) => {
                  const p = derived.buyers > 0 ? (b.count / derived.buyers) * 100 : 0;
                  return (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-slate-600 text-right">
                        {b.label}
                      </span>
                      <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded bg-purple-400"
                          style={{ width: `${Math.min(p, 100)}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-xs tabular-nums text-slate-700 text-right">
                        {b.count}
                      </span>
                    </div>
                  );
                })}
                {derived.orphanOrders > 0 && (
                  <p className="pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                    另有 {derived.orphanOrders} 筆訂單尚未綁定餐廳(早期需求單),未列入複購與 cohort
                    計算
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cohort 留存 */}
        <Card className="border-slate-200 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">Cohort 留存 · 依首次下單月份</CardTitle>
            <FormulaNote>
              每一列是同一個月首次下單的餐廳;第 N 月 = 該群餐廳在首單後第 N 個自然月「至少再下 1
              單」的比例。第 0 月定義上必為 100%。* 表示該月尚未結束,數字會再往上走
            </FormulaNote>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : derived.cohorts.length === 0 ? (
              <EmptyHint>尚無下單紀錄,無法計算留存</EmptyHint>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="text-left font-medium px-3 py-2 w-32">首單月份</th>
                      <th className="text-right font-medium px-3 py-2 w-20">餐廳數</th>
                      {COHORT_OFFSETS.map((o) => (
                        <th key={o} className="text-center font-medium px-3 py-2">
                          第 {o} 月
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {derived.cohorts.map((c) => (
                      <tr key={c.key}>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                          {c.key.replace('-', ' / ')}
                          {c.size < MIN_COHORT_SIZE && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 px-1 py-0 text-[10px] bg-slate-100 text-slate-500 border-slate-300"
                            >
                              低樣本
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                          {c.size}
                        </td>
                        {c.cells.map((cell) => (
                          <td key={cell.offset} className="px-1 py-1">
                            <div
                              className={`rounded py-1.5 text-center text-xs tabular-nums font-medium ${heatClass(
                                cell.rate,
                              )}`}
                              title={
                                cell.rate == null
                                  ? '該月份尚未到期'
                                  : `${cell.retained} / ${c.size} 家有下單`
                              }
                            >
                              {cell.rate == null
                                ? '—'
                                : `${Math.round(cell.rate)}%${cell.ongoing ? '*' : ''}`}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-slate-400">
                  低樣本 = 該群不足 {MIN_COHORT_SIZE} 家,百分比波動大請勿單獨引用;— = 該月份還沒到
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 轉換漏斗 */}
        <Card className="border-slate-200 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">
              轉換漏斗 · 從分析到收貨
              <TrendingUp className="inline h-4 w-4 ml-1.5 text-emerald-500" />
            </CardTitle>
            <FormulaNote>
              前 5 段來自前台埋點 app_events(以「開始分析」為分母);後 2
              段來自 supplier_orders 實際單數(成立訂單 = 排除草稿與取消;完成收貨 =
              餐廳按下收貨)。兩段資料來源不同,轉換率僅供趨勢參考
            </FormulaNote>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {derived.funnel.map((f) => (
                  <Skeleton key={f.key} className="h-8 w-full" />
                ))}
              </div>
            ) : derived.funnelBase === 0 ? (
              <EmptyHint>尚無事件與訂單資料,漏斗無法計算</EmptyHint>
            ) : (
              <div className="space-y-3">
                {derived.funnel.map((stage, i) => {
                  const p = derived.funnelBase > 0 ? (stage.count / derived.funnelBase) * 100 : 0;
                  const prev = i > 0 ? derived.funnel[i - 1].count : null;
                  const stepRate = prev && prev > 0 ? Math.round((stage.count / prev) * 100) : null;
                  const isOrderStage = stage.source === 'supplier_orders';
                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-sm text-slate-600 text-right">
                        {stage.label}
                      </div>
                      <div className="flex-1 h-6 rounded bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded transition-all ${
                            isOrderStage ? 'bg-blue-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(p, 100)}%` }}
                        />
                      </div>
                      <div className="w-32 shrink-0 text-sm tabular-nums text-right">
                        <span className="font-semibold text-slate-800">{stage.count}</span>
                        <span className="text-slate-400 ml-1.5">{Math.round(p)}%</span>
                        {stepRate != null && (
                          <span className="text-slate-300 ml-1.5 text-xs">↓{stepRate}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        所有數字皆為即時查詢資料庫計算,沒有任何寫死或示範資料;樣本不足的指標一律標示「樣本數不足」,不以 0
        充數
      </p>
    </div>
  );
}
