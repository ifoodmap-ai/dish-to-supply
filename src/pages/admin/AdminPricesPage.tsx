import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  AlertTriangle,
  ExternalLink,
  Database,
  Layers,
  Clock,
  LineChart as LineChartIcon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface PriceRow {
  id: string;
  ingredient_id: string | null;
  supply_id: string | null;
  supplier_id: string | null;
  raw_name: string | null;
  price: number | null;
  unit: string | null;
  normalized_price: number | null;
  region: string | null;
  captured_at: string | null;
}

interface IngredientLite {
  id: string;
  canonical_name: string;
}

interface SupplierLite {
  id: string;
  name: string;
}

interface EvaluatedRow extends PriceRow {
  value: number | null;
  median: number | null;
  ratio: number | null;
  groupSize: number;
  anomaly: boolean;
}

const ALL = '__all__';
const UNMAPPED = '__unmapped__';

/** 偏離中位數超過這個倍數(或低於其倒數)即視為異常 */
const ANOMALY_FACTOR = 3;
/** 樣本數太少時中位數沒有意義,不做判定 */
const MIN_SAMPLES = 3;

const normalize = (s: string): string =>
  (s || '').toLowerCase().replace(/[\s\u3000·・、,，.。/\\()（）[\]【】「」-]/g, '').trim();

const median = (nums: number[]): number | null => {
  if (nums.length === 0) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const fmtMoney = (v: number | null): string =>
  v == null ? '—' : `$${Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;

const AdminPricesPage = () => {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState<string>(ALL);
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [phRes, ingRes, supRes] = await Promise.all([
      (supabase as never)
        .from('price_history')
        .select(
          'id, ingredient_id, supply_id, supplier_id, raw_name, price, unit, normalized_price, region, captured_at',
        )
        .order('captured_at', { ascending: false })
        .limit(1000),
      (supabase as never)
        .from('ingredients')
        .select('id, canonical_name')
        .order('canonical_name', { ascending: true }),
      (supabase as never).from('suppliers').select('id, name'),
    ]);

    const err = (phRes as { error: { message?: string } | null }).error;
    if (err) toast.error('載入價格資料失敗', { description: err.message });

    setRows(((phRes as { data: PriceRow[] | null }).data) ?? []);
    setIngredients(((ingRes as { data: IngredientLite[] | null }).data) ?? []);
    setSuppliers(((supRes as { data: SupplierLite[] | null }).data) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const ingredientName = useCallback(
    (id: string | null) => (id ? ingredients.find((i) => i.id === id)?.canonical_name ?? null : null),
    [ingredients],
  );

  const supplierName = useCallback(
    (id: string | null) => (id ? suppliers.find((s) => s.id === id)?.name ?? null : null),
    [suppliers],
  );

  /** 依「食材主檔 id」分組(沒對應主檔就退回用正規化後的 raw_name),算中位數與偏離倍數 */
  const evaluated = useMemo<EvaluatedRow[]>(() => {
    const groupKey = (r: PriceRow) =>
      r.ingredient_id ? `ing:${r.ingredient_id}` : `raw:${normalize(r.raw_name ?? '')}`;

    const valueOf = (r: PriceRow): number | null => {
      const v = r.normalized_price != null ? r.normalized_price : r.price;
      return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
    };

    const buckets = new Map<string, number[]>();
    rows.forEach((r) => {
      const v = valueOf(r);
      if (v == null || v <= 0) return;
      const k = groupKey(r);
      const list = buckets.get(k) ?? [];
      list.push(v);
      buckets.set(k, list);
    });

    const medians = new Map<string, number | null>();
    buckets.forEach((list, k) => medians.set(k, median(list)));

    return rows.map((r) => {
      const k = groupKey(r);
      const value = valueOf(r);
      const med = medians.get(k) ?? null;
      const groupSize = (buckets.get(k) ?? []).length;
      const ratio = value != null && med != null && med > 0 ? value / med : null;
      const anomaly =
        groupSize >= MIN_SAMPLES &&
        ratio != null &&
        (ratio >= ANOMALY_FACTOR || ratio <= 1 / ANOMALY_FACTOR);
      return { ...r, value, median: med, ratio, groupSize, anomaly };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return evaluated.filter((r) => {
      if (ingredientFilter === UNMAPPED && r.ingredient_id) return false;
      if (ingredientFilter !== ALL && ingredientFilter !== UNMAPPED && r.ingredient_id !== ingredientFilter)
        return false;
      if (onlyAnomaly && !r.anomaly) return false;
      if (!q) return true;
      const hay = [
        r.raw_name ?? '',
        ingredientName(r.ingredient_id) ?? '',
        supplierName(r.supplier_id) ?? '',
        r.region ?? '',
        r.unit ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [evaluated, search, ingredientFilter, onlyAnomaly, ingredientName, supplierName]);

  const stats = useMemo(() => {
    const covered = new Set<string>();
    let latest: string | null = null;
    evaluated.forEach((r) => {
      if (r.ingredient_id) covered.add(r.ingredient_id);
      if (r.captured_at && (!latest || r.captured_at > latest)) latest = r.captured_at;
    });
    return {
      total: evaluated.length,
      covered: covered.size,
      unmapped: evaluated.filter((r) => !r.ingredient_id).length,
      anomalies: evaluated.filter((r) => r.anomaly).length,
      latest,
    };
  }, [evaluated]);

  /** 選定單一食材時,畫每日中位價走勢 */
  const trend = useMemo(() => {
    if (ingredientFilter === ALL || ingredientFilter === UNMAPPED) return [];
    const byDay = new Map<string, number[]>();
    evaluated.forEach((r) => {
      if (r.ingredient_id !== ingredientFilter) return;
      if (r.value == null || r.value <= 0 || !r.captured_at) return;
      const d = r.captured_at.slice(0, 10);
      const list = byDay.get(d) ?? [];
      list.push(r.value);
      byDay.set(d, list);
    });
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({ date: date.slice(5), price: median(list) ?? 0, count: list.length }));
  }, [evaluated, ingredientFilter]);

  const kpis = [
    { label: '價格資料筆數', value: stats.total, icon: Database, accent: 'text-slate-800', bg: 'bg-slate-100' },
    { label: '涵蓋食材數', value: stats.covered, icon: Layers, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    {
      label: '最近更新',
      value: stats.latest ? new Date(stats.latest).toLocaleString('zh-TW') : '—',
      icon: Clock,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '疑似異常',
      value: stats.anomalies,
      icon: AlertTriangle,
      accent: stats.anomalies > 0 ? 'text-red-600' : 'text-slate-800',
      bg: stats.anomalies > 0 ? 'bg-red-50' : 'bg-slate-100',
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">價格資料維護 (Prices)</h1>
        <Button variant="outline" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          重新載入
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        price_history 是比價與行情指數的原料。偏離同食材中位數 {ANOMALY_FACTOR} 倍以上的報價會被標紅,通常是單位填錯(斤 vs 箱)。
      </p>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpis.map(({ label, value, icon: Icon, accent, bg }) => (
          <Card key={label} className="border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-xl font-bold ${accent} break-words`}>{loading ? '—' : value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 篩選列 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜尋原始名稱 / 供應商 / 產區…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={ingredientFilter} onValueChange={setIngredientFilter}>
          <SelectTrigger className="sm:w-60 bg-white">
            <SelectValue placeholder="全部食材" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>全部食材</SelectItem>
            <SelectItem value={UNMAPPED}>
              <span className="text-amber-600">尚未對應主檔 ({stats.unmapped})</span>
            </SelectItem>
            {ingredients.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.canonical_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:ml-auto whitespace-nowrap">
          <Switch checked={onlyAnomaly} onCheckedChange={setOnlyAnomaly} />
          只看疑似異常
          {stats.anomalies > 0 && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              {stats.anomalies}
            </Badge>
          )}
        </label>
      </div>

      {/* 單一食材價格走勢 */}
      {trend.length > 1 && (
        <Card className="border-slate-200 mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700 inline-flex items-center gap-1.5">
              <LineChartIcon className="h-4 w-4 text-emerald-600" />
              {ingredientName(ingredientFilter)} 每日中位價走勢
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  name="中位價"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 資料表 */}
      <div className="rounded-md border border-slate-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-slate-600">食材</TableHead>
              <TableHead className="text-slate-600">原始名稱</TableHead>
              <TableHead className="text-slate-600">供應商</TableHead>
              <TableHead className="text-slate-600 text-right">報價</TableHead>
              <TableHead className="text-slate-600 text-right">標準化單價</TableHead>
              <TableHead className="text-slate-600 text-right">同食材中位數</TableHead>
              <TableHead className="text-slate-600">偏離</TableHead>
              <TableHead className="text-slate-600 whitespace-nowrap">擷取時間</TableHead>
              <TableHead className="text-slate-600 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                  {rows.length === 0
                    ? '尚無價格資料,供應商報價與爬取的行情會累積在 price_history'
                    : onlyAnomaly
                      ? '目前沒有偵測到異常報價 🎉'
                      : '沒有符合條件的資料'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const ing = ingredientName(r.ingredient_id);
                const sup = supplierName(r.supplier_id);
                return (
                  <TableRow key={r.id} className={r.anomaly ? 'bg-red-50/70 hover:bg-red-50' : 'hover:bg-slate-50'}>
                    <TableCell className="text-sm">
                      {ing ? (
                        <span className="text-slate-800">{ing}</span>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          未對應主檔
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 max-w-[200px]">
                      <span className="block truncate">{r.raw_name ?? '—'}</span>
                      {r.region && <span className="text-xs text-slate-400">{r.region}</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {sup ?? <span className="text-slate-400 italic">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-right text-slate-800 tabular-nums whitespace-nowrap">
                      {fmtMoney(r.price)}
                      {r.unit && <span className="text-slate-400"> / {r.unit}</span>}
                    </TableCell>
                    <TableCell className="text-sm text-right text-slate-700 tabular-nums">
                      {fmtMoney(r.normalized_price)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-slate-500 tabular-nums">
                      {fmtMoney(r.median)}
                      {r.groupSize > 0 && (
                        <span className="text-xs text-slate-400"> ({r.groupSize})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.ratio == null ? (
                        <span className="text-slate-400">—</span>
                      ) : r.anomaly ? (
                        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 whitespace-nowrap">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          ×{r.ratio.toFixed(1)} 疑似單位填錯或報價異常
                        </Badge>
                      ) : (
                        <span className="text-sm text-slate-500 tabular-nums">×{r.ratio.toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                      {r.captured_at ? new Date(r.captured_at).toLocaleString('zh-TW') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.supplier_id ? (
                        <a
                          href={`/supplier/${r.supplier_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 hover:underline whitespace-nowrap"
                          title="開啟該供應商品項,修正單位或價格"
                        >
                          修正品項
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          顯示 {filtered.length} / {evaluated.length} 筆(最多載入最近 1000 筆)。
          中位數以同一食材主檔分組計算,未對應主檔者退回用正規化後的原始名稱分組,樣本數少於 {MIN_SAMPLES} 筆不做異常判定。
        </p>
      )}
    </div>
  );
};

export default AdminPricesPage;
