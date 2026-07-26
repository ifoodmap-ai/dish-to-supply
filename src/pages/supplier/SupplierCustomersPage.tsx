import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  DollarSign,
  MessageCircle,
  Phone,
  RefreshCw,
  Store,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OrderRow {
  id: string;
  restaurant_id: string | null;
  total_amount: number | null;
  created_at: string;
  status: string | null;
}

interface RestaurantRow {
  id: string;
  name: string;
  city: string | null;
  cuisine_type: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
}

interface Customer {
  restaurantId: string;
  name: string;
  city: string | null;
  cuisineType: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactLine: string | null;
  orderCount: number;
  totalAmount: number;
  firstAt: number;
  lastAt: number;
  avgCycleDays: number | null;
  daysSinceLast: number;
  atRisk: boolean;
}

/** 不列入合作紀錄的狀態 */
const EXCLUDED_STATUSES = new Set<string>(['draft', 'cancelled', 'rejected', 'expired']);

const DAY_MS = 86_400_000;

const money = (v: number): string => `$${Math.round(v).toLocaleString('zh-TW')}`;

const formatDate = (ms: number): string => {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatDays = (days: number): string => {
  if (!Number.isFinite(days)) return '—';
  if (days < 1) return '今天';
  if (days < 60) return `${Math.round(days)} 天`;
  return `${(days / 30).toFixed(1)} 個月`;
};

export default function SupplierCustomersPage() {
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [restaurants, setRestaurants] = useState<Record<string, RestaurantRow>>({});
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (!cancelled) setLoading(false); return; }

        const { data: acct } = (await (supabase as never)
          .from('supplier_accounts')
          .select('supplier_id')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .maybeSingle()) as { data: { supplier_id: string } | null };

        const sid = acct?.supplier_id ?? null;
        if (!sid) { if (!cancelled) setLoading(false); return; }
        if (!cancelled) setSupplierId(sid);

        const { data: orderRows } = (await (supabase as never)
          .from('supplier_orders')
          .select('id, restaurant_id, total_amount, created_at, status')
          .eq('supplier_id', sid)
          .order('created_at', { ascending: false })) as { data: OrderRow[] | null };
        const rows = orderRows ?? [];

        const restaurantIds = Array.from(
          new Set(rows.map((o) => o.restaurant_id).filter(Boolean) as string[]),
        );
        const map: Record<string, RestaurantRow> = {};
        if (restaurantIds.length > 0) {
          const { data: rs } = (await (supabase as never)
            .from('restaurants')
            .select('id, name, city, cuisine_type, contact_name, contact_phone, contact_line')
            .in('id', restaurantIds)) as { data: RestaurantRow[] | null };
          (rs ?? []).forEach((r) => { map[r.id] = r; });
        }

        if (cancelled) return;
        setOrders(rows);
        setRestaurants(map);
        setUnlinkedCount(
          rows.filter((o) => !o.restaurant_id && !EXCLUDED_STATUSES.has(o.status ?? '')).length,
        );
      } catch (e) {
        if (!cancelled) toast.error('載入客戶資料失敗', { description: (e as { message?: string })?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const customers = useMemo<Customer[]>(() => {
    const grouped = new Map<string, { times: number[]; amount: number }>();

    orders.forEach((o) => {
      if (!o.restaurant_id) return;
      if (EXCLUDED_STATUSES.has(o.status ?? '')) return;
      const ts = new Date(o.created_at).getTime();
      if (!Number.isFinite(ts)) return;
      const cur = grouped.get(o.restaurant_id) ?? { times: [], amount: 0 };
      cur.times.push(ts);
      cur.amount += Number(o.total_amount ?? 0) || 0;
      grouped.set(o.restaurant_id, cur);
    });

    const now = Date.now();
    const list: Customer[] = [];

    grouped.forEach((v, restaurantId) => {
      const times = [...v.times].sort((a, b) => a - b);
      const firstAt = times[0];
      const lastAt = times[times.length - 1];
      const avgCycleDays = times.length >= 2
        ? (lastAt - firstAt) / (times.length - 1) / DAY_MS
        : null;
      const daysSinceLast = (now - lastAt) / DAY_MS;
      const atRisk = avgCycleDays != null && avgCycleDays > 0 && daysSinceLast > avgCycleDays * 2;
      const r = restaurants[restaurantId];

      list.push({
        restaurantId,
        name: r?.name ?? '未具名餐廳',
        city: r?.city ?? null,
        cuisineType: r?.cuisine_type ?? null,
        contactName: r?.contact_name ?? null,
        contactPhone: r?.contact_phone ?? null,
        contactLine: r?.contact_line ?? null,
        orderCount: times.length,
        totalAmount: v.amount,
        firstAt,
        lastAt,
        avgCycleDays,
        daysSinceLast,
        atRisk,
      });
    });

    return list.sort((a, b) => {
      if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
      return b.lastAt - a.lastAt;
    });
  }, [orders, restaurants]);

  const riskCount = customers.filter((c) => c.atRisk).length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalAmount, 0);
  const filtered = tab === 'risk' ? customers.filter((c) => c.atRisk) : customers;

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-56 mb-6" />
        <div className="grid grid-cols-3 gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-7 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!supplierId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-24 text-gray-400">此帳號尚未綁定供應商</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">客戶管理</h1>
      <p className="text-sm text-gray-500 mb-6">合作餐廳的下單頻率與流失預警,及早聯繫留住熟客</p>

      {/* 摘要 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="inline-flex p-1.5 rounded-lg bg-slate-100 mb-2">
              <Users className="h-4 w-4 text-slate-600" />
            </div>
            <div className="text-2xl font-bold text-slate-700 tabular-nums">{customers.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">合作餐廳</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="inline-flex p-1.5 rounded-lg bg-emerald-50 mb-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{money(totalRevenue)}</div>
            <div className="text-xs text-slate-500 mt-0.5">累計成交金額</div>
          </CardContent>
        </Card>
        <Card className={riskCount > 0 ? 'border-red-200' : 'border-slate-200'}>
          <CardContent className="p-4">
            <div className={`inline-flex p-1.5 rounded-lg mb-2 ${riskCount > 0 ? 'bg-red-50' : 'bg-slate-100'}`}>
              <AlertTriangle className={`h-4 w-4 ${riskCount > 0 ? 'text-red-600' : 'text-slate-600'}`} />
            </div>
            <div className={`text-2xl font-bold tabular-nums ${riskCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>
              {riskCount}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">可能流失</div>
          </CardContent>
        </Card>
      </div>

      {customers.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center">
            <Store size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-600 font-medium mb-1">還沒有合作過的餐廳</p>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              完成第一筆訂單後,這裡會自動整理每家餐廳的下單頻率、累計金額與回購狀況。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">全部 ({customers.length})</TabsTrigger>
                <TabsTrigger value="risk">可能流失 ({riskCount})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {filtered.length === 0 ? (
            <Card className="border-slate-200">
              <CardContent className="py-12 text-center text-slate-400 text-sm">
                目前沒有流失風險的客戶,狀況良好
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <Card
                  key={c.restaurantId}
                  className={`border ${c.atRisk ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800">{c.name}</p>
                          {c.atRisk ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              <AlertTriangle size={11} className="mr-1" />可能流失
                            </Badge>
                          ) : c.orderCount === 1 ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              新客戶
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              合作中
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {[c.city, c.cuisineType].filter(Boolean).join(' · ') || '—'}
                          {' · '}首次合作 {formatDate(c.firstAt)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
                        <p className="text-[11px] text-slate-400">合作單數</p>
                        <p className="text-base font-semibold text-slate-800 tabular-nums">{c.orderCount}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
                        <p className="text-[11px] text-slate-400">累計金額</p>
                        <p className="text-base font-semibold text-emerald-600 tabular-nums">
                          {money(c.totalAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <CalendarClock size={11} />最後下單
                        </p>
                        <p className="text-base font-semibold text-slate-800">{formatDate(c.lastAt)}</p>
                        <p className="text-[11px] text-slate-400">
                          {c.daysSinceLast < 1 ? '今天' : `${formatDays(c.daysSinceLast)}前`}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <RefreshCw size={11} />平均下單週期
                        </p>
                        <p className="text-base font-semibold text-slate-800">
                          {c.avgCycleDays != null ? formatDays(c.avgCycleDays) : '—'}
                        </p>
                        {c.avgCycleDays == null && (
                          <p className="text-[11px] text-slate-400">僅 1 筆,尚無法計算</p>
                        )}
                      </div>
                    </div>

                    {c.atRisk && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2.5">
                        <p className="text-sm text-red-700 font-medium flex items-center gap-1.5">
                          <AlertTriangle size={14} />建議盡快聯繫
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          已 {formatDays(c.daysSinceLast)} 沒有下單,超過平均下單週期(
                          {c.avgCycleDays != null ? formatDays(c.avgCycleDays) : '—'})的 2 倍,
                          建議主動詢問補貨需求或提供回購優惠。
                        </p>
                        {(c.contactName || c.contactPhone || c.contactLine) ? (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                            {c.contactName && (
                              <span className="flex items-center gap-1">
                                <Store size={13} className="text-slate-400" />{c.contactName}
                              </span>
                            )}
                            {c.contactPhone && (
                              <a
                                href={`tel:${c.contactPhone}`}
                                className="flex items-center gap-1 text-emerald-700 hover:underline"
                              >
                                <Phone size={13} />{c.contactPhone}
                              </a>
                            )}
                            {c.contactLine && (
                              <span className="flex items-center gap-1">
                                <MessageCircle size={13} className="text-slate-400" />LINE {c.contactLine}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 mt-2">
                            此餐廳未提供聯絡資訊,可透過平台訊息聯繫
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {unlinkedCount > 0 && (
            <p className="text-xs text-slate-400 mt-4">
              另有 {unlinkedCount} 筆訂單未關聯餐廳資料,未列入客戶統計。
            </p>
          )}
        </>
      )}
    </div>
  );
}
