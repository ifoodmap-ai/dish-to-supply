import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Store, Star, ShieldAlert, ExternalLink, Truck, PackageX, Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant, canSeeCost } from "@/components/RestaurantRoute";

/* ── 新資料表不在 types.ts,沿用專案的 loose cast 慣例 ─────────────── */
type Result<T> = { data: T[] | null; error: { message: string } | null };
interface Q<T> extends PromiseLike<Result<T>> {
  select(cols?: string): Q<T>;
  eq(col: string, val: unknown): Q<T>;
  in(col: string, vals: unknown[]): Q<T>;
  order(col: string, opts?: { ascending: boolean }): Q<T>;
  limit(n: number): Q<T>;
}
const db = <T,>(table: string): Q<T> =>
  (supabase as never as { from: (t: string) => Q<T> }).from(table);

interface OrderRow {
  id: string;
  supplier_id: string | null;
  total_amount: number | null;
  status: string;
  created_at: string;
}

interface SupplierRow {
  id: string;
  name: string;
  description: string | null;
  service_areas: string[] | null;
}

interface MetricsRow {
  supplier_id: string;
  orders_total: number | null;
  ontime_rate: number | null;
  shortage_rate: number | null;
  avg_reply_minutes: number | null;
  avg_rating: number | null;
  computed_at: string | null;
}

interface Partner {
  supplier: SupplierRow;
  orders: number;
  amount: number;
  lastAt: string | null;
  metrics: MetricsRow | null;
}

/** 比率可能存 0–1 或 0–100,統一換算成百分比 */
const toPct = (v: number | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const RestaurantSuppliersPage = () => {
  const account = useRestaurant();
  const showCost = canSeeCost(account.role);

  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: orders } = await db<OrderRow>("supplier_orders")
        .select("id, supplier_id, total_amount, status, created_at")
        .eq("restaurant_id", account.restaurant_id)
        .order("created_at", { ascending: false })
        .limit(500);

      const grouped = new Map<string, { orders: number; amount: number; lastAt: string | null }>();
      (orders ?? []).forEach((o) => {
        if (!o.supplier_id) return;
        const cur = grouped.get(o.supplier_id) ?? { orders: 0, amount: 0, lastAt: null };
        cur.orders += 1;
        cur.amount += o.total_amount != null ? Number(o.total_amount) : 0;
        if (!cur.lastAt || new Date(o.created_at) > new Date(cur.lastAt)) cur.lastAt = o.created_at;
        grouped.set(o.supplier_id, cur);
      });

      const ids = [...grouped.keys()];
      if (ids.length === 0) {
        if (!cancelled) { setPartners([]); setLoading(false); }
        return;
      }

      const [{ data: sups }, { data: metrics }] = await Promise.all([
        db<SupplierRow>("suppliers").select("id, name, description, service_areas").in("id", ids),
        db<MetricsRow>("supplier_metrics")
          .select("supplier_id, orders_total, ontime_rate, shortage_rate, avg_reply_minutes, avg_rating, computed_at")
          .in("supplier_id", ids),
      ]);

      const metricsById = new Map((metrics ?? []).map((m) => [m.supplier_id, m]));
      const list: Partner[] = (sups ?? []).map((s) => {
        const g = grouped.get(s.id)!;
        return {
          supplier: s,
          orders: g.orders,
          amount: g.amount,
          lastAt: g.lastAt,
          metrics: metricsById.get(s.id) ?? null,
        };
      }).sort((a, b) => b.orders - a.orders);

      if (!cancelled) { setPartners(list); setLoading(false); }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.restaurant_id]);

  const totals = useMemo(() => ({
    suppliers: partners.length,
    orders: partners.reduce((a, p) => a + p.orders, 0),
    amount: partners.reduce((a, p) => a + p.amount, 0),
  }), [partners]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-44" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Store className="h-6 w-6 text-emerald-600" />
          我的供應商
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          合作過的供應商與他們的表現,準時率或短少率不佳時會提醒你先找備援
        </p>
      </div>

      {partners.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <PackageX className="h-10 w-10 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 font-medium">還沒有合作過的供應商</p>
            <p className="text-sm text-slate-400 mt-1 mb-5">
              送出第一筆採購需求後,媒合到的供應商就會列在這裡
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link to="/restaurant/purchase">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Truck className="h-4 w-4 mr-1.5" />
                  去建立採購需求
                </Button>
              </Link>
              <Link to="/suppliers">
                <Button variant="outline">
                  <Store className="h-4 w-4 mr-1.5" />
                  瀏覽供應商名錄
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className={`grid gap-4 ${showCost ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">合作供應商</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{totals.suppliers}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">累計訂單</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{totals.orders}</p>
              </CardContent>
            </Card>
            {showCost && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-slate-500">累計金額</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {totals.amount > 0 ? money(totals.amount) : "—"}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {partners.map((p) => {
              const ontime = toPct(p.metrics?.ontime_rate);
              const shortage = toPct(p.metrics?.shortage_rate);
              const risky = (ontime != null && ontime < 80) || (shortage != null && shortage > 10);
              return (
                <Card key={p.supplier.id} className={risky ? "border-red-200" : undefined}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold text-slate-800 truncate">{p.supplier.name}</h2>
                          {risky && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              <ShieldAlert className="h-3 w-3 mr-1" />
                              建議備援
                            </Badge>
                          )}
                        </div>
                        {p.supplier.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{p.supplier.description}</p>
                        )}
                        {p.supplier.service_areas && p.supplier.service_areas.length > 0 && (
                          <p className="text-xs text-slate-400 mt-1">
                            配送:{p.supplier.service_areas.join("、")}
                          </p>
                        )}
                      </div>
                      <Link to={`/supplier/${p.supplier.id}`} className="shrink-0">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          查看
                        </Button>
                      </Link>
                    </div>

                    <div className={`grid gap-3 ${showCost ? "grid-cols-3" : "grid-cols-2"} border-t border-slate-100 pt-3`}>
                      <div>
                        <p className="text-[11px] text-slate-400">合作單數</p>
                        <p className="text-sm font-semibold text-slate-800">{p.orders}</p>
                      </div>
                      {showCost && (
                        <div>
                          <p className="text-[11px] text-slate-400">累計金額</p>
                          <p className="text-sm font-semibold text-slate-800">
                            {p.amount > 0 ? money(p.amount) : "—"}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] text-slate-400">最近合作</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {p.lastAt ? new Date(p.lastAt).toLocaleDateString("zh-TW") : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-t border-slate-100 mt-3 pt-3">
                      <div>
                        <p className="text-[11px] text-slate-400">準時率</p>
                        <p className={`text-sm font-semibold ${
                          ontime == null ? "text-slate-400" : ontime < 80 ? "text-red-600" : "text-emerald-600"
                        }`}>
                          {ontime != null ? `${ontime.toFixed(0)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400">短少率</p>
                        <p className={`text-sm font-semibold ${
                          shortage == null ? "text-slate-400" : shortage > 10 ? "text-red-600" : "text-emerald-600"
                        }`}>
                          {shortage != null ? `${shortage.toFixed(0)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-400">平均評分</p>
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                          {p.metrics?.avg_rating != null ? (
                            <>
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                              {Number(p.metrics.avg_rating).toFixed(1)}
                            </>
                          ) : <span className="text-slate-400">—</span>}
                        </p>
                      </div>
                    </div>

                    {p.metrics?.avg_reply_minutes != null && (
                      <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        平均回覆 {Math.round(Number(p.metrics.avg_reply_minutes))} 分鐘
                        {p.metrics.computed_at
                          ? ` · 統計於 ${new Date(p.metrics.computed_at).toLocaleDateString("zh-TW")}`
                          : ""}
                      </p>
                    )}
                    {!p.metrics && (
                      <p className="text-[11px] text-slate-400 mt-3">尚無績效統計資料</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default RestaurantSuppliersPage;
