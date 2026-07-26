import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store,
  Search,
  Pencil,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
 * restaurants / restaurant_accounts 尚未進 types.ts,
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

interface RestaurantRow {
  id: string;
  name: string;
  tax_id: string | null;
  cuisine_type: string | null;
  seats: number | null;
  address: string | null;
  city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  monthly_revenue_band: string | null;
  is_active: boolean;
  created_at: string;
}

interface AccountRow {
  restaurant_id: string | null;
  is_active: boolean;
}

interface OrderRow {
  restaurant_id: string | null;
  total_amount: number | null;
  status: string;
  created_at: string;
}

interface RestaurantStats {
  members: number;
  orders: number;
  amount: number;
  lastOrderAt: string | null;
}

interface FormState {
  id: string | null;
  name: string;
  tax_id: string;
  cuisine_type: string;
  seats: string;
  city: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  contact_line: string;
  monthly_revenue_band: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  id: null,
  name: '',
  tax_id: '',
  cuisine_type: '',
  seats: '',
  city: '',
  address: '',
  contact_name: '',
  contact_phone: '',
  contact_line: '',
  monthly_revenue_band: '',
  is_active: true,
};

/** 不計入累計金額的狀態(取消／過期／被拒) */
const VOID_STATUSES = ['cancelled', 'expired', 'rejected'];

type Activity = 'active' | 'dormant' | 'churned';

const ACTIVITY_META: Record<Activity, { label: string; className: string; hint: string }> = {
  active: {
    label: '活躍',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    hint: '30 天內有下單',
  },
  dormant: {
    label: '沉睡',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    hint: '30–90 天沒下單',
  },
  churned: {
    label: '流失',
    className: 'bg-red-100 text-red-800 border-red-300',
    hint: '超過 90 天沒下單或從未下單',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const activityOf = (lastOrderAt: string | null): Activity => {
  if (!lastOrderAt) return 'churned';
  const days = (Date.now() - new Date(lastOrderAt).getTime()) / DAY_MS;
  if (days <= 30) return 'active';
  if (days <= 90) return 'dormant';
  return 'churned';
};

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

const money = (n: number) => `NT$ ${Math.round(n).toLocaleString('zh-TW')}`;

const tabs: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '活躍' },
  { value: 'dormant', label: '沉睡' },
  { value: 'churned', label: '流失' },
  { value: 'disabled', label: '已停用' },
];

const AdminRestaurantsPage = () => {
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [stats, setStats] = useState<Record<string, RestaurantStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const [restRes, acctRes, orderRes] = await Promise.all([
      db
        .from('restaurants')
        .select<RestaurantRow>(
          'id, name, tax_id, cuisine_type, seats, address, city, contact_name, contact_phone, contact_line, monthly_revenue_band, is_active, created_at',
        )
        .order('created_at', { ascending: false }),
      db.from('restaurant_accounts').select<AccountRow>('restaurant_id, is_active'),
      db
        .from('supplier_orders')
        .select<OrderRow>('restaurant_id, total_amount, status, created_at'),
    ]);

    if (restRes.error) {
      toast.error('載入餐廳失敗', { description: restRes.error.message });
    }

    const agg: Record<string, RestaurantStats> = {};
    const ensure = (id: string) => {
      if (!agg[id]) agg[id] = { members: 0, orders: 0, amount: 0, lastOrderAt: null };
      return agg[id];
    };

    (acctRes.data ?? []).forEach((a) => {
      if (!a.restaurant_id || !a.is_active) return;
      ensure(a.restaurant_id).members += 1;
    });

    (orderRes.data ?? []).forEach((o) => {
      if (!o.restaurant_id) return;
      const s = ensure(o.restaurant_id);
      s.orders += 1;
      if (!VOID_STATUSES.includes(o.status)) s.amount += Number(o.total_amount ?? 0);
      if (!s.lastOrderAt || o.created_at > s.lastOrderAt) s.lastOrderAt = o.created_at;
    });

    setRows(restRes.data ?? []);
    setStats(agg);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const statsOf = useCallback(
    (id: string): RestaurantStats => stats[id] ?? { members: 0, orders: 0, amount: 0, lastOrderAt: null },
    [stats],
  );

  const derived = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let newThisMonth = 0;
    const tierCount: Record<Activity, number> = { active: 0, dormant: 0, churned: 0 };

    rows.forEach((r) => {
      if (r.created_at.slice(0, 7) === monthKey) newThisMonth += 1;
      tierCount[activityOf(stats[r.id]?.lastOrderAt ?? null)] += 1;
    });

    return {
      total: rows.length,
      newThisMonth,
      tierCount,
      trend: buildWeeklyTrend(rows.map((r) => r.created_at)),
    };
  }, [rows, stats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeTab === 'disabled') {
        if (r.is_active) return false;
      } else if (activeTab !== 'all') {
        if (activityOf(stats[r.id]?.lastOrderAt ?? null) !== activeTab) return false;
      }
      if (!q) return true;
      return `${r.name} ${r.city ?? ''} ${r.cuisine_type ?? ''}`.toLowerCase().includes(q);
    });
  }, [rows, stats, search, activeTab]);

  const openEdit = (r: RestaurantRow) => {
    setForm({
      id: r.id,
      name: r.name,
      tax_id: r.tax_id ?? '',
      cuisine_type: r.cuisine_type ?? '',
      seats: r.seats != null ? String(r.seats) : '',
      city: r.city ?? '',
      address: r.address ?? '',
      contact_name: r.contact_name ?? '',
      contact_phone: r.contact_phone ?? '',
      contact_line: r.contact_line ?? '',
      monthly_revenue_band: r.monthly_revenue_band ?? '',
      is_active: r.is_active,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.id || !form.name.trim()) return;
    setSaving(true);
    const patch = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      cuisine_type: form.cuisine_type.trim() || null,
      seats: form.seats.trim() ? Number(form.seats) : null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_line: form.contact_line.trim() || null,
      monthly_revenue_band: form.monthly_revenue_band.trim() || null,
      is_active: form.is_active,
    };
    const { error } = await db
      .from('restaurants')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', form.id);
    setSaving(false);
    if (error) {
      toast.error('儲存失敗', { description: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === form.id ? { ...r, ...patch } : r)));
    setFormOpen(false);
    toast.success('已更新餐廳資料');
  };

  const toggleActive = async (r: RestaurantRow) => {
    const next = !r.is_active;
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x)));
    const { error } = await db
      .from('restaurants')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x)));
      toast.error('更新失敗', { description: error.message });
      return;
    }
    toast.success(next ? `已啟用「${r.name}」` : `已停用「${r.name}」`);
  };

  const kpis = [
    {
      title: '總餐廳數',
      value: derived.total,
      icon: Store,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
    },
    {
      title: '本月新加入',
      value: derived.newThisMonth,
      icon: TrendingUp,
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: '活躍(30 天內)',
      value: derived.tierCount.active,
      icon: CheckCircle2,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: '沉睡(30–90 天)',
      value: derived.tierCount.dormant,
      icon: Clock,
      accent: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      title: '流失(>90 天)',
      value: derived.tierCount.churned,
      icon: AlertTriangle,
      accent: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">餐廳管理 (Restaurants)</h1>
      <p className="text-sm text-slate-500 mb-6">
        平台所有餐廳客戶的名冊、下單活躍度與帳號成員狀況
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
          <CardTitle className="text-base text-slate-700">餐廳加入趨勢(近 12 週)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">尚無餐廳資料</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={derived.trend} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(v) => [`${v} 間`, '新加入']} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#10b981"
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
            placeholder="搜尋店名 / 城市 / 類型…"
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
              <TableHead className="text-slate-600">餐廳</TableHead>
              <TableHead className="text-slate-600">類型</TableHead>
              <TableHead className="text-slate-600">城市</TableHead>
              <TableHead className="text-slate-600 text-right">成員</TableHead>
              <TableHead className="text-slate-600 text-right">累計訂單</TableHead>
              <TableHead className="text-slate-600 text-right">累計金額</TableHead>
              <TableHead className="text-slate-600">最後下單</TableHead>
              <TableHead className="text-slate-600">活躍度</TableHead>
              <TableHead className="text-slate-600 text-center">啟用</TableHead>
              <TableHead className="text-slate-600 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                  {rows.length === 0
                    ? '尚無餐廳資料，餐廳建立後會出現在這裡'
                    : '沒有符合條件的餐廳'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const s = statsOf(r.id);
                const tier = ACTIVITY_META[activityOf(s.lastOrderAt)];
                return (
                  <TableRow key={r.id} className="hover:bg-slate-50">
                    <TableCell className="align-top">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {r.tax_id ? `統編 ${r.tax_id}` : '未填統編'}
                        {r.seats != null ? ` · ${r.seats} 席` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 align-top whitespace-nowrap">
                      {r.cuisine_type || <span className="text-slate-400 italic">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 align-top whitespace-nowrap">
                      {r.city || <span className="text-slate-400 italic">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 align-top text-right tabular-nums">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        {s.members}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 align-top text-right tabular-nums">
                      {s.orders}
                    </TableCell>
                    <TableCell className="text-sm text-slate-800 align-top text-right tabular-nums whitespace-nowrap">
                      {s.amount > 0 ? money(s.amount) : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 align-top whitespace-nowrap">
                      {s.lastOrderAt ? (
                        new Date(s.lastOrderAt).toLocaleDateString('zh-TW')
                      ) : (
                        <span className="text-slate-400 italic">從未下單</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className={tier.className} title={tier.hint}>
                        {tier.label}
                      </Badge>
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

      {/* 編輯 Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!saving) setFormOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>編輯餐廳資料</DialogTitle>
            <DialogDescription>修改後會立即套用到餐廳端與訂單顯示。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">店名 *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例:阿明火鍋"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">統一編號</label>
                <Input
                  value={form.tax_id}
                  onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                  placeholder="12345678"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">料理類型</label>
                <Input
                  value={form.cuisine_type}
                  onChange={(e) => setForm((f) => ({ ...f, cuisine_type: e.target.value }))}
                  placeholder="火鍋 / 日式 / 早餐…"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">座位數</label>
                <Input
                  type="number"
                  value={form.seats}
                  onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))}
                  placeholder="60"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">城市</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="台北市"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">地址</label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="中山區…"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">聯絡人</label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  placeholder="王小明"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">聯絡電話</label>
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="0912-345-678"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">LINE ID</label>
                <Input
                  value={form.contact_line}
                  onChange={(e) => setForm((f) => ({ ...f, contact_line: e.target.value }))}
                  placeholder="@shop"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">月營收級距</label>
              <Input
                value={form.monthly_revenue_band}
                onChange={(e) => setForm((f) => ({ ...f, monthly_revenue_band: e.target.value }))}
                placeholder="例:50–100 萬"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <span className="text-sm text-slate-600">啟用中(停用後餐廳端無法下單)</span>
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

export default AdminRestaurantsPage;
