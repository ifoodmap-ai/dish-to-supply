import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CalendarClock,
  Loader2,
  PackageX,
  Sprout,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface SupplyRow {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  is_available: boolean | null;
}

interface AnalysisIngredient {
  name?: string;
  quantity?: string | number;
  unit?: string;
}

interface AnalysisRow {
  id: string;
  created_at: string;
  ingredient_list: AnalysisIngredient[] | null;
}

interface IngredientRow {
  id: string;
  canonical_name: string;
  category: string | null;
  season_months: number[] | null;
}

interface AliasRow {
  ingredient_id: string;
  alias: string;
}

interface ItemForecast {
  name: string;
  unit: string | null;
  weekly: number[]; // index 0 = 本週,index 越大越舊
  total: number;
  times: number;
  suggested: number;
  growthPct: number;
  season: 'incoming' | 'ongoing' | null;
}

/** 與 src/lib/api.ts 相同的名稱正規化(去空白、去括號註記) */
const normalizeName = (s: string) =>
  s.toLowerCase().replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '');

const sameItem = (a: string, b: string) => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
};

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 13; // 近 90 天 ≈ 13 週

/** 以週一為起點,取得該日期所屬週的起始日 */
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 週一 = 0
  x.setDate(x.getDate() - dow);
  return x;
};

/** 數量欄位可能是 "3 kg" / "3" / 3,取第一個數字,取不到就當 1 份需求 */
const parseQty = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const m = String(v ?? '').match(/\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const clampGrowth = (v: number) => Math.max(-100, Math.min(200, Math.round(v)));

const MONTH_LABEL = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

export default function SupplierForecastPage() {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: acct } = (await (supabase as never)
        .from('supplier_accounts')
        .select('supplier_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()) as { data: { supplier_id: string } | null };

      const sid = acct?.supplier_id ?? null;
      if (!sid) {
        setLoading(false);
        return;
      }
      setSupplierId(sid);

      const since = new Date(Date.now() - 90 * DAY).toISOString();
      const [suppliesRes, analysisRes, ingredientRes, aliasRes] = await Promise.all([
        (supabase as never)
          .from('supplies')
          .select('id, name, category, unit, is_available')
          .eq('supplier_id', sid) as Promise<{ data: SupplyRow[] | null }>,
        (supabase as never)
          .from('analysis_records')
          .select('id, created_at, ingredient_list')
          .gte('created_at', since) as Promise<{ data: AnalysisRow[] | null }>,
        (supabase as never)
          .from('ingredients')
          .select('id, canonical_name, category, season_months') as Promise<{
          data: IngredientRow[] | null;
        }>,
        (supabase as never)
          .from('ingredient_aliases')
          .select('ingredient_id, alias') as Promise<{ data: AliasRow[] | null }>,
      ]);

      setSupplies(suppliesRes.data ?? []);
      setAnalyses(analysisRes.data ?? []);
      setIngredients(ingredientRes.data ?? []);
      setAliases(aliasRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  const nextMonth = useMemo(() => ((new Date().getMonth() + 1) % 12) + 1, []);
  const thisMonth = useMemo(() => new Date().getMonth() + 1, []);

  const derived = useMemo(() => {
    const thisWeekStart = startOfWeek(new Date()).getTime();

    // 供應品項 → 每週需求量
    const weeklyByItem = new Map<string, number[]>();
    const timesByItem = new Map<string, number>();
    const weeklyTotal = new Array(WEEKS).fill(0) as number[];
    const matchedAnalysisIds = new Set<string>();

    supplies.forEach((s) => {
      weeklyByItem.set(s.name, new Array(WEEKS).fill(0) as number[]);
      timesByItem.set(s.name, 0);
    });

    analyses.forEach((rec) => {
      const t = startOfWeek(new Date(rec.created_at)).getTime();
      const idx = Math.round((thisWeekStart - t) / (7 * DAY));
      if (!Number.isFinite(idx) || idx < 0 || idx >= WEEKS) return;

      (rec.ingredient_list ?? []).forEach((ing) => {
        const raw = ing?.name?.trim();
        if (!raw) return;
        const hit = supplies.find((s) => sameItem(s.name, raw));
        if (!hit) return;
        const qty = parseQty(ing.quantity);
        const bucket = weeklyByItem.get(hit.name);
        if (bucket) bucket[idx] += qty;
        weeklyTotal[idx] += qty;
        timesByItem.set(hit.name, (timesByItem.get(hit.name) ?? 0) + 1);
        matchedAnalysisIds.add(rec.id);
      });
    });

    // 產季查詢:先用 canonical_name,再用別名
    const aliasList = aliases.map((a) => ({
      ingredientId: a.ingredient_id,
      alias: a.alias,
    }));

    const seasonOf = (supplyName: string): number[] | null => {
      const direct = ingredients.find((i) => sameItem(i.canonical_name, supplyName));
      if (direct) return direct.season_months ?? null;
      const viaAlias = aliasList.find((a) => sameItem(a.alias, supplyName));
      if (!viaAlias) return null;
      const ing = ingredients.find((i) => i.id === viaAlias.ingredientId);
      return ing?.season_months ?? null;
    };

    const items: ItemForecast[] = supplies
      .map((s) => {
        const weekly = weeklyByItem.get(s.name) ?? (new Array(WEEKS).fill(0) as number[]);
        const total = weekly.reduce((a, b) => a + b, 0);

        // 近 4 個完整週(index 1~4)移動平均;若完整週無資料則退回本週
        const recent4 = weekly.slice(1, 5).reduce((a, b) => a + b, 0);
        const prev4 = weekly.slice(5, 9).reduce((a, b) => a + b, 0);
        const base = recent4 > 0 ? recent4 / 4 : weekly[0];
        const suggested = base > 0 ? Math.ceil(base) : 0;

        const growthPct = clampGrowth(
          prev4 > 0 ? ((recent4 - prev4) / prev4) * 100 : recent4 > 0 ? 100 : 0,
        );

        const months = seasonOf(s.name);
        let season: ItemForecast['season'] = null;
        if (months && months.includes(nextMonth)) {
          season = months.includes(thisMonth) ? 'ongoing' : 'incoming';
        }

        return {
          name: s.name,
          unit: s.unit,
          weekly,
          total,
          times: timesByItem.get(s.name) ?? 0,
          suggested,
          growthPct,
          season,
        };
      })
      .sort((a, b) => b.total - a.total || b.suggested - a.suggested || a.name.localeCompare(b.name));

    // 圖表資料:由舊到新
    const chartData = Array.from({ length: WEEKS }, (_, i) => {
      const idx = WEEKS - 1 - i;
      const start = new Date(thisWeekStart - idx * 7 * DAY);
      const label = `${start.getMonth() + 1}/${start.getDate()}`;
      return {
        label: idx === 0 ? '本週' : label,
        demand: Math.round(weeklyTotal[idx] * 10) / 10,
      };
    });

    const recentTotal = weeklyTotal.slice(1, 5).reduce((a, b) => a + b, 0);
    const prevTotal = weeklyTotal.slice(5, 9).reduce((a, b) => a + b, 0);
    const overallGrowth = clampGrowth(
      prevTotal > 0 ? ((recentTotal - prevTotal) / prevTotal) * 100 : recentTotal > 0 ? 100 : 0,
    );

    const activeItems = items.filter((i) => i.total > 0);
    const seasonItems = items.filter((i) => i.season !== null);
    const totalSuggested = items.reduce((a, b) => a + b.suggested, 0);

    return {
      items,
      activeItems,
      seasonItems,
      chartData,
      overallGrowth,
      totalSuggested,
      matchedCount: matchedAnalysisIds.size,
    };
  }, [supplies, analyses, ingredients, aliases, nextMonth, thisMonth]);

  const kpis = [
    {
      label: '有需求的供應品項',
      value: `${derived.activeItems.length} / ${supplies.length}`,
      hint: '近 90 天曾被需求的品項',
      icon: Boxes,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
    },
    {
      label: '相關需求單數',
      value: derived.matchedCount,
      hint: '近 90 天命中你供應品項的需求分析',
      icon: CalendarClock,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: '需求成長',
      value: `${derived.overallGrowth >= 0 ? '+' : ''}${derived.overallGrowth}%`,
      hint: '近 4 週 vs 前 4 週',
      icon: TrendingUp,
      accent: derived.overallGrowth >= 0 ? 'text-emerald-600' : 'text-red-600',
      bg: derived.overallGrowth >= 0 ? 'bg-emerald-50' : 'bg-red-50',
    },
    {
      label: '下週建議備貨合計',
      value: derived.totalSuggested,
      hint: '近 4 週移動平均',
      icon: Sprout,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">需求預測</h1>
      <p className="text-sm text-gray-500 mb-6">
        依平台近 90 天的食材需求分析,推估你供應品項的下週備貨量與產季時機
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ label, value, hint, icon: Icon, accent, bg }) => (
          <Card key={label} className="border border-gray-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-2xl font-bold tabular-nums ${accent}`}>
                {loading ? '—' : value}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">{label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500" size={28} />
        </div>
      ) : !supplierId ? (
        <div className="text-center py-20 text-gray-400">此帳號尚未綁定供應商</div>
      ) : supplies.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <PackageX size={40} className="mx-auto mb-3 opacity-40" />
          <p>尚未建立商品目錄,無法比對平台需求</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 產季提示 */}
          {derived.seasonItems.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-emerald-800 flex items-center gap-2">
                  <Sprout size={16} />
                  產季建議({MONTH_LABEL[nextMonth - 1]})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {derived.seasonItems.map((i) => (
                    <Badge
                      key={i.name}
                      variant="outline"
                      className={
                        i.season === 'incoming'
                          ? 'bg-white text-emerald-700 border-emerald-300'
                          : 'bg-white text-slate-600 border-slate-300'
                      }
                    >
                      {i.name}·{i.season === 'incoming' ? '即將進入產季' : '產季持續中'}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-emerald-700/70 mt-3">
                  即將進入產季的品項供給量會上升,建議提前備貨並檢視定價以搶下訂單。
                </p>
              </CardContent>
            </Card>
          )}

          {/* 每週需求量柱狀圖 */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">近 13 週需求量趨勢</CardTitle>
            </CardHeader>
            <CardContent>
              {derived.activeItems.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">
                  近 90 天沒有命中你供應品項的需求紀錄
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={derived.chartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [v, '需求量']} />
                    <Bar dataKey="demand" fill="#10b981" radius={[4, 4, 0, 0]} name="需求量" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 備貨建議表 */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">下週備貨建議</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">品項</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">近 90 天需求量</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">被需求次數</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">近 4 週趨勢</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">下週建議備貨</th>
                        <th className="text-center px-5 py-3 font-medium text-gray-600 whitespace-nowrap">產季</th>
                      </tr>
                    </thead>
                    <tbody>
                      {derived.items.map((i) => (
                        <tr key={i.name} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{i.name}</td>
                          <td className="px-5 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">
                            {i.total > 0 ? `${Math.round(i.total * 10) / 10} ${i.unit ?? ''}` : '—'}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600 tabular-nums">
                            {i.times > 0 ? i.times : '—'}
                          </td>
                          <td
                            className={`px-5 py-3 text-right tabular-nums whitespace-nowrap ${
                              i.total === 0
                                ? 'text-gray-400'
                                : i.growthPct > 0
                                  ? 'text-emerald-600'
                                  : i.growthPct < 0
                                    ? 'text-red-600'
                                    : 'text-gray-500'
                            }`}
                          >
                            {i.total === 0 ? '—' : `${i.growthPct >= 0 ? '+' : ''}${i.growthPct}%`}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                            {i.suggested > 0 ? `${i.suggested} ${i.unit ?? ''}` : '—'}
                          </td>
                          <td className="px-5 py-3 text-center whitespace-nowrap">
                            {i.season === 'incoming' ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                即將進入產季
                              </Badge>
                            ) : i.season === 'ongoing' ? (
                              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">
                                產季中
                              </Badge>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                建議備貨量 = 近 4 個完整週需求的移動平均(無完整週資料時以本週推估),成長率已限制在 -100% ~ +200%。
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
