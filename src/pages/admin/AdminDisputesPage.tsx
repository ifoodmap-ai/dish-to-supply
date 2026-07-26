import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { ORDER_STATUS, ROLE_LABEL, type ActorRole, type OrderStatus } from '@/lib/orders';

/* ---------------------------------------------------------------
 * 新資料表尚未進 types.ts,沿用專案既有的 cast 慣例
 * ------------------------------------------------------------- */
type Res<T> = { data: T[] | null; error: { message: string } | null };

interface Chain<T> extends PromiseLike<Res<T>> {
  eq(col: string, v: unknown): Chain<T>;
  in(col: string, v: readonly unknown[]): Chain<T>;
  order(col: string, opts?: { ascending: boolean }): Chain<T>;
}

const table = <T,>(name: string) =>
  (supabase as never as {
    from: (t: string) => { select: (c: string) => Chain<T> };
  }).from(name);

const updateRow = async (
  name: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ message: string } | null> => {
  const { error } = await (supabase as never as {
    from: (t: string) => {
      update: (v: unknown) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from(name)
    .update(patch)
    .eq('id', id);
  return error;
};

/* ------------------------------ types ------------------------------ */
type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';
type DisputeKind = 'shortage' | 'late' | 'quality' | 'wrong_item' | 'other';

interface DisputeRow {
  id: string;
  order_id: string;
  kind: DisputeKind;
  status: DisputeStatus;
  opened_by: string | null;
  opened_role: ActorRole | null;
  detail: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface OrderLite {
  id: string;
  status: OrderStatus;
  restaurant_id: string | null;
  supplier_id: string | null;
  total_amount: number | null;
}

interface NameRow {
  id: string;
  name: string;
}

/* ------------------------------ constants ------------------------------ */
const KIND_META: Record<DisputeKind, { label: string; className: string }> = {
  shortage: { label: '短缺', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  late: { label: '延遲到貨', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  quality: { label: '品質不符', className: 'bg-red-50 text-red-700 border-red-200' },
  wrong_item: { label: '出錯品項', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  other: { label: '其他', className: 'bg-slate-100 text-slate-700 border-slate-300' },
};

const STATUS_META: Record<DisputeStatus, { label: string; className: string }> = {
  open: { label: '待處理', className: 'bg-red-50 text-red-700 border-red-200' },
  investigating: { label: '調查中', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: '已解決', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: '已結案', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const STATUS_ORDER: DisputeStatus[] = ['open', 'investigating', 'resolved', 'closed'];
const OPEN_STATUSES: DisputeStatus[] = ['open', 'investigating'];

const daysBetween = (from: string, to: string | null): number => {
  const end = to ? new Date(to).getTime() : Date.now();
  const ms = end - new Date(from).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / 86_400_000) : 0;
};

const formatDays = (d: number): string => (d < 1 ? '不到 1 天' : `${Math.round(d)} 天`);

const money = (v: number | null) =>
  v == null ? null : `NT$ ${Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

/* ------------------------------ page ------------------------------ */
export default function AdminDisputesPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, OrderLite>>({});
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | DisputeStatus>('open');

  const [editing, setEditing] = useState<DisputeRow | null>(null);
  const [formStatus, setFormStatus] = useState<DisputeStatus>('investigating');
  const [formResolution, setFormResolution] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const res = await table<DisputeRow>('disputes')
      .select(
        'id, order_id, kind, status, opened_by, opened_role, detail, resolution, resolved_by, resolved_at, created_at',
      )
      .order('created_at', { ascending: false });

    if (res.error) {
      setLoadError(res.error.message);
      toast.error('讀取爭議清單失敗', { description: res.error.message });
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const list = res.data ?? [];
    setRows(list);

    const [oRes, restRes, supRes] = await Promise.all([
      table<OrderLite>('supplier_orders').select(
        'id, status, restaurant_id, supplier_id, total_amount',
      ),
      table<NameRow>('restaurants').select('id, name'),
      table<NameRow>('suppliers').select('id, name'),
    ]);

    const oMap: Record<string, OrderLite> = {};
    (oRes.data ?? []).forEach((o) => {
      oMap[o.id] = o;
    });
    setOrderMap(oMap);

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

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    STATUS_ORDER.forEach((s) => {
      c[s] = rows.filter((r) => r.status === s).length;
    });
    return c;
  }, [rows]);

  const kpis = useMemo(() => {
    const unresolved = rows.filter((r) => OPEN_STATUSES.includes(r.status));
    const settled = rows.filter((r) => !OPEN_STATUSES.includes(r.status));
    const settledDays = settled.map((r) => daysBetween(r.created_at, r.resolved_at));
    const avgDays =
      settledDays.length > 0
        ? settledDays.reduce((s, v) => s + v, 0) / settledDays.length
        : null;
    const oldest = unresolved.reduce<number>(
      (max, r) => Math.max(max, daysBetween(r.created_at, null)),
      0,
    );
    return { unresolved: unresolved.length, settled: settled.length, avgDays, oldest };
  }, [rows]);

  const visible = useMemo(
    () => (tab === 'all' ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  const openEditor = (d: DisputeRow) => {
    setEditing(d);
    setFormStatus(d.status === 'open' ? 'investigating' : d.status);
    setFormResolution(d.resolution ?? '');
  };

  const handleSave = async () => {
    if (!editing) return;
    if ((formStatus === 'resolved' || formStatus === 'closed') && !formResolution.trim()) {
      toast.error('請填寫處理結果', { description: '標記為已解決／已結案時,處理結果為必填' });
      return;
    }

    setSaving(true);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;

    const patch: Record<string, unknown> = {
      status: formStatus,
      resolution: formResolution.trim() || null,
    };
    // 進入已解決／已結案 → 補上結案人與結案時間;退回處理中則清掉
    if (formStatus === 'resolved' || formStatus === 'closed') {
      patch.resolved_by = editing.resolved_by ?? uid;
      patch.resolved_at = editing.resolved_at ?? new Date().toISOString();
    } else {
      patch.resolved_by = null;
      patch.resolved_at = null;
    }

    const error = await updateRow('disputes', editing.id, patch);
    setSaving(false);

    if (error) {
      toast.error('更新失敗', { description: error.message });
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id === editing.id
          ? {
              ...r,
              status: formStatus,
              resolution: (patch.resolution as string | null) ?? null,
              resolved_by: (patch.resolved_by as string | null) ?? null,
              resolved_at: (patch.resolved_at as string | null) ?? null,
            }
          : r,
      ),
    );
    setEditing(null);
    toast.success(`已更新為「${STATUS_META[formStatus].label}」`);
  };

  /* ------------------------------ render ------------------------------ */
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">履約與爭議 (Disputes)</h1>
        <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          重新整理
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        短缺、延遲、品質不符的案件在這裡收斂 —— 誰開的、拖了幾天、怎麼結的
      </p>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            title: '未結案',
            value: loading ? '—' : kpis.unresolved,
            hint: '待處理 + 調查中',
            icon: AlertTriangle,
            accent: kpis.unresolved > 0 ? 'text-red-600' : 'text-emerald-600',
            bg: kpis.unresolved > 0 ? 'bg-red-50' : 'bg-emerald-50',
          },
          {
            title: '平均處理天數',
            value: loading ? '—' : kpis.avgDays == null ? '—' : formatDays(kpis.avgDays),
            hint: `已結案 ${kpis.settled} 件的平均`,
            icon: Timer,
            accent: 'text-slate-800',
            bg: 'bg-blue-50',
          },
          {
            title: '最久未結',
            value: loading ? '—' : kpis.unresolved === 0 ? '—' : formatDays(kpis.oldest),
            hint: '未結案中最早開立的一件',
            icon: Clock,
            accent: kpis.oldest > 7 ? 'text-amber-600' : 'text-slate-800',
            bg: 'bg-amber-50',
          },
          {
            title: '累計案件',
            value: loading ? '—' : rows.length,
            hint: `已結案 ${kpis.settled} 件`,
            icon: ShieldCheck,
            accent: 'text-slate-800',
            bg: 'bg-slate-100',
          },
        ].map(({ title, value, hint, icon: Icon, accent, bg }) => (
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

      {/* 分頁籤 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | DisputeStatus)} className="mb-4">
        <TabsList>
          {STATUS_ORDER.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_META[s].label}
              <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{counts[s] ?? 0}</span>
            </TabsTrigger>
          ))}
          <TabsTrigger value="all">
            全部
            <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{counts.all ?? 0}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center">
          <p className="text-sm text-red-700">讀取爭議清單失敗:{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchData()}>
            重新載入
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-20 text-center text-slate-400">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm text-slate-500 font-medium">目前沒有任何爭議案件</p>
            <p className="text-xs mt-1.5 max-w-md mx-auto leading-relaxed">
              餐廳收貨時發現短缺、品質不符,或供應商延遲到貨,案件都會出現在這裡等待處理。
            </p>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              沒有「{tab === 'all' ? '全部' : STATUS_META[tab].label}」狀態的案件
            </p>
            {tab !== 'all' && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setTab('all')}>
                看全部 {rows.length} 件
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((d) => {
            const order = orderMap[d.order_id];
            const ageDays = daysBetween(d.created_at, d.resolved_at);
            const unresolved = OPEN_STATUSES.includes(d.status);
            const overdue = unresolved && ageDays > 3;

            return (
              <Card
                key={d.id}
                className={`border ${overdue ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="outline" className={KIND_META[d.kind]?.className ?? ''}>
                          {KIND_META[d.kind]?.label ?? d.kind}
                        </Badge>
                        <Badge variant="outline" className={STATUS_META[d.status]?.className ?? ''}>
                          {STATUS_META[d.status]?.label ?? d.status}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/${d.order_id}/timeline`)}
                          className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          #{d.order_id.slice(-8)}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                        {order && (
                          <Badge
                            variant="outline"
                            className={
                              ORDER_STATUS[order.status]?.className ??
                              'bg-slate-100 text-slate-700 border-slate-300'
                            }
                          >
                            訂單:{ORDER_STATUS[order.status]?.label ?? order.status}
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-slate-700 mb-1">
                        {order ? (
                          <>
                            <span className="font-medium">
                              {(order.restaurant_id && restaurantMap[order.restaurant_id]) ||
                                '未指定餐廳'}
                            </span>
                            <span className="text-slate-400 mx-1.5">→</span>
                            <span>
                              {(order.supplier_id && supplierMap[order.supplier_id]) ||
                                '未指定供應商'}
                            </span>
                            {order.total_amount != null && (
                              <span className="text-slate-400 ml-2 tabular-nums">
                                {money(order.total_amount)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400 italic">查無對應訂單資料</span>
                        )}
                      </p>

                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {d.detail?.trim() || <span className="text-slate-400 italic">未填寫詳情</span>}
                      </p>

                      {d.resolution && (
                        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="text-xs font-medium text-emerald-800 mb-0.5 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            處理結果
                          </p>
                          <p className="text-sm text-emerald-900 whitespace-pre-wrap break-words">
                            {d.resolution}
                          </p>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>
                          開立者:{d.opened_role ? ROLE_LABEL[d.opened_role] ?? d.opened_role : '未紀錄'}
                        </span>
                        <span>開立於 {new Date(d.created_at).toLocaleString('zh-TW')}</span>
                        {d.resolved_at && (
                          <span>結案於 {new Date(d.resolved_at).toLocaleString('zh-TW')}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex lg:flex-col items-center lg:items-end gap-2 shrink-0">
                      <div className="text-right">
                        <p
                          className={`text-lg font-bold tabular-nums ${
                            overdue ? 'text-red-600' : 'text-slate-700'
                          }`}
                        >
                          {formatDays(ageDays)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {unresolved ? '已擱置' : '處理耗時'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={unresolved ? 'default' : 'outline'}
                        className={unresolved ? 'bg-slate-800 hover:bg-slate-900 text-white' : ''}
                        onClick={() => openEditor(d)}
                      >
                        {unresolved ? '處理' : '編輯'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 處理對話框 */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>處理爭議案件</DialogTitle>
            <DialogDescription>
              {editing && (
                <>
                  訂單 #{editing.order_id.slice(-8)} · {KIND_META[editing.kind]?.label ?? editing.kind}
                  {' · 已擱置 '}
                  {formatDays(daysBetween(editing.created_at, editing.resolved_at))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {editing?.detail && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500 mb-1">案件詳情</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {editing.detail}
                </p>
              </div>
            )}

            <div>
              <label className="text-sm text-slate-600 mb-1 block">狀態</label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as DisputeStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-slate-600 mb-1 block">
                處理結果
                {(formStatus === 'resolved' || formStatus === 'closed') && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </label>
              <Textarea
                rows={4}
                value={formResolution}
                onChange={(e) => setFormResolution(e.target.value)}
                placeholder="例:供應商補送 3kg 牛腱心,已於 7/28 到貨,餐廳確認無誤"
              />
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              標記為已解決／已結案時會記錄結案人與結案時間。此處只更新爭議案件本身,訂單狀態請到訂單履歷頁調整。
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
