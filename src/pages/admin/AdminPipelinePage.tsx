import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  ORDER_STATUS,
  PIPELINE_STAGES,
  ROLE_LABEL,
  formatStageAge,
  hoursInStage,
  isStuck,
  type OrderStatus,
} from '@/lib/orders';

/* ---------------------------------------------------------------
 * 新資料表尚未進 types.ts,沿用專案既有的 cast 慣例
 * ------------------------------------------------------------- */
type Res<T> = { data: T[] | null; error: { message: string } | null };

interface Chain<T> extends PromiseLike<Res<T>> {
  eq(col: string, v: unknown): Chain<T>;
  in(col: string, v: readonly unknown[]): Chain<T>;
  order(col: string, opts?: { ascending: boolean }): Chain<T>;
  limit(n: number): Chain<T>;
}

const table = <T,>(name: string) =>
  (supabase as never as {
    from: (t: string) => { select: (c: string) => Chain<T> };
  }).from(name);

/* ------------------------------ types ------------------------------ */
interface PipelineRow {
  id: string;
  status: OrderStatus;
  restaurant_id: string | null;
  supplier_id: string | null;
  total_amount: number | null;
  current_stage_since: string | null;
  created_at: string;
}

interface NameRow {
  id: string;
  name: string;
}

/** 既有資料的舊狀態併進對應的看板欄位 */
const STAGE_ALIAS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'submitted',
  sent: 'dispatched',
};

const bucketOf = (s: OrderStatus): OrderStatus => STAGE_ALIAS[s] ?? s;

/** 沒有 order_pipeline view 時的後備查詢範圍 */
const ACTIVE_STATUSES: OrderStatus[] = [...PIPELINE_STAGES, 'pending', 'sent', 'discrepancy', 'disputed'];

const money = (v: number | null) =>
  v == null ? null : `NT$ ${Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

/* ------------------------------ page ------------------------------ */
export default function AdminPipelinePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onlyStuck, setOnlyStuck] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    // 1) 優先讀 order_pipeline view(只含進行中訂單)
    let list: PipelineRow[] | null = null;
    const viewRes = await table<PipelineRow>('order_pipeline').select(
      'id, status, restaurant_id, supplier_id, total_amount, current_stage_since, created_at',
    );

    if (!viewRes.error) {
      list = viewRes.data ?? [];
    } else {
      // 2) view 不可用時,直接查 supplier_orders 進行中的單
      const fallback = await table<PipelineRow>('supplier_orders')
        .select('id, status, restaurant_id, supplier_id, total_amount, current_stage_since, created_at')
        .in('status', ACTIVE_STATUSES);
      if (fallback.error) {
        setLoadError(fallback.error.message);
        toast.error('讀取交易看板失敗', { description: fallback.error.message });
        setRows([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      list = fallback.data ?? [];
    }

    setRows(list);

    // 餐廳 / 供應商名稱對照
    const [rest, sup] = await Promise.all([
      table<NameRow>('restaurants').select('id, name'),
      table<NameRow>('suppliers').select('id, name'),
    ]);
    const rMap: Record<string, string> = {};
    (rest.data ?? []).forEach((r) => {
      rMap[r.id] = r.name;
    });
    setRestaurantMap(rMap);
    const sMap: Record<string, string> = {};
    (sup.data ?? []).forEach((s) => {
      sMap[s.id] = s.name;
    });
    setSupplierMap(sMap);

    setFetchedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stuckRows = useMemo(
    () => rows.filter((r) => isStuck(r.status, r.current_stage_since)),
    [rows],
  );

  const visible = onlyStuck ? stuckRows : rows;

  const { columns, exceptions } = useMemo(() => {
    const cols = PIPELINE_STAGES.map((stage) => ({
      stage,
      label: ORDER_STATUS[stage].label,
      rows: [] as PipelineRow[],
    }));
    const extra: PipelineRow[] = [];

    visible.forEach((r) => {
      const col = cols.find((c) => c.stage === bucketOf(r.status));
      if (col) col.rows.push(r);
      else extra.push(r);
    });

    const bySeniority = (a: PipelineRow, b: PipelineRow) =>
      hoursInStage(b.current_stage_since) - hoursInStage(a.current_stage_since);
    cols.forEach((c) => c.rows.sort(bySeniority));
    extra.sort(bySeniority);

    return { columns: cols, exceptions: extra };
  }, [visible]);

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0),
    [rows],
  );

  /* ------------------------------ card ------------------------------ */
  const OrderCard = ({ row }: { row: PipelineRow }) => {
    const stuck = isStuck(row.status, row.current_stage_since);
    const meta = ORDER_STATUS[row.status];
    const waitingOn = meta?.waitingOn;

    return (
      <button
        type="button"
        onClick={() => navigate(`/admin/orders/${row.id}/timeline`)}
        className={`w-full text-left rounded-lg border p-3 transition-shadow hover:shadow-md ${
          stuck ? 'border-red-300 bg-red-50 hover:bg-red-100/70' : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-mono text-xs ${stuck ? 'text-red-700' : 'text-slate-500'}`}
          >
            #{row.id.slice(-8)}
          </span>
          <span
            className={`text-xs whitespace-nowrap ${
              stuck ? 'font-semibold text-red-700' : 'text-slate-400'
            }`}
          >
            {formatStageAge(row.current_stage_since)}
          </span>
        </div>

        <p className={`mt-1.5 text-sm font-medium truncate ${stuck ? 'text-red-900' : 'text-slate-800'}`}>
          {(row.restaurant_id && restaurantMap[row.restaurant_id]) || '未指定餐廳'}
        </p>
        <p className={`text-xs truncate ${stuck ? 'text-red-700' : 'text-slate-500'}`}>
          → {(row.supplier_id && supplierMap[row.supplier_id]) || '尚未派發供應商'}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={`text-xs tabular-nums ${stuck ? 'text-red-800' : 'text-slate-600'}`}
          >
            {money(row.total_amount) ?? <span className="text-slate-400 italic">尚未報價</span>}
          </span>
          {STAGE_ALIAS[row.status] && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-300">
              舊狀態·{meta?.label ?? row.status}
            </Badge>
          )}
        </div>

        {stuck && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              已卡關 · 該催{waitingOn ? ROLE_LABEL[waitingOn] : '相關窗口'}
            </span>
          </div>
        )}
      </button>
    );
  };

  /* ------------------------------ render ------------------------------ */
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">交易全流程看板 (Pipeline)</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <Switch checked={onlyStuck} onCheckedChange={setOnlyStuck} />
            只看卡關
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            重新整理
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        每一筆進行中的訂單卡在哪一關、卡了多久、該催誰,一眼看完
        {fetchedAt && (
          <span className="text-slate-400"> · 更新於 {fetchedAt.toLocaleTimeString('zh-TW')}</span>
        )}
      </p>

      {/* 卡關警示條 */}
      {!loading && !loadError && (
        stuckRows.length > 0 ? (
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-800 flex-1">
              有 <span className="font-bold text-base">{stuckRows.length}</span> 筆訂單超過該階段的處理時限,需要人工介入催辦
            </p>
            {!onlyStuck && (
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                onClick={() => setOnlyStuck(true)}
              >
                只看這 {stuckRows.length} 筆
              </Button>
            )}
          </div>
        ) : rows.length > 0 ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            目前沒有卡關的訂單,{rows.length} 筆全部都在時限內流動中
          </div>
        ) : null
      )}

      {/* 數字摘要 */}
      {!loading && !loadError && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">進行中訂單</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">卡關筆數</p>
            <p
              className={`text-xl font-bold tabular-nums ${
                stuckRows.length > 0 ? 'text-red-600' : 'text-slate-800'
              }`}
            >
              {stuckRows.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">在途金額</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">
              {money(totalAmount) ?? '—'}
            </p>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center">
          <p className="text-sm text-red-700">讀取交易看板失敗:{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchData()}>
            重新載入
          </Button>
        </div>
      ) : loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Skeleton className="h-4 w-24 mb-3" />
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-20 text-center text-slate-400">
          <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">目前沒有進行中的訂單</p>
          <p className="text-xs mt-1">餐廳送出叫貨單之後,會即時出現在這裡</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-20 text-center text-slate-400">
          <p className="text-sm">沒有卡關的訂單</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setOnlyStuck(false)}>
            顯示全部 {rows.length} 筆
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max items-start">
            {columns.map((col) => {
              const colStuck = col.rows.filter((r) => isStuck(r.status, r.current_stage_since)).length;
              return (
                <div
                  key={col.stage}
                  className="w-72 shrink-0 rounded-lg border border-slate-200 bg-slate-100/70"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-slate-700 truncate">{col.label}</span>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">
                        ({col.rows.length})
                      </span>
                    </div>
                    {colStuck > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-red-100 text-red-700 border-red-300 text-[11px] px-1.5 py-0 shrink-0"
                      >
                        ⚠ {colStuck}
                      </Badge>
                    )}
                  </div>
                  <div className="p-2 space-y-2 min-h-[80px]">
                    {col.rows.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">—</p>
                    ) : (
                      col.rows.map((r) => <OrderCard key={r.id} row={r} />)
                    )}
                  </div>
                </div>
              );
            })}

            {exceptions.length > 0 && (
              <div className="w-72 shrink-0 rounded-lg border border-orange-300 bg-orange-50">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-orange-200">
                  <span className="text-sm font-semibold text-orange-800">異常處理中</span>
                  <span className="text-xs text-orange-600 tabular-nums">({exceptions.length})</span>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {exceptions.map((r) => (
                    <OrderCard key={r.id} row={r} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !loadError && visible.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          點任一張卡片可查看該筆訂單的完整履歷(誰、什麼時候、做了什麼)
        </p>
      )}
    </div>
  );
}
