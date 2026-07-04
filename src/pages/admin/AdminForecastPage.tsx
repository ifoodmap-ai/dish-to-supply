import { useEffect, useMemo, useState } from 'react';
import { Boxes, ClipboardList, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

interface Ingredient {
  name?: string;
  quantity?: string;
  unit?: string;
}

interface AnalysisRow {
  id: string;
  created_at: string;
  ingredient_list: Ingredient[] | null;
}

interface ForecastRow {
  name: string;
  recentCount: number;
  totalCount: number;
  predicted: number;
  level: '高' | '中' | '低';
}

// 成長因子:近 14 天需求趨勢向上時上調預測,持平/下降則保守
const GROWTH_FACTOR = 1.15;

const levelBadgeClass: Record<ForecastRow['level'], string> = {
  高: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  中: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  低: 'bg-slate-100 text-slate-600 border-slate-300',
};

const AdminForecastPage = () => {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = (await (supabase as never)
        .from('analysis_records')
        .select('id, created_at, ingredient_list')
        .order('created_at', { ascending: false })) as {
        data: AnalysisRow[] | null;
      };
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const derived = useMemo(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const recentCutoff = now - 14 * DAY;
    const prevCutoff = now - 28 * DAY;

    // 逐食材彙總:總出現次數、近 14 天次數、前一期(15~28 天)次數
    const totalCount = new Map<string, number>();
    const recentCount = new Map<string, number>();
    const prevCount = new Map<string, number>();

    let recentDemandRecords = 0; // 近 14 天有效需求筆數(analysis 筆數)

    rows.forEach((r) => {
      const t = new Date(r.created_at).getTime();
      const isRecent = t >= recentCutoff;
      const isPrev = t >= prevCutoff && t < recentCutoff;
      if (isRecent && (r.ingredient_list?.length ?? 0) > 0) recentDemandRecords += 1;

      (r.ingredient_list ?? []).forEach((i) => {
        const n = i?.name?.trim();
        if (!n) return;
        totalCount.set(n, (totalCount.get(n) ?? 0) + 1);
        if (isRecent) recentCount.set(n, (recentCount.get(n) ?? 0) + 1);
        if (isPrev) prevCount.set(n, (prevCount.get(n) ?? 0) + 1);
      });
    });

    const trackedCount = totalCount.size;

    // 全平台近期 vs 前期的整體成長率
    const recentTotal = [...recentCount.values()].reduce((a, b) => a + b, 0);
    const prevTotal = [...prevCount.values()].reduce((a, b) => a + b, 0);
    const rawGrowth =
      prevTotal > 0
        ? Math.round(((recentTotal - prevTotal) / prevTotal) * 100)
        : recentTotal > 0
          ? 100
          : 0;
    // clamp for sane display (sparse data can otherwise explode to +2000%)
    const growthPct = Math.max(-100, Math.min(200, rawGrowth));

    // 每個食材的預測下期需求 = 近期次數(無近期資料則退回歷史平均近似)* 成長因子
    const forecasts: ForecastRow[] = [...totalCount.entries()]
      .map(([name, total]) => {
        const recent = recentCount.get(name) ?? 0;
        const base = recent > 0 ? recent : Math.max(1, Math.round(total / 4));
        const predicted = Math.max(1, Math.round(base * GROWTH_FACTOR));
        return { name, recentCount: recent, totalCount: total, predicted, level: '低' as const };
      })
      .sort((a, b) => b.predicted - a.predicted || b.totalCount - a.totalCount);

    // 依預測值分級:前 1/3 高、中段 中、其餘 低
    const n = forecasts.length;
    forecasts.forEach((f, idx) => {
      if (n === 0) return;
      const ratio = idx / n;
      f.level = ratio < 1 / 3 ? '高' : ratio < 2 / 3 ? '中' : '低';
    });

    const chartData = forecasts.slice(0, 10).map((f) => ({ name: f.name, predicted: f.predicted }));

    return { trackedCount, recentDemandRecords, growthPct, forecasts, chartData };
  }, [rows]);

  const kpis = [
    {
      title: '追蹤食材數',
      value: derived.trackedCount,
      icon: Boxes,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
    },
    {
      title: '本期需求筆數',
      value: derived.recentDemandRecords,
      icon: ClipboardList,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: '預測成長',
      value: `${derived.growthPct >= 0 ? '+' : ''}${derived.growthPct}%`,
      icon: TrendingUp,
      accent: derived.growthPct >= 0 ? 'text-emerald-600' : 'text-red-600',
      bg: derived.growthPct >= 0 ? 'bg-emerald-50' : 'bg-red-50',
    },
  ];

  const isEmpty = !loading && derived.forecasts.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">需求預測與備貨建議 (Demand Forecast)</h1>
      <p className="text-sm text-slate-500 mb-6">
        彙總歷史需求分析,預測下期各食材需求量並提供備貨建議
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {kpis.map(({ title, value, icon: Icon, accent, bg }) => (
          <Card key={title} className="border border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-2xl font-bold ${accent}`}>{loading ? '—' : value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : isEmpty ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            尚無需求分析資料,無法產生預測 (No analysis records yet)
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Predicted-demand bar chart */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">
                預測下期需求 Top 10 (Predicted Demand)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={derived.chartData}
                  layout="vertical"
                  margin={{ left: 24, right: 24, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 12, fill: '#475569' }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="predicted"
                    fill="#10b981"
                    radius={[0, 4, 4, 0]}
                    name="預測需求"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Forecast table */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">備貨建議明細 (Restock Plan)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-slate-600">食材</TableHead>
                      <TableHead className="text-slate-600 text-right">近期需求次數</TableHead>
                      <TableHead className="text-slate-600 text-right">預測下期需求</TableHead>
                      <TableHead className="text-slate-600 text-center">備貨建議</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {derived.forecasts.map((f) => (
                      <TableRow key={f.name} className="hover:bg-slate-50">
                        <TableCell className="text-sm font-medium text-slate-700">
                          {f.name}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 text-right tabular-nums">
                          {f.recentCount}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-emerald-700 text-right tabular-nums">
                          {f.predicted}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={levelBadgeClass[f.level]}>
                            {f.level}
                          </Badge>
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
};

export default AdminForecastPage;
