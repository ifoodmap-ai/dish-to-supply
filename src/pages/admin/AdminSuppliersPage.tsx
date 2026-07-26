import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Search, Pencil, Plus, X, Star, TrendingUp, Boxes, PackageX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * supplier_metrics / supplier_orders 尚未進 types.ts,
 * 沿用專案既有的窄型別轉換慣例(只描述用得到的 chain)。
 */
type Result<T> = Promise<{ data: T[] | null; error: { message?: string } | null }>;

interface SelectChain<T> extends Result<T> {
  eq: (column: string, value: unknown) => SelectChain<T>;
  order: (column: string, opts?: { ascending?: boolean }) => SelectChain<T>;
}

interface UpdateChain {
  eq: (column: string, value: unknown) => Promise<{ error: { message?: string } | null }>;
}

interface Db {
  from: (table: string) => {
    select: <T>(columns: string) => SelectChain<T>;
    update: (values: Record<string, unknown>) => UpdateChain;
  };
}

const db = supabase as never as Db;

interface SupplierRow {
  id: string;
  name: string;
  description: string | null;
  service_areas: string[] | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

interface SupplyRow {
  supplier_id: string | null;
  is_available: boolean;
}

interface OrderRow {
  supplier_id: string | null;
  status: string;
}

interface MetricRow {
  supplier_id: string;
  orders_total: number | null;
  ontime_rate: number | null;
  shortage_rate: number | null;
  avg_rating: number | null;
}

interface SupplierStats {
  items: number;
  itemsOnline: number;
  orders: number;
  dealOrders: number;
}

interface FormState {
  id: string | null;
  name: string;
  description: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  areas: string[];
  is_active: boolean;
}

const emptyForm: FormState = {
  id: null,
  name: '',
  description: '',
  contact_name: '',
  contact_email: '',
  phone: '',
  areas: [],
  is_active: true,
};

/** 視為「成交」的訂單狀態(已送達之後的階段) */
const DEAL_STATUSES = ['delivered', 'received', 'reviewed', 'closed', 'completed'];

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};

/** 近 12 週的加入趨勢(週日為每週起點) */
const buildWeeklyTrend = (isoDates: string[], weeks = 12) => {
  const thisWeek = startOfWeek(new Date());
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return { key: d.getTime(), week: `${d.getMonth() + 1}/${d.getDate()}`, count: 0 };
  });
  const index = new Map(buckets.map((b) => [b.key, b]));
  isoDates.forEach((iso) => {
    if (!iso) return;
    const bucket = index.get(startOfWeek(new Date(iso)).getTime());
    if (bucket) bucket.count += 1;
  });
  return buckets;
};

/** metrics 的比率欄位可能存 0–1 或 0–100,一律轉成百分比顯示 */
const formatRate = (v: number | null): string | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return `${Math.round(n <= 1 ? n * 100 : n)}%`;
};

const rateClass = (v: number | null): string => {
  if (v === null || v === undefined) return 'text-slate-400';
  const n = Number(v);
  const p = n <= 1 ? n * 100 : n;
  if (p >= 90) return 'text-emerald-600';
  if (p >= 70) return 'text-yellow-600';
  return 'text-red-600';
};

const areaList = (v: string[] | null): string[] => (Array.isArray(v) ? v.filter(Boolean) : []);

const tabs: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'online', label: '上架中' },
  { value: 'offline', label: '已下架' },
];

const AdminSuppliersPage = () => {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [stats, setStats] = useState<Record<string, SupplierStats>>({});
  const [metrics, setMetrics] = useState<Record<string, MetricRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [areaInput, setAreaInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [supRes, itemRes, orderRes, metricRes] = await Promise.all([
      db
        .from('suppliers')
        .select<SupplierRow>(
          'id, name, description, service_areas, contact_name, contact_email, phone, is_active, created_at',
        )
        .order('created_at', { ascending: false }),
      db.from('supplies').select<SupplyRow>('supplier_id, is_available'),
      db.from('supplier_orders').select<OrderRow>('supplier_id, status'),
      db
        .from('supplier_metrics')
        .select<MetricRow>('supplier_id, orders_total, ontime_rate, shortage_rate, avg_rating'),
    ]);

    if (supRes.error) {
      toast.error('載入供應商失敗', { description: supRes.error.message });
    }

    const agg: Record<string, SupplierStats> = {};
    const ensure = (id: string) => {
      if (!agg[id]) agg[id] = { items: 0, itemsOnline: 0, orders: 0, dealOrders: 0 };
      return agg[id];
    };

    (itemRes.data ?? []).forEach((s) => {
      if (!s.supplier_id) return;
      const a = ensure(s.supplier_id);
      a.items += 1;
      if (s.is_available) a.itemsOnline += 1;
    });

    (orderRes.data ?? []).forEach((o) => {
      if (!o.supplier_id) return;
      const a = ensure(o.supplier_id);
      a.orders += 1;
      if (DEAL_STATUSES.includes(o.status)) a.dealOrders += 1;
    });

    const metricMap: Record<string, MetricRow> = {};
    (metricRes.data ?? []).forEach((m) => {
      metricMap[m.supplier_id] = m;
    });

    setRows(supRes.data ?? []);
    setStats(agg);
    setMetrics(metricMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const statsOf = useCallback(
    (id: string): SupplierStats => stats[id] ?? { items: 0, itemsOnline: 0, orders: 0, dealOrders: 0 },
    [stats],
  );

  const derived = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let newThisMonth = 0;
    let online = 0;
    const ratings: number[] = [];

    rows.forEach((r) => {
      if (r.created_at.slice(0, 7) === monthKey) newThisMonth += 1;
      if (r.is_active) online += 1;
      const rating = metrics[r.id]?.avg_rating;
      if (rating !== null && rating !== undefined) ratings.push(Number(rating));
    });

    const avgRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    return {
      total: rows.length,
      online,
      offline: rows.length - online,
      newThisMonth,
      avgRating,
      trend: buildWeeklyTrend(rows.map((r) => r.created_at)),
    };
  }, [rows, metrics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeTab === 'online' && !r.is_active) return false;
      if (activeTab === 'offline' && r.is_active) return false;
      if (!q) return true;
      const areas = areaList(r.service_areas).join(' ');
      return `${r.name} ${r.description ?? ''} ${areas}`.toLowerCase().includes(q);
    });
  }, [rows, search, activeTab]);

  const openEdit = (r: SupplierRow) => {
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      contact_name: r.contact_name ?? '',
      contact_email: r.contact_email ?? '',
      phone: r.phone ?? '',
      areas: areaList(r.service_areas),
      is_active: r.is_active,
    });
    setAreaInput('');
    setFormOpen(true);
  };

  const addArea = () => {
    const parts = areaInput
      .split(/[,、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setForm((f) => ({ ...f, areas: [...new Set([...f.areas, ...parts])] }));
    setAreaInput('');
  };

  const removeArea = (area: string) => {
    setForm((f) => ({ ...f, areas: f.areas.filter((a) => a !== area) }));
  };

  const handleSave = async () => {
    if (!form.id || !form.name.trim()) return;
    setSaving(true);
    const patch = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      phone: form.phone.trim() || null,
      service_areas: form.areas,
      is_active: form.is_active,
    };
    const { error } = await db
      .from('suppliers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', form.id);
    setSaving(false);
    if (error) {
      toast.error('儲存失敗', { description: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === form.id ? { ...r, ...patch } : r)));
    setFormOpen(false);
    toast.success('已更新供應商資料');
  };

  const toggleActive = async (r: SupplierRow) => {
    const next = !r.is_active;
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x)));
    const { error } = await db
      .from('suppliers')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x)));
      toast.error('更新失敗', { description: error.message });
      return;
    }
    toast.success(next ? `已上架「${r.name}」` : `已下架「${r.name}」`);
  };

  const kpis = [
    { title: '總供應商數', value: derived.total, icon: Truck, accent: 'text-slate-700', bg: 'bg-slate-100' },
    { title: '上架中', value: derived.online, icon: Boxes, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '已下架', value: derived.offline, icon: PackageX, accent: 'text-slate-500', bg: 'bg-slate-100' },
    { title: '本月新加入', value: derived.newThisMonth, icon: TrendingUp, accent: 'text-blue-600', bg: 'bg-blue-50' },
    {
      title: '平均評分',
      value: derived.avgRating !== null ? derived.avgRating.toFixed(1) : '—',
      icon: Star,
      accent: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">供應商管理 (Suppliers)</h1>
      <p className="text-sm text-slate-500 mb-6">
        核准入駐之後的供應商名冊:上架品項、成交表現與服務區維護
      </p>

      {/* KPI */}
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

      {/* 加入趨勢 */}
      <Card className="border-slate-200 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-700">供應商加入趨勢(近 12 週)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">尚無供應商資料</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={derived.trend} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(v) => [`${v} 家`, '新加入']} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="新加入"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 篩選 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {tabs.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:max-w-xs w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜尋名稱 / 服務區 / 說明…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="rounded-md border border-slate-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-slate-600">供應商</TableHead>
              <TableHead className="text-slate-600">服務區</TableHead>
              <TableHead className="text-slate-600 text-right">上架品項</TableHead>
              <TableHead className="text-slate-600 text-right">成交單數</TableHead>
              <TableHead className="text-slate-600 text-right">準時率</TableHead>
              <TableHead className="text-slate-600 text-right">評分</TableHead>
              <TableHead className="text-slate-600 text-center">上架</TableHead>
              <TableHead className="text-slate-600 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  {rows.length === 0
                    ? '尚無供應商，核准入駐申請後會出現在這裡'
                    : '沒有符合條件的供應商'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const s = statsOf(r.id);
                const m = metrics[r.id];
                const areas = areaList(r.service_areas);
                const ontime = formatRate(m?.ontime_rate ?? null);
                return (
                  <TableRow key={r.id} className="hover:bg-slate-50">
                    <TableCell className="align-top">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      {r.description ? (
                        <div
                          className="text-xs text-slate-400 mt-0.5 max-w-[240px] truncate"
                          title={r.description}
                        >
                          {r.description}
                        </div>
                      ) : null}
                      {!r.is_active ? (
                        <Badge
                          variant="outline"
                          className="mt-1 bg-slate-100 text-slate-600 border-slate-300"
                        >
                          已下架
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top max-w-[200px]">
                      {areas.length === 0 ? (
                        <span className="text-slate-400 italic text-sm">未設定</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {areas.slice(0, 3).map((a) => (
                            <Badge
                              key={a}
                              variant="outline"
                              className="bg-slate-50 text-slate-600 border-slate-200 font-normal"
                            >
                              {a}
                            </Badge>
                          ))}
                          {areas.length > 3 ? (
                            <span className="text-xs text-slate-400 self-center">
                              +{areas.length - 3}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums">
                      <span className="text-slate-800">{s.itemsOnline}</span>
                      <span className="text-slate-400"> / {s.items}</span>
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums">
                      <span className="text-slate-800">{s.dealOrders}</span>
                      <span className="text-slate-400"> / {s.orders}</span>
                    </TableCell>
                    <TableCell
                      className={`align-top text-right text-sm tabular-nums ${rateClass(
                        m?.ontime_rate ?? null,
                      )}`}
                    >
                      {ontime ?? <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums">
                      {m?.avg_rating !== null && m?.avg_rating !== undefined ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Star className="h-3.5 w-3.5" />
                          {Number(m.avg_rating).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-center">
                      <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-slate-700"
                        onClick={() => openEdit(r)}
                        aria-label="編輯"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        準時率與評分來自 supplier_metrics(定期計算);顯示「—」代表尚未產生統計。
      </p>

      {/* 編輯 Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!saving) setFormOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>編輯供應商資料</DialogTitle>
            <DialogDescription>修改後會立即反映在買家端的供應商頁與媒合結果。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">供應商名稱 *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例:大安蔬果行"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">簡介</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="主力品項、配送特色、最低訂購量…"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">服務區域</label>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {form.areas.length === 0 ? (
                  <span className="text-xs text-slate-400 self-center">尚未設定服務區</span>
                ) : (
                  form.areas.map((a) => (
                    <Badge
                      key={a}
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 font-normal gap-1 pr-1"
                    >
                      {a}
                      <button
                        type="button"
                        onClick={() => removeArea(a)}
                        className="rounded-full hover:bg-emerald-100 p-0.5"
                        aria-label={`移除 ${a}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addArea();
                    }
                  }}
                  placeholder="輸入區域後按 Enter,例:台北市、新北市"
                />
                <Button type="button" variant="outline" onClick={addArea} disabled={!areaInput.trim()}>
                  <Plus className="h-4 w-4 mr-1" />
                  加入
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">聯絡人</label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  placeholder="陳老闆"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">聯絡信箱</label>
                <Input
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                  placeholder="sales@example.com"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">電話</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="02-1234-5678"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <span className="text-sm text-slate-600">上架中(下架後不會出現在買家端與媒合)</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.name.trim() || saving}
              onClick={handleSave}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSuppliersPage;
