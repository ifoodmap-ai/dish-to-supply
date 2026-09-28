// 總覽分區的「營運」分頁(/admin)。成長分頁是 /admin/growth(AdminGrowthPage)。
//
// 後台精簡第一期(業主拍板 Q4-A):兩個儀表板合成「總覽」一區,這一頁最上方是「今日待辦」。
// 兩頁重複的東西只留一份(PROPOSAL.md §1 總覽列):
//   - 「供應商數」與轉換漏斗前 5 段 → 只留在成長分頁(同表同定義、逐字相同);
//     漏斗下方原本的「供應商申請」事件數一起搬到成長分頁的漏斗卡。
//   - KPI「待審核」→ 跟今日待辦的「待審分析」是同一個數字,只留今日待辦那一個(而且那邊是精確筆數,
//     這裡的 analysis_records 一次最多讀回 1000 筆)。
//
// 「總訂單」用全站共用的訂單定義(src/lib/metrics.ts,業主拍板 Q5-A):不含草稿、取消、拒單、逾時。
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, CheckCircle, Package, Boxes, TrendingUp } from 'lucide-react';
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
import { ORDER_STATUSES } from '@/lib/metrics';
import TodayTodos from './TodayTodos';

interface AnalysisRow {
  id: string;
  created_at: string;
  source_type: string;
  status: string;
  ingredient_list: { name?: string }[] | null;
}

const SOURCE_LABEL: Record<string, string> = { menu_upload: '菜單上傳', chatbot: '對話萃取' };
const PIE_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];

/* 這幾張表還沒進 types.ts,沿用專案既有的 cast 慣例,只描述這頁用得到的那一小段 builder */
type CountRes = { count: number | null; error: { message: string } | null };
type RowsRes<T> = { data: T[] | null; error: { message: string } | null };

interface CountQuery extends PromiseLike<CountRes> {
  in(col: string, values: readonly string[]): PromiseLike<CountRes>;
}

const headCount = (table: string) =>
  (supabase as never as {
    from: (t: string) => { select: (c: string, o: { count: 'exact'; head: true }) => CountQuery };
  })
    .from(table)
    .select('id', { count: 'exact', head: true });

/** 總訂單:共用定義的訂單數(不含草稿、取消、拒單、逾時) */
const orderCount = () => headCount('supplier_orders').in('status', ORDER_STATUSES);

const analysisRows = () =>
  (supabase as never as {
    from: (t: string) => {
      select: (c: string) => {
        order: (col: string, o: { ascending: boolean }) => PromiseLike<RowsRes<AnalysisRow>>;
      };
    };
  })
    .from('analysis_records')
    .select('id, created_at, source_type, status, ingredient_list')
    .order('created_at', { ascending: true });

const AdminDashboard = () => {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [suppliesCount, setSuppliesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [aRes, oRes, suRes] = await Promise.all([
        analysisRows(),
        orderCount(),
        headCount('supplies'),
      ]);
      setRows(aRes.data ?? []);
      setOrdersCount(oRes.count ?? 0);
      setSuppliesCount(suRes.count ?? 0);
      setLoading(false);
    })();
  }, []);

  const derived = useMemo(() => {
    const total = rows.length;
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

    return { total, sent, matchRate, trend, sources, topIngredients };
  }, [rows]);

  const kpis = [
    { title: '需求總數', value: derived.total, icon: ClipboardList, accent: 'text-slate-700', bg: 'bg-slate-100' },
    { title: '已媒合', value: derived.sent, icon: CheckCircle, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '媒合率', value: `${derived.matchRate}%`, icon: TrendingUp, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '上架商品', value: suppliesCount, icon: Boxes, accent: 'text-purple-600', bg: 'bg-purple-50' },
    { title: '總訂單', value: ordersCount, icon: Package, accent: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">營運儀表板 (Dashboard)</h1>
      <p className="text-sm text-slate-500 mb-6">平台需求媒合與供應鏈營運概況</p>

      <TodayTodos />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
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
      </div>
    </div>
  );
};

export default AdminDashboard;
