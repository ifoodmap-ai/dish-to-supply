import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  UtensilsCrossed, Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight,
  Camera, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant, canSeeCost } from "@/components/RestaurantRoute";
import { loadIngredientResolver, type IngredientResolver } from "@/lib/ingredients";

/* ── 新資料表不在 types.ts,沿用專案的 loose cast 慣例 ─────────────── */
type Result<T> = { data: T[] | null; error: { message: string } | null };
interface Q<T> extends PromiseLike<Result<T>> {
  select(cols?: string): Q<T>;
  eq(col: string, val: unknown): Q<T>;
  in(col: string, vals: unknown[]): Q<T>;
  order(col: string, opts?: { ascending: boolean }): Q<T>;
  limit(n: number): Q<T>;
  single(): PromiseLike<{ data: T | null; error: { message: string } | null }>;
  insert(values: unknown): Q<T>;
  update(values: unknown): Q<T>;
  delete(): Q<T>;
}
const db = <T,>(table: string): Q<T> =>
  (supabase as never as { from: (t: string) => Q<T> }).from(table);

interface Dish {
  id: string;
  restaurant_id: string;
  name: string;
  sell_price: number | null;
  servings: number | null;
  category: string | null;
  is_active: boolean | null;
}

interface DishIngredient {
  id: string;
  menu_dish_id: string;
  ingredient_id: string | null;
  raw_name: string;
  quantity: number | null;
  unit: string | null;
}

interface SupplyRow {
  id: string;
  name: string;
  price: number | null;
  unit: string | null;
  is_available: boolean | null;
}

interface DishForm {
  id: string | null;
  name: string;
  sell_price: string;
  servings: string;
  category: string;
}

const emptyDishForm: DishForm = { id: null, name: "", sell_price: "", servings: "1", category: "" };

/** 與 src/lib/api.ts 相同的正規化規則(雙向 includes 比對用) */
const normalizeName = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/[（(].*?[)）]/g, "");

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const marginClass = (rate: number | null) => {
  if (rate == null) return "text-slate-400";
  if (rate < 0.3) return "text-red-600";
  if (rate > 0.6) return "text-emerald-600";
  return "text-amber-600";
};

const RestaurantMenuPage = () => {
  const account = useRestaurant();
  const showCost = canSeeCost(account.role);

  const [loading, setLoading] = useState(true);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [ingredients, setIngredients] = useState<DishIngredient[]>([]);
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [resolver, setResolver] = useState<IngredientResolver | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [dishForm, setDishForm] = useState<DishForm>(emptyDishForm);
  const [dishFormOpen, setDishFormOpen] = useState(false);
  const [savingDish, setSavingDish] = useState(false);
  const [deleteDishId, setDeleteDishId] = useState<string | null>(null);

  const [ingForm, setIngForm] = useState({ raw_name: "", quantity: "", unit: "" });
  const [addingIng, setAddingIng] = useState(false);

  const loadAll = async () => {
    const { data: dishRows } = await db<Dish>("menu_dishes")
      .select("id, restaurant_id, name, sell_price, servings, category, is_active")
      .eq("restaurant_id", account.restaurant_id)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    const list = dishRows ?? [];
    setDishes(list);

    if (list.length > 0) {
      const { data: ingRows } = await db<DishIngredient>("menu_dish_ingredients")
        .select("id, menu_dish_id, ingredient_id, raw_name, quantity, unit")
        .in("menu_dish_id", list.map((d) => d.id));
      setIngredients(ingRows ?? []);
    } else {
      setIngredients([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadAll();
      if (showCost) {
        const [{ data: sup }, res] = await Promise.all([
          db<SupplyRow>("supplies").select("id, name, price, unit, is_available").eq("is_available", true),
          loadIngredientResolver(),
        ]);
        if (!cancelled) { setSupplies(sup ?? []); setResolver(res); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.restaurant_id]);

  /**
   * 食材名 → 市面最低價。
   * 先用食材主檔把兩邊正規化成同一個 canonical id(菜單寫「蛤蜊」、
   * 供應商上架寫「文蛤」也對得上),主檔對不上時才退回雙向 includes。
   */
  const cheapestFor = useMemo(() => {
    const cache = new Map<string, { price: number; unit: string | null; name: string } | null>();
    return (raw: string) => {
      const key = normalizeName(raw ?? "");
      if (!key) return null;
      if (cache.has(key)) return cache.get(key) ?? null;
      let best: { price: number; unit: string | null; name: string } | null = null;
      for (const s of supplies) {
        if (s.price == null) continue;
        const sn = normalizeName(s.name ?? "");
        if (!sn) continue;
        const hit = resolver
          ? resolver.sameIngredient(raw, s.name ?? "")
          : sn.includes(key) || key.includes(sn);
        if (hit) {
          const p = Number(s.price);
          if (Number.isFinite(p) && (best == null || p < best.price)) {
            best = { price: p, unit: s.unit, name: s.name };
          }
        }
      }
      cache.set(key, best);
      return best;
    };
  }, [supplies, resolver]);

  const ingredientsOf = (dishId: string) => ingredients.filter((i) => i.menu_dish_id === dishId);

  const costOf = (dish: Dish) => {
    const rows = ingredientsOf(dish.id);
    if (rows.length === 0) return { total: null as number | null, unknown: 0, perServing: null as number | null };
    let total = 0;
    let unknown = 0;
    rows.forEach((r) => {
      const match = cheapestFor(r.raw_name);
      if (!match) { unknown += 1; return; }
      total += match.price * (r.quantity != null ? Number(r.quantity) : 0);
    });
    const servings = dish.servings && dish.servings > 0 ? dish.servings : 1;
    return { total, unknown, perServing: total / servings };
  };

  const marginOf = (dish: Dish) => {
    const { perServing } = costOf(dish);
    const price = dish.sell_price != null ? Number(dish.sell_price) : null;
    if (perServing == null || price == null || price <= 0) return { profit: null, rate: null };
    return { profit: price - perServing, rate: (price - perServing) / price };
  };

  /* ── 菜色 CRUD ───────────────────────────────────────────────── */
  const openCreate = () => { setDishForm(emptyDishForm); setDishFormOpen(true); };
  const openEdit = (d: Dish) => {
    setDishForm({
      id: d.id,
      name: d.name,
      sell_price: d.sell_price != null ? String(d.sell_price) : "",
      servings: d.servings != null ? String(d.servings) : "1",
      category: d.category ?? "",
    });
    setDishFormOpen(true);
  };

  const saveDish = async () => {
    if (!dishForm.name.trim()) return;
    setSavingDish(true);
    const payload = {
      name: dishForm.name.trim(),
      sell_price: dishForm.sell_price.trim() ? Number(dishForm.sell_price) : null,
      servings: dishForm.servings.trim() ? Number(dishForm.servings) : 1,
      category: dishForm.category.trim() || null,
    };
    const { error } = dishForm.id
      ? await db("menu_dishes").update(payload).eq("id", dishForm.id)
      : await db("menu_dishes").insert({ ...payload, restaurant_id: account.restaurant_id, is_active: true });
    setSavingDish(false);
    if (error) {
      toast.error("儲存失敗", { description: error.message });
      return;
    }
    setDishFormOpen(false);
    toast.success(dishForm.id ? "已更新菜色" : "已新增菜色");
    await loadAll();
  };

  const deleteDish = async () => {
    if (!deleteDishId) return;
    const id = deleteDishId;
    setDeleteDishId(null);
    await db("menu_dish_ingredients").delete().eq("menu_dish_id", id);
    const { error } = await db("menu_dishes").delete().eq("id", id);
    if (error) {
      toast.error("刪除失敗", { description: error.message });
      return;
    }
    setDishes((prev) => prev.filter((d) => d.id !== id));
    setIngredients((prev) => prev.filter((i) => i.menu_dish_id !== id));
    toast.success("已刪除菜色");
  };

  /* ── 食材 CRUD ───────────────────────────────────────────────── */
  const addIngredient = async (dishId: string) => {
    if (!ingForm.raw_name.trim()) return;
    setAddingIng(true);
    const { error } = await db("menu_dish_ingredients").insert({
      menu_dish_id: dishId,
      raw_name: ingForm.raw_name.trim(),
      quantity: ingForm.quantity.trim() ? Number(ingForm.quantity) : null,
      unit: ingForm.unit.trim() || null,
    });
    setAddingIng(false);
    if (error) {
      toast.error("新增食材失敗", { description: error.message });
      return;
    }
    setIngForm({ raw_name: "", quantity: "", unit: "" });
    await loadAll();
  };

  const patchIngredientLocal = (id: string, patch: Partial<DishIngredient>) =>
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const persistIngredient = async (row: DishIngredient) => {
    const { error } = await db("menu_dish_ingredients")
      .update({
        raw_name: row.raw_name,
        quantity: row.quantity,
        unit: row.unit,
      })
      .eq("id", row.id);
    if (error) toast.error("更新食材失敗", { description: error.message });
  };

  const deleteIngredient = async (id: string) => {
    const { error } = await db("menu_dish_ingredients").delete().eq("id", id);
    if (error) {
      toast.error("刪除食材失敗", { description: error.message });
      return;
    }
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-emerald-600" />
            我的菜單
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            管理菜色與food cost{showCost ? ",成本以市面最低價估算" : ""}
          </p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          新增菜色
        </Button>
      </div>

      {dishes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Camera className="h-10 w-10 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 font-medium">還沒有建立菜單</p>
            <p className="text-sm text-slate-400 mt-1 mb-5">
              到首頁上傳一張菜單照片,AI 會自動幫你拆出菜色與食材
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link to="/">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Camera className="h-4 w-4 mr-1.5" />
                  上傳菜單照片做 AI 分析
                </Button>
              </Link>
              <Button variant="outline" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                手動新增菜色
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">菜色</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">分類</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">售價</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">份數</th>
                {showCost && (
                  <>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">單份成本</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">毛利額</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">毛利率</th>
                  </>
                )}
                <th className="text-right px-4 py-3 font-medium text-slate-600 w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {dishes.map((d) => {
                const rows = ingredientsOf(d.id);
                const { perServing, unknown } = costOf(d);
                const { profit, rate } = marginOf(d);
                const isOpen = expanded === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-left"
                          onClick={() => setExpanded(isOpen ? null : d.id)}
                        >
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                          <span className="font-medium text-slate-800">{d.name}</span>
                          <span className="text-xs text-slate-400 ml-1">{rows.length} 項食材</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{d.category ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-800 tabular-nums">
                        {d.sell_price != null ? money(Number(d.sell_price)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{d.servings ?? 1}</td>
                      {showCost && (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {perServing != null ? money(perServing) : "—"}
                            {unknown > 0 && (
                              <span className="block text-[11px] text-slate-400">{unknown} 項無市價</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {profit != null ? money(profit) : "—"}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold ${marginClass(rate)}`}>
                            {rate != null ? (
                              <span className="inline-flex items-center gap-1">
                                {rate < 0.3 ? <TrendingDown className="h-3.5 w-3.5" /> : rate > 0.6 ? <TrendingUp className="h-3.5 w-3.5" /> : null}
                                {(rate * 100).toFixed(0)}%
                              </span>
                            ) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-slate-700"
                          onClick={() => openEdit(d)} aria-label="編輯"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteDishId(d.id)} aria-label="刪除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        <td colSpan={showCost ? 8 : 5} className="px-6 py-4">
                          <p className="text-xs font-medium text-slate-500 mb-2">食材組成</p>
                          {rows.length === 0 ? (
                            <p className="text-sm text-slate-400 mb-3">尚未輸入食材,先加一項看看成本</p>
                          ) : (
                            <div className="space-y-2 mb-3">
                              {rows.map((r) => {
                                const match = showCost ? cheapestFor(r.raw_name) : null;
                                return (
                                  <div key={r.id} className="flex flex-wrap items-center gap-2">
                                    <Input
                                      value={r.raw_name}
                                      onChange={(e) => patchIngredientLocal(r.id, { raw_name: e.target.value })}
                                      onBlur={() => persistIngredient(r)}
                                      className="h-9 flex-1 min-w-[140px] bg-white"
                                      placeholder="食材名稱"
                                    />
                                    <Input
                                      type="number"
                                      value={r.quantity != null ? String(r.quantity) : ""}
                                      onChange={(e) =>
                                        patchIngredientLocal(r.id, {
                                          quantity: e.target.value === "" ? null : Number(e.target.value),
                                        })
                                      }
                                      onBlur={() => persistIngredient(r)}
                                      className="h-9 w-24 bg-white"
                                      placeholder="用量"
                                    />
                                    <Input
                                      value={r.unit ?? ""}
                                      onChange={(e) => patchIngredientLocal(r.id, { unit: e.target.value })}
                                      onBlur={() => persistIngredient(r)}
                                      className="h-9 w-24 bg-white"
                                      placeholder="單位"
                                    />
                                    {showCost && (
                                      <span className="text-xs text-slate-500 min-w-[140px]">
                                        {match
                                          ? `最低市價 ${money(match.price)}/${match.unit ?? "單位"} · 估 ${money(match.price * (r.quantity != null ? Number(r.quantity) : 0))}`
                                          : "查無市價"}
                                      </span>
                                    )}
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                      onClick={() => deleteIngredient(r.id)} aria-label="刪除食材"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              value={ingForm.raw_name}
                              onChange={(e) => setIngForm((f) => ({ ...f, raw_name: e.target.value }))}
                              placeholder="新增食材名稱"
                              className="h-9 flex-1 min-w-[140px] bg-white"
                            />
                            <Input
                              type="number"
                              value={ingForm.quantity}
                              onChange={(e) => setIngForm((f) => ({ ...f, quantity: e.target.value }))}
                              placeholder="用量"
                              className="h-9 w-24 bg-white"
                            />
                            <Input
                              value={ingForm.unit}
                              onChange={(e) => setIngForm((f) => ({ ...f, unit: e.target.value }))}
                              placeholder="單位"
                              className="h-9 w-24 bg-white"
                            />
                            <Button
                              variant="outline" size="sm"
                              disabled={!ingForm.raw_name.trim() || addingIng}
                              onClick={() => addIngredient(d.id)}
                            >
                              {addingIng ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                              加入食材
                            </Button>
                          </div>

                          {showCost && perServing != null && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
                                總食材成本 {money((perServing ?? 0) * (d.servings && d.servings > 0 ? d.servings : 1))}
                              </Badge>
                              <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
                                單份成本 {money(perServing)}
                              </Badge>
                              {rate != null && (
                                <Badge
                                  variant="outline"
                                  className={
                                    rate < 0.3
                                      ? "bg-red-50 text-red-700 border-red-200"
                                      : rate > 0.6
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                  }
                                >
                                  毛利率 {(rate * 100).toFixed(0)}%
                                  {rate < 0.3 ? " · 偏低,建議檢討售價" : rate > 0.6 ? " · 表現很好" : ""}
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dishFormOpen} onOpenChange={setDishFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dishForm.id ? "編輯菜色" : "新增菜色"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">菜名 *</label>
              <Input
                value={dishForm.name}
                onChange={(e) => setDishForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例:紅燒牛肉麵"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">售價</label>
                <Input
                  type="number"
                  value={dishForm.sell_price}
                  onChange={(e) => setDishForm((f) => ({ ...f, sell_price: e.target.value }))}
                  placeholder="180"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">份數</label>
                <Input
                  type="number"
                  value={dishForm.servings}
                  onChange={(e) => setDishForm((f) => ({ ...f, servings: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">分類</label>
                <Input
                  value={dishForm.category}
                  onChange={(e) => setDishForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="主餐 / 小菜"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">份數 = 這份食材配方可以做出幾份餐點,用來換算單份成本。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDishFormOpen(false)}>取消</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!dishForm.name.trim() || savingDish}
              onClick={saveDish}
            >
              {savingDish ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDishId} onOpenChange={(o) => { if (!o) setDeleteDishId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除這道菜?</AlertDialogTitle>
            <AlertDialogDescription>此菜色與其食材組成會一併刪除,無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDish} className="bg-red-600 hover:bg-red-700">
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RestaurantMenuPage;
