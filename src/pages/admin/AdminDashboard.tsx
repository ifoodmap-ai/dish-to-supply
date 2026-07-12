import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, CheckCircle, Package, Store, Boxes, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface AnalysisRow {
  id: string;
  created_at: string;
  source_type: string;
  status: string;
  ingredient_list: { name?: string }[] | null;
}

const SOURCE_LABEL: Record<string, string> = { menu_upload: '菜單上傳', chatbot: '對話萃取' };
const PIE_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];

const FUNNEL_STAGES: { event: string; label: string }[] = [
  { event: 'analysis_started', label: '開始分析' },
  { event: 'analysis_completed', label: '完成分析' },
  { event: 'contact_captured', label: '留下聯絡' },
  { event: 'match_viewed', label: '看媒合' },
  { event: 'inquiry_sent', label: '送出詢價' },
];

const AdminDashboard = () => {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [suppliersCount, setSuppliersCount] = useState(0);
  const [suppliesCount, setSuppliesCount] = useState(0);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [aRes, oRes, spRes, suRes, evRes] = await Promise.all([
        (supabase as never)
          .from('analysis_records')
          .select('id, created_at, source_type, status, ingredient_list')
          .order('created_at', { ascending: true }),
        (supabase as never).from('supplier_orders').select('id', { count: 'exact', head: true }),
        (supabase as never).from('suppliers').select('id', { count: 'exact', head: true }),
        (supabase as never).from('supplies').select('id', { count: 'exact', head: true }),
        (supabase as never).from('app_events').select('event'),
      ]);
      setRows(((aRes as { data: AnalysisRow[] | null }).data) ?? []);
      setOrdersCount((oRes as { count: number | null }).count ?? 0);
      setSuppliersCount((spRes as { count: number | null }).count ?? 0);
      setSuppliesCount((suRes as { count: number | null }).count ?? 0);
      const events = ((evRes as { data: { event: string }[] | null }).data) ?? [];
      const counts: Record<string, number> = {};
      events.forEach((e) => {
        if (e?.event) counts[e.event] = (counts[e.event] ?? 0) + 1;
      });
      setEventCounts(counts);
      setLoading(false);
    })();
  }, []);

  const derived = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.status === 'pending_review').length;
    const sent = rows.filter((r) => r.status === 'sent').length;
    const matchRate = total > 0 ? Math.round((sent / total) * 100) : 0;

    // trend by day
    const byDay = new Map<string, number>();
    rows.forEach((r) => {
      const d = r.created_at.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    });
    const trend = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));

    // source breakdown
    const bySource = new Map<string, number>();
    rows.forEach((r) => bySource.set(r.source_type, (bySource.get(r.source_type) ?? 0) + 1));
    const sources = [...bySource.entries()].map(([k, v]) => ({ name: SOURCE_LABEL[k] ?? k, value: v }));

    // top ingredients
    const ingCount = new Map<string, number>();
    rows.forEach((r) =>
      (r.ingredient_list ?? []).forEach((i) => {
        const n = i?.name?.trim();
        if (n) ingCount.set(n, (ingCount.get(n) ?? 0) + 1);
      }),
    );
    const topIngredients = [...ingCount.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    return { total, pending, sent, matchRate, trend, sources, topIngredients };
  }, [rows]);

  const kpis = [
    { title: '需求總數', value: derived.total, icon: ClipboardList, accent: 'text-slate-700', bg: 'bg-slate-100' },
    { title: '待審核', value: derived.pending, icon: TrendingUp, accent: 'text-yellow-600', bg: 'bg-yellow-50' },
    { title: '已媒合', value: derived.sent, icon: CheckCircle, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '媒合率', value: `${derived.matchRate}%`, icon: TrendingUp, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '供應商數', value: suppliersCount, icon: Store, accent: 'text-blue-600', bg: 'bg-blue-50' },
    { title: '上架商品', value: suppliesCount, icon: Boxes, accent: 'text-purple-600', bg: 'bg-purple-50' },
    { title: '總訂單', value: ordersCount, icon: Package, accent: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">營運儀表板 (Dashboard)</h1>
      <p className="text-sm text-slate-500 mb-6">平台需求媒合與供應鏈營運概況</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">需求分析趨勢</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={derived.trend} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fill="url(#g)" name="需求數" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">需求來源</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={derived.sources} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {derived.sources.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-base text-slate-700">熱門採購食材 Top 8</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={derived.topIngredients} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="出現次數" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 轉換漏斗 */}
        <Card className="border-slate-200 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">轉換漏斗 (Funnel)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {FUNNEL_STAGES.map((s) => (
                  <div key={s.event} className="h-8 rounded bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : FUNNEL_STAGES.every((s) => (eventCounts[s.event] ?? 0) === 0) &&
              (eventCounts['supplier_applied'] ?? 0) === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">尚無事件資料</div>
            ) : (
              <div className="space-y-3">
                {FUNNEL_STAGES.map((stage) => {
                  const count = eventCounts[stage.event] ?? 0;
                  const base = eventCounts[FUNNEL_STAGES[0].event] ?? 0;
                  const pct = base > 0 ? Math.round((count / base) * 100) : 0;
                  return (
                    <div key={stage.event} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-sm text-slate-600 text-right">
                        {stage.label}
                      </div>
                      <div className="flex-1 h-6 rounded bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="w-28 shrink-0 text-sm tabular-nums">
                        <span className="font-semibold text-slate-800">{count}</span>
                        <span className="text-slate-400 ml-1.5">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-3 mt-1 border-t border-slate-100 flex items-center gap-2 text-sm">
                  <span className="text-slate-500">供應商申請</span>
                  <span className="font-semibold text-emerald-600 tabular-nums">
                    {eventCounts['supplier_applied'] ?? 0}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
