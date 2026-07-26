import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Download,
  Gauge,
  Inbox,
  PackageSearch,
  RefreshCw,
  Search,
  Target,
  TrendingDown,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ORDER_STATUS, formatStageAge, isStuck, type OrderStatus } from '@/lib/orders';

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
interface DemandItem {
  name?: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

interface AnalysisRow {
  id: string;
  created_at: string;
  ingredient_list: DemandItem[] | null;
}

interface SupplyRow {
  id: string;
  name: string;
  category: string | null;
  is_available: boolean | null;
}

interface IngredientRow {
  id: string;
  canonical_name: string;
}

interface AliasRow {
  ingredient_id: string;
  alias: string;
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  restaurant_id: string | null;
  supplier_id: string | null;
  total_amount: number | null;
  current_stage_since: string | null;
  created_at: string;
}

interface MatchResultRow {
  id: string;
  confidence_score: number | null;
  status: string;
  created_at: string;
}

interface NameRow {
  id: string;
  name: string;
}

interface GapItem {
  name: string;
  count: number;
  categories: string[];
  lastSeen: string;
}

/* ------------------------------ helpers ------------------------------ */
/** 名稱正規化:去空白、括號、大小寫,讓「牛腱心 (冷凍)」與「牛腱心」可比對 */
const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）【】[\]]/g, '');

const RANGE_OPTIONS = [
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: '180', label: '近 180 天' },
];

/** 媒合了但沒成交的狀態(sent 為既有資料的舊「已派發」) */
const LOST_STATUSES: OrderStatus[] = ['dispatched', 'sent', 'rejected', 'expired'];

/** 視為成交的狀態(completed 為既有資料的舊「已完成」) */
const WON_STATUSES: OrderStatus[] = ['received', 'reviewed', 'closed', 'completed'];

const CONF_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '0–50%', min: 0, max: 0.5 },
  { key: '50–70%', min: 0.5, max: 0.7 },
  { key: '70–85%', min: 0.7, max: 0.85 },
  { key: '85–100%', min: 0.85, max: 1.01 },
];

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);

/* ------------------------------ page ------------------------------ */
export default function AdminMatchQualityPage() {
  const navigate = useNavigate();

  const [days, setDays] = useState('90');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResultRow[] | null>(null);
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});

  const [gapSearch, setGapSearch] = useState('');

  const fetchData = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);

      const since = new Date(Date.now() - Number(days) * 86_400_000).toISOString();

      const [aRes, suRes, ingRes, aliasRes, oRes, mRes, restRes, supRes] = await Promise.all([
        table<AnalysisRow>('analysis_records')
          .select('id, created_at, ingredient_list')
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        table<SupplyRow>('supplies').select('id, name, category, is_available'),
        table<IngredientRow>('ingredients').select('id, canonical_name'),
        table<AliasRow>('ingredient_aliases').select('ingredient_id, alias'),
        table<OrderRow>('supplier_orders').select(
          'id, status, restaurant_id, supplier_id, total_amount, current_stage_since, created_at',
        ),
        table<MatchResultRow>('match_results').select('id, confidence_score, status, created_at'),
        table<NameRow>('restaurants').select('id, name'),
        table<NameRow>('suppliers').select('id, name'),
      ]);

      if (aRes.error) {
        setLoadError(aRes.error.message);
        toast.error('讀取需求分析失敗', { description: aRes.error.message });
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setAnalyses(aRes.data ?? []);
      setSupplies(suRes.data ?? []);
      setIngredients(ingRes.error ? [] : ingRes.data ?? []);
      setAliases(aliasRes.error ? [] : aliasRes.data ?? []);
      setOrders(oRes.error ? [] : oRes.data ?? []);
      // match_results 不存在或無權限時 → null,改用訂單狀態分布
      setMatchResults(mRes.error ? null : mRes.data ?? []);

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
    },
    [days],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------- 區塊 1:供給缺口 ---------------- */
  const gapAnalysis = useMemo(() => {
    // 供應商目前有的品項(正規化後)
    const supplyNames = supplies
      .map((s) => norm(s.name ?? ''))
      .filter((n) => n.length > 0);

    // 別名 ↔ 正規名互查,避免「同物異名」被誤判成缺口
    const canonicalById = new Map<string, string>();
    ingredients.forEach((i) => canonicalById.set(i.id, i.canonical_name));
    const aliasToId = new Map<string, string>();
    aliases.forEach((a) => aliasToId.set(norm(a.alias ?? ''), a.ingredient_id));
    const idToAliases = new Map<string, string[]>();
    aliases.forEach((a) => {
      const arr = idToAliases.get(a.ingredient_id) ?? [];
      arr.push(a.alias);
      idToAliases.set(a.ingredient_id, arr);
    });
    const canonicalToId = new Map<string, string>();
    ingredients.forEach((i) => canonicalToId.set(norm(i.canonical_name ?? ''), i.id));

    const hitsSupply = (candidate: string): boolean => {
      const n = norm(candidate);
      if (!n) return false;
      return supplyNames.some((sn) => sn.includes(n) || n.includes(sn));
    };

    const isCovered = (rawName: string): boolean => {
      if (hitsSupply(rawName)) return true;
      const n = norm(rawName);
      const ingId = aliasToId.get(n) ?? canonicalToId.get(n);
      if (!ingId) return false;
      const canonical = canonicalById.get(ingId);
      if (canonical && hitsSupply(canonical)) return true;
      return (idToAliases.get(ingId) ?? []).some((al) => hitsSupply(al));
    };

    // 彙整需求品項
    const demand = new Map<string, GapItem>();
    analyses.forEach((rec) => {
      (rec.ingredient_list ?? []).forEach((item) => {
        const raw = (item?.name ?? '').trim();
        if (!raw) return;
        const key = norm(raw);
        const prev = demand.get(key);
        if (prev) {
          prev.count += 1;
          if (item?.category && !prev.categories.includes(item.category)) {
            prev.categories.push(item.category);
          }
          if (rec.created_at > prev.lastSeen) prev.lastSeen = rec.created_at;
        } else {
          demand.set(key, {
            name: raw,
            count: 1,
            categories: item?.category ? [item.category] : [],
            lastSeen: rec.created_at,
          });
        }
      });
    });

    const all = [...demand.values()];
    const gaps = all
      .filter((d) => !isCovered(d.name))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hant'));

    return {
      totalItems: all.length,
      coveredItems: all.length - gaps.length,
      gaps,
      demandRequests: analyses.length,
    };
  }, [analyses, supplies, ingredients, aliases]);

  const filteredGaps = useMemo(() => {
    const q = gapSearch.trim().toLowerCase();
    if (!q) return gapAnalysis.gaps;
    return gapAnalysis.gaps.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [gapAnalysis.gaps, gapSearch]);

  const gapChartData = useMemo(
    () =>
      gapAnalysis.gaps.slice(0, 10).map((g) => ({
        name: g.name.length > 8 ? `${g.name.slice(0, 8)}…` : g.name,
        count: g.count,
      })),
    [gapAnalysis.gaps],
  );

  const exportGaps = () => {
    if (gapAnalysis.gaps.length === 0) return;
    const header = '品項,需求次數,分類,最近需求時間\n';
    const body = gapAnalysis.gaps
      .map(
        (g) =>
          `"${g.name.replace(/"/g, '""')}",${g.count},"${g.categories.join(' / ')}","${new Date(
            g.lastSeen,
          ).toLocaleString('zh-TW')}"`,
      )
      .join('\n');
    // 前置 BOM,Excel 開 CSV 才不會把中文變亂碼
    const blob = new Blob([`\uFEFF${header}${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `供給缺口招商名單_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已匯出 ${gapAnalysis.gaps.length} 個缺口品項`);
  };

  /* ---------------- 區塊 2:媒合了但沒成交 ---------------- */
  const lostAnalysis = useMemo(() => {
    const lost = orders
      .filter((o) => LOST_STATUSES.includes(o.status))
      .sort(
        (a, b) =>
          new Date(b.current_stage_since ?? b.created_at).getTime() -
          new Date(a.current_stage_since ?? a.created_at).getTime(),
      );

    const byStatus = new Map<OrderStatus, number>();
    lost.forEach((o) => byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1));

    const won = orders.filter((o) => WON_STATUSES.includes(o.status)).length;
    const stuck = lost.filter((o) => isStuck(o.status, o.current_stage_since)).length;

    return {
      lost,
      stuck,
      won,
      total: orders.length,
      byStatus: [...byStatus.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [orders]);

  /* ---------------- 區塊 3:信心分數校準 ---------------- */
  const calibration = useMemo(() => {
    const scored = (matchResults ?? []).filter((m) => m.confidence_score != null);

    if (scored.length > 0) {
      const buckets = CONF_BUCKETS.map((b) => {
        const rows = scored.filter(
          (m) => Number(m.confidence_score) >= b.min && Number(m.confidence_score) < b.max,
        );
        const accepted = rows.filter((r) => r.status === 'accepted').length;
        const rejected = rows.filter((r) => r.status === 'rejected').length;
        const decided = accepted + rejected;
        return {
          key: b.key,
          total: rows.length,
          accepted,
          rejected,
          decided,
          acceptRate: decided > 0 ? Math.round((accepted / decided) * 100) : null,
        };
      });

      const withRate = buckets.filter((b) => b.acceptRate != null);
      const decidedTotal = buckets.reduce((s, b) => s + b.decided, 0);
      let verdict: { tone: 'good' | 'warn' | 'unknown'; text: string };
      if (decidedTotal < 20 || withRate.length < 2) {
        verdict = {
          tone: 'unknown',
          text: `已判定樣本僅 ${decidedTotal} 筆,樣本數不足以判斷分數是否可信,建議累積到 20 筆以上再看`,
        };
      } else {
        const high = withRate[withRate.length - 1];
        const low = withRate[0];
        const spread = (high.acceptRate ?? 0) - (low.acceptRate ?? 0);
        verdict =
          spread >= 15
            ? {
                tone: 'good',
                text: `高信心區間 ${high.key} 的接受率 ${high.acceptRate}%,比低信心區間 ${low.key} 的 ${low.acceptRate}% 高出 ${spread} 個百分點 —— 分數有鑑別度`,
              }
            : {
                tone: 'warn',
                text: `高信心區間 ${high.key} 接受率 ${high.acceptRate}%,與低信心區間 ${low.key} 的 ${low.acceptRate}% 只差 ${spread} 個百分點 —— 分數鑑別度不足,建議重新校準權重`,
              };
      }

      return { mode: 'match_results' as const, buckets, verdict, sample: scored.length };
    }

    // 沒有 match_results → 用訂單狀態占比當替代指標
    const byStatus = new Map<OrderStatus, number>();
    orders.forEach((o) => byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1));
    const dist = [...byStatus.entries()]
      .map(([status, count]) => ({
        status,
        label: ORDER_STATUS[status]?.label ?? status,
        count,
        share: pct(count, orders.length),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      mode: 'orders' as const,
      dist,
      total: orders.length,
      won: orders.filter((o) => WON_STATUSES.includes(o.status)).length,
    };
  }, [matchResults, orders]);

  const coverage = pct(gapAnalysis.coveredItems, gapAnalysis.totalItems);

  const kpis = [
    {
      title: '需求品項數',
      value: gapAnalysis.totalItems,
      hint: `來自 ${gapAnalysis.demandRequests} 筆需求分析`,
      accent: 'text-slate-800',
      icon: PackageSearch,
      bg: 'bg-slate-100',
    },
    {
      title: '供給覆蓋率',
      value: `${coverage}%`,
      hint: `${gapAnalysis.coveredItems} 項在目錄裡找得到`,
      accent: coverage >= 70 ? 'text-emerald-600' : 'text-amber-600',
      icon: Target,
      bg: coverage >= 70 ? 'bg-emerald-50' : 'bg-amber-50',
    },
    {
      title: '供給缺口',
      value: gapAnalysis.gaps.length,
      hint: '沒有任何供應商能供,招商優先名單',
      accent: gapAnalysis.gaps.length > 0 ? 'text-red-600' : 'text-emerald-600',
      icon: AlertTriangle,
      bg: gapAnalysis.gaps.length > 0 ? 'bg-red-50' : 'bg-emerald-50',
    },
    {
      title: '派發後未成交',
      value: lostAnalysis.lost.length,
      hint: `全部 ${lostAnalysis.total} 筆訂單中`,
      accent: lostAnalysis.lost.length > 0 ? 'text-amber-600' : 'text-slate-800',
      icon: TrendingDown,
      bg: 'bg-amber-50',
    },
  ];

  /* ------------------------------ render ------------------------------ */
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">媒合品質監控 (Match Quality)</h1>
        <p className="text-sm text-slate-500 mb-6">需求接不住的地方在哪、媒合為什麼沒成交</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4">
                <Skeleton className="h-7 w-7 rounded-lg mb-2" />
                <Skeleton className="h-7 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">媒合品質監控 (Match Quality)</h1>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            重新整理
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        需求接不住的地方在哪、媒合為什麼沒成交、信心分數準不準
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
        {kpis.map(({ title, value, hint, accent, icon: Icon, bg }) => (
          <Card key={title} className="border border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{title}</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">{hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {/* ---------------- 區塊 1:供給缺口 ---------------- */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base text-slate-700">
                  供給缺口 —— 招商優先名單
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  客人問了、但目前沒有任何供應商能供的品項。這是最該去談新供應商的清單。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={gapSearch}
                    onChange={(e) => setGapSearch(e.target.value)}
                    placeholder="搜尋品項…"
                    className="pl-8 h-9 w-40"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportGaps}
                  disabled={gapAnalysis.gaps.length === 0}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  匯出 CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {gapAnalysis.totalItems === 0 ? (
              <div className="py-14 text-center text-slate-400">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">這段期間還沒有需求分析紀錄</p>
                <p className="text-xs mt-1">餐廳上傳菜單或跟 AI 對話之後,缺口分析就會出現在這裡</p>
              </div>
            ) : gapAnalysis.gaps.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                <p className="text-sm text-emerald-800 font-medium">
                  太好了 —— {gapAnalysis.totalItems} 個需求品項全部都有供應商可以供
                </p>
                <p className="text-xs text-emerald-700 mt-1">目前沒有需要優先招商的缺口</p>
              </div>
            ) : (
              <>
                {gapChartData.length > 1 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-2">缺口前 10 名(依需求次數)</p>
                    <ResponsiveContainer width="100%" height={Math.max(160, gapChartData.length * 28)}>
                      <BarChart data={gapChartData} layout="vertical" margin={{ left: 16, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={90}
                          tick={{ fontSize: 12, fill: '#475569' }}
                        />
                        <Tooltip />
                        <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} name="需求次數" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-slate-600">品項</TableHead>
                        <TableHead className="text-slate-600">分類</TableHead>
                        <TableHead className="text-slate-600 text-right">需求次數</TableHead>
                        <TableHead className="text-slate-600">最近需求</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGaps.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-slate-400 text-sm">
                            沒有符合「{gapSearch}」的缺口品項
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredGaps.slice(0, 100).map((g) => (
                          <TableRow key={g.name} className="hover:bg-slate-50">
                            <TableCell className="text-sm font-medium text-slate-800">{g.name}</TableCell>
                            <TableCell>
                              {g.categories.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {g.categories.map((c) => (
                                    <Badge
                                      key={c}
                                      variant="outline"
                                      className="bg-slate-100 text-slate-600 border-slate-300 text-[11px] px-1.5 py-0"
                                    >
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold text-red-600 tabular-nums">
                              {g.count}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                              {new Date(g.lastSeen).toLocaleDateString('zh-TW')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredGaps.length > 100 && (
                  <p className="text-xs text-slate-400 mt-2">
                    共 {filteredGaps.length} 項,表格只顯示前 100 項,完整名單請匯出 CSV
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ---------------- 區塊 2:媒合了但沒成交 ---------------- */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-700">媒合了但沒成交</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              已經派發給供應商、卻停在待接單／被拒單／逾時未回應的訂單 —— 媒合做了,錢沒進來
            </p>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="py-14 text-center text-slate-400">
                <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">目前還沒有任何訂單</p>
              </div>
            ) : lostAnalysis.lost.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-800">
                目前沒有卡在派發階段的訂單,{lostAnalysis.total} 筆訂單都有往下走
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">未成交筆數</p>
                    <p className="text-xl font-bold text-amber-600 tabular-nums">
                      {lostAnalysis.lost.length}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">佔全部訂單</p>
                    <p className="text-xl font-bold text-slate-800 tabular-nums">
                      {pct(lostAnalysis.lost.length, lostAnalysis.total)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">其中已超時</p>
                    <p
                      className={`text-xl font-bold tabular-nums ${
                        lostAnalysis.stuck > 0 ? 'text-red-600' : 'text-slate-800'
                      }`}
                    >
                      {lostAnalysis.stuck}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">已成交筆數</p>
                    <p className="text-xl font-bold text-emerald-600 tabular-nums">
                      {lostAnalysis.won}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {lostAnalysis.byStatus.map(({ status, count }) => (
                    <Badge
                      key={status}
                      variant="outline"
                      className={ORDER_STATUS[status]?.className ?? 'bg-slate-100 text-slate-700 border-slate-300'}
                    >
                      {ORDER_STATUS[status]?.label ?? status} · {count}
                    </Badge>
                  ))}
                </div>

                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-slate-600">訂單</TableHead>
                        <TableHead className="text-slate-600">餐廳</TableHead>
                        <TableHead className="text-slate-600">供應商</TableHead>
                        <TableHead className="text-slate-600">狀態</TableHead>
                        <TableHead className="text-slate-600">停留</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lostAnalysis.lost.slice(0, 50).map((o) => {
                        const stuck = isStuck(o.status, o.current_stage_since);
                        return (
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
                            <TableCell
                              className={`text-sm whitespace-nowrap tabular-nums ${
                                stuck ? 'font-semibold text-red-600' : 'text-slate-500'
                              }`}
                            >
                              {formatStageAge(o.current_stage_since ?? o.created_at)}
                              {stuck && ' ⚠'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  點任一列可看該筆訂單的完整履歷
                  {lostAnalysis.lost.length > 50 && ` · 共 ${lostAnalysis.lost.length} 筆,只顯示前 50 筆`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* ---------------- 區塊 3:信心分數校準 ---------------- */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-700">信心分數校準</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {calibration.mode === 'match_results'
                ? '媒合結果的信心分數,實際被接受的比例有沒有跟著上升 —— 上升才代表分數可信'
                : '尚無媒合信心分數資料,改用訂單狀態分布觀察媒合成果落在哪裡'}
            </p>
          </CardHeader>
          <CardContent>
            {calibration.mode === 'match_results' ? (
              <>
                <div
                  className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                    calibration.verdict.tone === 'good'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : calibration.verdict.tone === 'warn'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {calibration.verdict.text}
                </div>
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-slate-600">信心區間</TableHead>
                        <TableHead className="text-slate-600 text-right">筆數</TableHead>
                        <TableHead className="text-slate-600 text-right">已接受</TableHead>
                        <TableHead className="text-slate-600 text-right">已拒絕</TableHead>
                        <TableHead className="text-slate-600">實際接受率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calibration.buckets.map((b) => (
                        <TableRow key={b.key} className="hover:bg-slate-50">
                          <TableCell className="text-sm font-medium text-slate-800">{b.key}</TableCell>
                          <TableCell className="text-right text-sm text-slate-700 tabular-nums">
                            {b.total}
                          </TableCell>
                          <TableCell className="text-right text-sm text-emerald-600 tabular-nums">
                            {b.accepted}
                          </TableCell>
                          <TableCell className="text-right text-sm text-red-500 tabular-nums">
                            {b.rejected}
                          </TableCell>
                          <TableCell>
                            {b.acceptRate == null ? (
                              <span className="text-slate-400 text-sm">尚無判定</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden min-w-[80px]">
                                  <div
                                    className="h-full rounded bg-emerald-500"
                                    style={{ width: `${b.acceptRate}%` }}
                                  />
                                </div>
                                <span className="text-sm text-slate-700 tabular-nums w-10 text-right">
                                  {b.acceptRate}%
                                </span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  資料來源:match_results,共 {calibration.sample} 筆有信心分數的媒合結果
                </p>
              </>
            ) : calibration.total === 0 ? (
              <div className="py-14 text-center text-slate-400">
                <Gauge className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">尚無媒合信心分數,也還沒有訂單可以統計</p>
                <p className="text-xs mt-1">開始媒合並派發訂單之後,這裡會顯示分數校準結果</p>
              </div>
            ) : (
              <>
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  目前沒有 match_results 信心分數可校準,以下用 {calibration.total} 筆訂單的狀態分布替代
                  —— 成交率 {pct(calibration.won, calibration.total)}%
                </div>
                <div className="space-y-2.5">
                  {calibration.dist.map((d) => (
                    <div key={d.status} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-sm text-slate-600 text-right truncate">
                        {d.label}
                      </div>
                      <div className="flex-1 h-6 rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(d.share, 100)}%` }}
                        />
                      </div>
                      <div className="w-24 shrink-0 text-sm tabular-nums text-right">
                        <span className="font-semibold text-slate-800">{d.count}</span>
                        <span className="text-slate-400 ml-1.5">{d.share}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
