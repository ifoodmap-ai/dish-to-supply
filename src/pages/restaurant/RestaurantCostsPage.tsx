import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  TrendingDown, TrendingUp, AlertTriangle, Repeat, LineChart as LineChartIcon, Database,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant, canSeeCost } from "@/components/RestaurantRoute";

/* ── 新資料表不在 types.ts,沿用專案的 loose cast 慣例 ─────────────── */
type Result<T> = { data: T[] | null; error: { message: string } | null };
interface Q<T> extends PromiseLike<Result<T>> {
  select(cols?: string): Q<T>;
  eq(col: string, val: unknown): Q<T>;
  in(col: string, vals: unknown[]): Q<T>;
  gte(col: string, val: unknown): Q<T>;
  order(col: string, opts?: { ascending: boolean }): Q<T>;
  limit(n: number): Q<T>;
}
const db = <T,>(table: string): Q<T> =>
  (supabase as never as { from: (t: string) => Q<T> }).from(table);

interface DishIngredientRow { menu_dish_id: string; raw_name: string }
interface OrderRow { ingredient_list: { name?: string }[] | null; created_at: string }
interface IngredientRow { id: string; canonical_name: string; category: string | null }
interface AliasRow { ingredient_id: string; alias: string }
interface PriceRow {
  ingredient_id: string | null;
  raw_name: string | null;
  price: number | null;
  normalized_price: number | null;
  unit: string | null;
  captured_at: string;
}
interface SubstituteRow {
  ingredient_id: string;
  substitute_id: string;
  similarity: number | null;
  note: string | null;
}

interface Tracked {
  name: string;
  ingredientId: string | null;
  category: string | null;
  unit: string | null;
  points: { date: string; price: number }[];
  recentAvg: number | null;
  prevAvg: number | null;
  changePct: number | null;
  samples: number;
}

const DAY = 86_400_000;
const normalizeName = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/[（(].*?[)）]/g, "");
const money = (n: number) => `$${n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1)}`;
const avg = (arr: number[]) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);

const RestaurantCostsPage = () => {
  const account = useRestaurant();
  const allowed = canSeeCost(account.role);

  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [substitutes, setSubstitutes] = useState<SubstituteRow[]>([]);
  const [ingredientName, setIngredientName] = useState<Record<string, string>>({});
  const [recentByIngredient, setRecentByIngredient] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since90 = new Date(Date.now() - 90 * DAY).toISOString();

      // 1) 本店菜單食材
      const { data: dishRows } = await db<{ id: string }>("menu_dishes")
        .select("id")
        .eq("restaurant_id", account.restaurant_id);
      const dishIds = (dishRows ?? []).map((d) => d.id);

      let dishIngredients: DishIngredientRow[] = [];
      if (dishIds.length > 0) {
        const { data } = await db<DishIngredientRow>("menu_dish_ingredients")
          .select("menu_dish_id, raw_name")
          .in("menu_dish_id", dishIds);
        dishIngredients = data ?? [];
      }

      // 2) 本店叫貨過的食材
      const { data: orders } = await db<OrderRow>("supplier_orders")
        .select("ingredient_list, created_at")
        .eq("restaurant_id", account.restaurant_id)
        .order("created_at", { ascending: false })
        .limit(200);

      const freq = new Map<string, number>();
      dishIngredients.forEach((r) => {
        const n = (r.raw_name ?? "").trim();
        if (n) freq.set(n, (freq.get(n) ?? 0) + 2); // 菜單食材權重高一些
      });
      (orders ?? []).forEach((o) => {
        (Array.isArray(o.ingredient_list) ? o.ingredient_list : []).forEach((i) => {
          const n = (i?.name ?? "").trim();
          if (n) freq.set(n, (freq.get(n) ?? 0) + 1);
        });
      });

      const names = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n]) => n);

      if (names.length === 0) {
        if (!cancelled) { setTracked([]); setLoading(false); }
        return;
      }

      // 3) 食材主檔 + 別名 → 把店裡的口語名對到 ingredient_id
      const [{ data: ingRows }, { data: aliasRows }, { data: priceRows }, { data: subRows }] =
        await Promise.all([
          db<IngredientRow>("ingredients").select("id, canonical_name, category").limit(2000),
          db<AliasRow>("ingredient_aliases").select("ingredient_id, alias").limit(4000),
          db<PriceRow>("price_history")
            .select("ingredient_id, raw_name, price, normalized_price, unit, captured_at")
            .gte("captured_at", since90)
            .order("captured_at", { ascending: false })
            .limit(4000),
          db<SubstituteRow>("ingredient_substitutes")
            .select("ingredient_id, substitute_id, similarity, note")
            .limit(1000),
        ]);

      const ingredientsAll = ingRows ?? [];
      const nameById: Record<string, string> = {};
      ingredientsAll.forEach((i) => { nameById[i.id] = i.canonical_name; });

      const resolve = (raw: string): IngredientRow | null => {
        const key = normalizeName(raw);
        if (!key) return null;
        for (const i of ingredientsAll) {
          const cn = normalizeName(i.canonical_name ?? "");
          if (cn && (cn === key || cn.includes(key) || key.includes(cn))) return i;
        }
        for (const a of aliasRows ?? []) {
          const al = normalizeName(a.alias ?? "");
          if (al && (al === key || al.includes(key) || key.includes(al))) {
            const hit = ingredientsAll.find((i) => i.id === a.ingredient_id);
            if (hit) return hit;
          }
        }
        return null;
      };

      const prices = priceRows ?? [];
      const now = Date.now();

      // 每個 ingredient_id 的近 30 天均價(替代品比價用)
      const byIngredientRecent: Record<string, number[]> = {};
      prices.forEach((p) => {
        if (!p.ingredient_id) return;
        const v = p.normalized_price != null ? Number(p.normalized_price) : p.price != null ? Number(p.price) : null;
        if (v == null || !Number.isFinite(v)) return;
        const at = new Date(p.captured_at).getTime();
        if (now - at > 30 * DAY) return;
        const bucket = byIngredientRecent[p.ingredient_id];
        if (bucket) bucket.push(v);
        else byIngredientRecent[p.ingredient_id] = [v];
      });
      const recentMap: Record<string, number> = {};
      Object.entries(byIngredientRecent).forEach(([id, arr]) => {
        const a = avg(arr);
        if (a != null) recentMap[id] = a;
      });

      const list: Tracked[] = names.map((name) => {
        const hit = resolve(name);
        const key = normalizeName(name);
        const rows = prices.filter((p) => {
          if (hit && p.ingredient_id === hit.id) return true;
          const rn = normalizeName(p.raw_name ?? "");
          return !!rn && !!key && (rn.includes(key) || key.includes(rn));
        });

        const byDay = new Map<string, number[]>();
        const recent: number[] = [];
        const prev: number[] = [];
        let unit: string | null = null;

        rows.forEach((p) => {
          const v = p.normalized_price != null ? Number(p.normalized_price)
            : p.price != null ? Number(p.price) : null;
          if (v == null || !Number.isFinite(v)) return;
          unit = unit ?? p.unit;
          const at = new Date(p.captured_at).getTime();
          const day = new Date(at).toISOString().slice(0, 10);
          const dayBucket = byDay.get(day);
          if (dayBucket) dayBucket.push(v);
          else byDay.set(day, [v]);
          const ageDays = (now - at) / DAY;
          if (ageDays <= 30) recent.push(v);
          else if (ageDays <= 60) prev.push(v);
        });

        const points = [...byDay.entries()]
          .map(([date, arr]) => ({ date, price: Number((avg(arr) ?? 0).toFixed(2)) }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));

        const recentAvg = avg(recent);
        const prevAvg = avg(prev);
        const changePct = recentAvg != null && prevAvg != null && prevAvg > 0
          ? (recentAvg - prevAvg) / prevAvg
          : null;

        return {
          name,
          ingredientId: hit?.id ?? null,
          category: hit?.category ?? null,
          unit,
          points,
          recentAvg,
          prevAvg,
          changePct,
          samples: rows.length,
        };
      });

      if (!cancelled) {
        setTracked(list);
        setSubstitutes(subRows ?? []);
        setIngredientName(nameById);
        setRecentByIngredient(recentMap);
        const firstWithData = list.find((t) => t.points.length > 1) ?? list.find((t) => t.points.length > 0);
        setSelected(firstWithData?.name ?? null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.restaurant_id, allowed]);

  const withData = useMemo(() => tracked.filter((t) => t.points.length > 0), [tracked]);
  const alerts = useMemo(
    () => tracked.filter((t) => t.changePct != null && t.changePct > 0.15)
      .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)),
    [tracked],
  );
  const savers = useMemo(
    () => tracked.filter((t) => t.changePct != null && t.changePct < -0.1)
      .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)),
    [tracked],
  );
  const current = useMemo(
    () => withData.find((t) => t.name === selected) ?? withData[0] ?? null,
    [withData, selected],
  );

  if (!allowed) {
    return (
      <div className="py-20 text-center text-slate-400">
        <AlertTriangle className="h-9 w-9 mx-auto mb-3 opacity-40" />
        <p>成本資料僅開放老闆與店長檢視</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const emptyAll = tracked.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-emerald-600" />
          成本與省錢
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          追蹤本店常用食材的市場行情,漲價提早知道、也告訴你可以換什麼
        </p>
      </div>

      {emptyAll ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Database className="h-10 w-10 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 font-medium">資料累積中</p>
            <p className="text-sm text-slate-400 mt-1">
              先建立菜單食材或送出幾次採購需求,系統就會開始幫你追蹤這些食材的行情
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 漲價預警 */}
          <Card className={alerts.length > 0 ? "border-red-200" : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${alerts.length > 0 ? "text-red-500" : "text-slate-400"}`} />
                漲價預警
                <span className="text-xs font-normal text-slate-400">近 30 天均價 vs 前 30 天</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  {withData.length === 0
                    ? "資料累積中,還沒有足夠的價格樣本可以比較"
                    : "目前沒有漲幅超過 15% 的食材,行情平穩"}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {alerts.map((t) => {
                    const subs = t.ingredientId
                      ? substitutes.filter((s) => s.ingredient_id === t.ingredientId)
                      : [];
                    return (
                      <div key={t.name} className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-800">{t.name}</span>
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            漲 {((t.changePct ?? 0) * 100).toFixed(0)}%
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {money(t.prevAvg ?? 0)} → {money(t.recentAvg ?? 0)}
                            {t.unit ? ` / ${t.unit}` : ""}
                          </span>
                          <span className="text-xs text-slate-400">{t.samples} 筆報價</span>
                        </div>

                        {subs.length > 0 && (
                          <div className="mt-2 pl-1 space-y-1">
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Repeat className="h-3 w-3" /> 可考慮的替代食材
                            </p>
                            {subs.map((s) => {
                              const subPrice = recentByIngredient[s.substitute_id];
                              const diff = subPrice != null && t.recentAvg != null ? subPrice - t.recentAvg : null;
                              return (
                                <div key={`${s.ingredient_id}-${s.substitute_id}`} className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-slate-700">
                                    {ingredientName[s.substitute_id] ?? "（未命名食材）"}
                                  </span>
                                  {s.similarity != null && (
                                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[11px]">
                                      相似度 {(Number(s.similarity) * 100).toFixed(0)}%
                                    </Badge>
                                  )}
                                  {diff != null ? (
                                    <span className={diff < 0 ? "text-emerald-600 text-xs" : "text-slate-500 text-xs"}>
                                      {diff < 0 ? `便宜 ${money(Math.abs(diff))}` : `貴 ${money(diff)}`}
                                      （{money(subPrice)}）
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">尚無近期報價</span>
                                  )}
                                  {s.note && <span className="text-xs text-slate-400">· {s.note}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {subs.length === 0 && (
                          <p className="mt-1 text-xs text-slate-400">目前沒有登錄的替代食材</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 價格趨勢 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-emerald-600" />
                價格趨勢（近 90 天）
              </CardTitle>
            </CardHeader>
            <CardContent>
              {withData.length === 0 ? (
                <div className="py-14 text-center text-slate-400">
                  <Database className="h-9 w-9 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">資料累積中</p>
                  <p className="text-xs mt-1">這些食材還沒有市場報價紀錄,等供應商報價進來就會出現走勢</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {withData.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => setSelected(t.name)}
                        className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                          current?.name === t.name
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>

                  {current && current.points.length > 1 ? (
                    <>
                      <div className="flex flex-wrap items-baseline gap-3 mb-3">
                        <span className="text-lg font-semibold text-slate-800">
                          {current.recentAvg != null ? money(current.recentAvg) : "—"}
                          {current.unit ? <span className="text-sm text-slate-400"> / {current.unit}</span> : null}
                        </span>
                        {current.changePct != null && (
                          <span className={`text-sm ${current.changePct > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {current.changePct > 0 ? "▲" : "▼"} {Math.abs(current.changePct * 100).toFixed(0)}%
                            <span className="text-slate-400"> vs 前 30 天</span>
                          </span>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={current.points} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: "#94a3b8" }}
                            tickFormatter={(v: string) => `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}`}
                          />
                          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={56} />
                          <Tooltip
                            formatter={(v: number) => [money(Number(v)), "均價"]}
                            labelFormatter={(l: string) => l}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <p className="py-12 text-center text-sm text-slate-400">
                      「{current?.name}」目前只有 {current?.points.length ?? 0} 筆報價,資料累積中
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* 降價可以多買 */}
          {savers.length > 0 && (
            <Card className="border-emerald-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
                  <TrendingDown className="h-4 w-4" />
                  正在跌價,可以多備一點
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {savers.map((t) => (
                    <Badge key={t.name} variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      {t.name} 跌 {Math.abs((t.changePct ?? 0) * 100).toFixed(0)}%
                      <span className="ml-1 text-emerald-600/70">
                        {money(t.recentAvg ?? 0)}{t.unit ? `/${t.unit}` : ""}
                      </span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default RestaurantCostsPage;
