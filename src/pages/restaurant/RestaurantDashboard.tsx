import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Wallet,
  PackageCheck,
  Star,
  Store,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant, canSeeCost } from "@/components/RestaurantRoute";
import {
  ORDER_STATUS,
  isStuck,
  formatStageAge,
  type OrderStatus,
} from "@/lib/orders";

interface OrderRow {
  id: string;
  status: OrderStatus;
  total_amount: number | null;
  created_at: string;
  current_stage_since: string | null;
  supplier_id: string | null;
}

interface SupplierRow {
  id: string;
  name: string;
}

/** 不計入採購金額 / 合作供應商的狀態 */
const VOID_STATUS: OrderStatus[] = ["cancelled", "rejected", "expired", "draft"];

const TWD = (n: number) => `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;

/**
 * 以「本地時區」產生 YYYY-MM-DD 的日期鍵。
 * 不能用 toISOString(),那是 UTC —— 台灣 UTC+8 會讓當天的訂單被分到前一天。
 */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** 與上月比較的箭頭 + 百分比 */
const DeltaBadge = ({ value }: { value: number | null }) => {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Minus className="h-3 w-3" />
        上月無資料
      </span>
    );
  }
  const up = value > 0;
  const flat = Math.abs(value) < 0.5;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  // 採購金額上升 = 成本增加(暖色);下降 = 省到錢(綠色)
  const cls = flat ? "text-slate-400" : up ? "text-amber-600" : "text-emerald-600";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {flat ? "與上月持平" : `${up ? "+" : ""}${value.toFixed(1)}% 對比上月`}
    </span>
  );
};

const RestaurantDashboard = () => {
  const account = useRestaurant();
  const showCost = canSeeCost(account.role);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const { data, error } = (await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: OrderRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      })
        .from("supplier_orders")
        .select("id, status, total_amount, created_at, current_stage_since, supplier_id")
        .eq("restaurant_id", account.restaurant_id)
        .order("created_at", { ascending: false })) as {
        data: OrderRow[] | null;
        error: { message: string } | null;
      };

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        toast.error("載入營運資料失敗", { description: error.message });
        setOrders([]);
        setLoading(false);
        return;
      }

      setOrders(data ?? []);

      const { data: sup } = (await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => Promise<{
            data: SupplierRow[] | null;
            error: { message: string } | null;
          }>;
        };
      })
        .from("suppliers")
        .select("id, name")) as {
        data: SupplierRow[] | null;
        error: { message: string } | null;
      };

      if (cancelled) return;
      const map: Record<string, string> = {};
      (sup ?? []).forEach((s) => {
        map[s.id] = s.name;
      });
      setSupplierMap(map);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [account.restaurant_id]);

  const stats = useMemo(() => {
    const valid = orders.filter((o) => !VOID_STATUS.includes(o.status));

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    let thisMonth = 0;
    let lastMonth = 0;
    let thisMonthCount = 0;
    let lastMonthCount = 0;

    valid.forEach((o) => {
      const t = new Date(o.created_at).getTime();
      const amount = Number(o.total_amount ?? 0);
      if (t >= thisMonthStart) {
        thisMonth += amount;
        thisMonthCount += 1;
      } else if (t >= lastMonthStart) {
        lastMonth += amount;
        lastMonthCount += 1;
      }
    });

    const delta =
      lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;
    const countDelta =
      lastMonthCount > 0
        ? ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100
        : null;

    const pendingReceive = orders.filter((o) => o.status === "delivered").length;
    const pendingReview = orders.filter((o) => o.status === "received").length;

    const supplierIds = new Set(
      valid.map((o) => o.supplier_id).filter((v): v is string => !!v),
    );

    // 近 30 天趨勢(補齊沒有訂單的日期)
    const dayMs = 86_400_000;
    const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const buckets = new Map<string, { amount: number; count: number }>();
    for (let i = 29; i >= 0; i -= 1) {
      buckets.set(dayKey(new Date(todayKey - i * dayMs)), { amount: 0, count: 0 });
    }
    valid.forEach((o) => {
      const key = dayKey(new Date(o.created_at));
      const b = buckets.get(key);
      if (b) {
        b.amount += Number(o.total_amount ?? 0);
        b.count += 1;
      }
    });
    const trend = [...buckets.entries()].map(([date, v]) => ({
      date: date.slice(5).replace("-", "/"),
      amount: Math.round(v.amount),
      count: v.count,
    }));
    const trendHasData = trend.some((t) => (showCost ? t.amount > 0 : t.count > 0));

    // 待辦:delivered 超過 72h 還沒確認收貨
    const overdue = orders
      .filter(
        (o) =>
          o.status === "delivered" &&
          isStuck("delivered", o.current_stage_since ?? o.created_at),
      )
      .sort(
        (a, b) =>
          new Date(a.current_stage_since ?? a.created_at).getTime() -
          new Date(b.current_stage_since ?? b.created_at).getTime(),
      );

    return {
      thisMonth,
      delta,
      thisMonthCount,
      countDelta,
      pendingReceive,
      pendingReview,
      supplierCount: supplierIds.size,
      trend,
      trendHasData,
      overdue,
    };
  }, [orders, showCost]);

  const kpis = [
    showCost
      ? {
          key: "amount",
          title: "本月採購金額",
          value: TWD(stats.thisMonth),
          delta: stats.delta,
          icon: Wallet,
          accent: "text-emerald-600",
          bg: "bg-emerald-50",
        }
      : {
          key: "amount",
          title: "本月採購單數",
          value: `${stats.thisMonthCount} 筆`,
          delta: stats.countDelta,
          icon: ClipboardList,
          accent: "text-emerald-600",
          bg: "bg-emerald-50",
        },
    {
      key: "receive",
      title: "待收貨",
      value: `${stats.pendingReceive} 筆`,
      delta: undefined,
      icon: PackageCheck,
      accent: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      key: "review",
      title: "待評價",
      value: `${stats.pendingReview} 筆`,
      delta: undefined,
      icon: Star,
      accent: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      key: "suppliers",
      title: "合作供應商",
      value: `${stats.supplierCount} 家`,
      delta: undefined,
      icon: Store,
      accent: "text-blue-600",
      bg: "bg-blue-50",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">營運總覽</h1>
        <p className="text-sm text-slate-500 mt-1">
          {account.restaurant_name} 的採購動態與待辦事項
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          載入失敗:{loadError}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ key, title, value, delta, icon: Icon, accent, bg }) => (
          <Card key={key} className="border border-slate-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              {loading ? (
                <Skeleton className="h-8 w-24 mb-1" />
              ) : (
                <div className={`text-2xl font-bold ${accent} tabular-nums`}>{value}</div>
              )}
              <div className="text-xs text-slate-500 mt-0.5">{title}</div>
              {delta !== undefined && !loading && (
                <div className="mt-1.5">
                  <DeltaBadge value={delta} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 趨勢圖 */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-700">
              近 30 天採購趨勢
            </CardTitle>
            <p className="text-xs text-slate-400">
              {showCost ? "每日採購金額(NT$)" : "每日採購單數"}
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : !stats.trendHasData ? (
              <div className="h-[240px] flex flex-col items-center justify-center text-slate-400 text-sm">
                <ClipboardList className="h-9 w-9 mb-3 opacity-40" />
                <p>近 30 天還沒有採購紀錄</p>
                <Link to="/restaurant/purchase">
                  <Button variant="ghost" size="sm" className="mt-2 text-emerald-600 hover:text-emerald-700">
                    開始建立採購單
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={stats.trend} margin={{ left: -12, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="restaurantTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    width={showCost ? 64 : 36}
                    tickFormatter={(v: number) =>
                      showCost ? Number(v).toLocaleString("zh-TW") : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) =>
                      showCost ? [TWD(Number(v)), "採購金額"] : [`${v} 筆`, "採購單數"]
                    }
                    labelFormatter={(l: string) => `${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey={showCost ? "amount" : "count"}
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#restaurantTrend)"
                    name={showCost ? "採購金額" : "採購單數"}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 待辦清單 */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base text-slate-700">待辦事項</CardTitle>
              {!loading && stats.overdue.length > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  {stats.overdue.length}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">已送達超過 72 小時、尚未確認收貨</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : stats.overdue.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                <PackageCheck className="h-9 w-9 mx-auto mb-3 opacity-40" />
                <p>目前沒有逾期未確認的收貨</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.overdue.slice(0, 6).map((o) => {
                  const since = o.current_stage_since ?? o.created_at;
                  return (
                    <Link
                      key={o.id}
                      to="/restaurant/orders"
                      className="block rounded-md border border-orange-200 bg-orange-50/60 px-3 py-2.5 hover:bg-orange-50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {(o.supplier_id && supplierMap[o.supplier_id]) || "未指定供應商"}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            已停留 {formatStageAge(since)} ·{" "}
                            {ORDER_STATUS[o.status]?.label ?? o.status}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                      </div>
                    </Link>
                  );
                })}
                {stats.overdue.length > 6 && (
                  <Link to="/restaurant/orders">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-emerald-600 hover:text-emerald-700"
                    >
                      查看全部 {stats.overdue.length} 筆
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!showCost && !loading && (
        <p className="mt-4 text-xs text-slate-400">
          你的角色為採購員,成本與金額相關數字不會顯示。
        </p>
      )}
    </div>
  );
};

export default RestaurantDashboard;
