import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  UtensilsCrossed,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';

interface DishRow {
  id: string;
  restaurant_id: string | null;
  name: string;
  sell_price: number | null;
  servings: number | null;
  category: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface DishIngredientRow {
  id: string;
  menu_dish_id: string;
  ingredient_id: string | null;
  raw_name: string | null;
  quantity: number | null;
  unit: string | null;
}

interface IngredientLite {
  id: string;
  canonical_name: string;
  category: string | null;
}

interface RestaurantLite {
  id: string;
  name: string;
}

interface RowDraft {
  raw_name: string;
  quantity: string;
  unit: string;
  ingredient_id: string;
}

const NONE = '__none__';
const ALL = '__all__';

const emptyDraft: RowDraft = { raw_name: '', quantity: '', unit: '', ingredient_id: NONE };

const toDraft = (r: DishIngredientRow): RowDraft => ({
  raw_name: r.raw_name ?? '',
  quantity: r.quantity != null ? String(r.quantity) : '',
  unit: r.unit ?? '',
  ingredient_id: r.ingredient_id ?? NONE,
});

const sameDraft = (a: RowDraft, b: RowDraft): boolean =>
  a.raw_name === b.raw_name &&
  a.quantity === b.quantity &&
  a.unit === b.unit &&
  a.ingredient_id === b.ingredient_id;

const AdminDishMappingPage = () => {
  const [dishes, setDishes] = useState<DishRow[]>([]);
  const [dishIngredients, setDishIngredients] = useState<DishIngredientRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLite[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [restaurantFilter, setRestaurantFilter] = useState<string>(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [newRows, setNewRows] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DishIngredientRow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [dishRes, diRes, ingRes, restRes] = await Promise.all([
      (supabase as never)
        .from('menu_dishes')
        .select('id, restaurant_id, name, sell_price, servings, category, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      (supabase as never)
        .from('menu_dish_ingredients')
        .select('id, menu_dish_id, ingredient_id, raw_name, quantity, unit'),
      (supabase as never)
        .from('ingredients')
        .select('id, canonical_name, category')
        .order('canonical_name', { ascending: true }),
      (supabase as never).from('restaurants').select('id, name'),
    ]);

    const err = (dishRes as { error: { message?: string } | null }).error;
    if (err) toast.error('載入菜色失敗', { description: err.message });

    setDishes(((dishRes as { data: DishRow[] | null }).data) ?? []);
    setDishIngredients(((diRes as { data: DishIngredientRow[] | null }).data) ?? []);
    setIngredients(((ingRes as { data: IngredientLite[] | null }).data) ?? []);
    setRestaurants(((restRes as { data: RestaurantLite[] | null }).data) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const restaurantName = useCallback(
    (id: string | null) => (id ? restaurants.find((r) => r.id === id)?.name ?? '未知餐廳' : '未指定餐廳'),
    [restaurants],
  );

  const ingredientName = useCallback(
    (id: string | null) => (id ? ingredients.find((i) => i.id === id)?.canonical_name ?? null : null),
    [ingredients],
  );

  const rowsByDish = useMemo(() => {
    const map = new Map<string, DishIngredientRow[]>();
    dishIngredients.forEach((r) => {
      const list = map.get(r.menu_dish_id) ?? [];
      list.push(r);
      map.set(r.menu_dish_id, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => (a.raw_name ?? '').localeCompare(b.raw_name ?? '')),
    );
    return map;
  }, [dishIngredients]);

  const stats = useMemo(() => {
    const totalRows = dishIngredients.length;
    const mappedRows = dishIngredients.filter((r) => !!r.ingredient_id).length;
    const rate = totalRows > 0 ? Math.round((mappedRows / totalRows) * 100) : 0;
    const unmappedDishes = dishes.filter((d) => {
      const rows = rowsByDish.get(d.id) ?? [];
      return rows.length === 0 || rows.some((r) => !r.ingredient_id);
    }).length;
    return { totalRows, mappedRows, rate, unmappedDishes };
  }, [dishIngredients, dishes, rowsByDish]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes.filter((d) => {
      if (restaurantFilter !== ALL && d.restaurant_id !== restaurantFilter) return false;
      const rows = rowsByDish.get(d.id) ?? [];
      if (onlyUnmapped && rows.length > 0 && rows.every((r) => !!r.ingredient_id)) return false;
      if (!q) return true;
      const haystack = [
        d.name,
        d.category ?? '',
        restaurantName(d.restaurant_id),
        ...rows.map((r) => r.raw_name ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [dishes, rowsByDish, search, onlyUnmapped, restaurantFilter, restaurantName]);

  const getDraft = (r: DishIngredientRow): RowDraft => drafts[r.id] ?? toDraft(r);

  const setDraft = (rowId: string, patch: Partial<RowDraft>, base: RowDraft) => {
    setDrafts((d) => ({ ...d, [rowId]: { ...base, ...patch } }));
  };

  const saveRow = async (r: DishIngredientRow) => {
    const draft = getDraft(r);
    if (!draft.raw_name.trim()) {
      toast.error('食材名稱不可空白');
      return;
    }
    setSavingId(r.id);
    const payload = {
      raw_name: draft.raw_name.trim(),
      quantity: draft.quantity.trim() ? Number(draft.quantity) : null,
      unit: draft.unit.trim() || null,
      ingredient_id: draft.ingredient_id === NONE ? null : draft.ingredient_id,
    };
    const { error } = await (supabase as never)
      .from('menu_dish_ingredients')
      .update(payload)
      .eq('id', r.id);
    setSavingId(null);
    if (error) {
      toast.error('儲存失敗', { description: (error as { message?: string }).message });
      return;
    }
    setDishIngredients((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, ...payload } : x)),
    );
    setDrafts((d) => {
      const next = { ...d };
      delete next[r.id];
      return next;
    });
    toast.success('已更新食材組成', { description: '人工修正已回寫,可作為 AI 再訓練的資料' });
  };

  const addRow = async (dishId: string) => {
    const draft = newRows[dishId] ?? emptyDraft;
    if (!draft.raw_name.trim()) {
      toast.error('請先填寫食材名稱');
      return;
    }
    setSavingId(`new-${dishId}`);
    const payload = {
      menu_dish_id: dishId,
      raw_name: draft.raw_name.trim(),
      quantity: draft.quantity.trim() ? Number(draft.quantity) : null,
      unit: draft.unit.trim() || null,
      ingredient_id: draft.ingredient_id === NONE ? null : draft.ingredient_id,
    };
    const { error } = await (supabase as never).from('menu_dish_ingredients').insert(payload);
    setSavingId(null);
    if (error) {
      toast.error('新增失敗', { description: (error as { message?: string }).message });
      return;
    }
    setNewRows((n) => ({ ...n, [dishId]: emptyDraft }));
    toast.success('已新增食材');
    const { data } = (await (supabase as never)
      .from('menu_dish_ingredients')
      .select('id, menu_dish_id, ingredient_id, raw_name, quantity, unit')) as {
      data: DishIngredientRow[] | null;
    };
    setDishIngredients(data ?? []);
  };

  const handleDeleteRow = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setDishIngredients((prev) => prev.filter((x) => x.id !== target.id));
    const { error } = await (supabase as never)
      .from('menu_dish_ingredients')
      .delete()
      .eq('id', target.id);
    if (error) {
      toast.error('刪除失敗', { description: (error as { message?: string }).message });
      setDishIngredients((prev) => [...prev, target]);
      return;
    }
    toast.success('已刪除食材');
  };

  const ingredientSelect = (value: string, onChange: (v: string) => void, compact = true) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={compact ? 'h-9' : ''}>
        <SelectValue placeholder="對應主檔…" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>
          <span className="text-amber-600">尚未對應</span>
        </SelectItem>
        {ingredients.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.canonical_name}
            {i.category ? ` (${i.category})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">菜色 ↔ 食材對應 (Dish Mapping)</h1>
      <p className="text-sm text-slate-500 mb-6">
        AI 從菜單拆出來的食材組成,在這裡做人工校正並掛上食材主檔。
      </p>

      {/* 資料飛輪說明 */}
      <Card className="border-emerald-200 bg-emerald-50/60 mb-4">
        <CardContent className="py-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold mb-1">人工修正 = 餵養 AI 的資料飛輪</p>
            <p className="text-emerald-800/90 leading-relaxed">
              每一次在這裡改名稱、補數量、把 raw_name 掛到主檔食材,都會累積成平台的標註資料。
              下一版拆解模型會用這些校正過的菜色重新訓練,拆得越準 → 比價越準 → 需要人工修的越少。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: '菜色總數', value: dishes.length, accent: 'text-slate-800' },
          { label: '食材組成筆數', value: stats.totalRows, accent: 'text-slate-800' },
          { label: '已對應主檔', value: `${stats.rate}%`, accent: 'text-emerald-600' },
          { label: '待補對應菜色', value: stats.unmappedDishes, accent: 'text-amber-600' },
        ].map((k) => (
          <Card key={k.label} className="border-slate-200">
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${k.accent}`}>{loading ? '—' : k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 篩選列 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜尋菜名 / 餐廳 / 食材…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
          <SelectTrigger className="sm:w-56 bg-white">
            <SelectValue placeholder="全部餐廳" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>全部餐廳</SelectItem>
            {restaurants.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:ml-auto whitespace-nowrap">
          <Switch checked={onlyUnmapped} onCheckedChange={setOnlyUnmapped} />
          只看尚未對應到主檔
        </label>
      </div>

      {/* 菜色列表 */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <UtensilsCrossed className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>
              {dishes.length === 0
                ? '尚無菜色資料,餐廳上傳菜單並完成 AI 分析後會出現在這裡'
                : '沒有符合條件的菜色'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const rows = rowsByDish.get(d.id) ?? [];
            const mapped = rows.filter((r) => !!r.ingredient_id).length;
            const expanded = expandedId === d.id;
            const allMapped = rows.length > 0 && mapped === rows.length;
            const newDraft = newRows[d.id] ?? emptyDraft;
            return (
              <Card key={d.id} className="border-slate-200 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedId(expanded ? null : d.id)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{d.name}</span>
                      {d.category && (
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                          {d.category}
                        </Badge>
                      )}
                      {d.is_active === false && (
                        <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">
                          已下架
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                      <span>{restaurantName(d.restaurant_id)}</span>
                      {d.sell_price != null && <span>售價 ${d.sell_price.toLocaleString()}</span>}
                      {d.servings != null && <span>{d.servings} 份</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {rows.length === 0 ? (
                      <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">
                        無食材組成
                      </Badge>
                    ) : allMapped ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        已對應 {mapped}/{rows.length}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        已對應 {mapped}/{rows.length}
                      </Badge>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                    <div className="hidden md:grid md:grid-cols-12 gap-2 px-1 pb-2 text-xs font-medium text-slate-500">
                      <div className="col-span-4">食材名稱 (AI 原始文字)</div>
                      <div className="col-span-2">數量</div>
                      <div className="col-span-2">單位</div>
                      <div className="col-span-3">對應主檔食材</div>
                      <div className="col-span-1 text-right">操作</div>
                    </div>

                    <div className="space-y-2">
                      {rows.length === 0 && (
                        <p className="text-sm text-slate-400 px-1 py-2">
                          這道菜還沒有食材組成,可在下方直接新增。
                        </p>
                      )}
                      {rows.map((r) => {
                        const draft = getDraft(r);
                        const dirty = !sameDraft(draft, toDraft(r));
                        const mappedName = ingredientName(r.ingredient_id);
                        return (
                          <div
                            key={r.id}
                            className={`grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-md border px-2 py-2 ${
                              dirty ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="md:col-span-4">
                              <Input
                                value={draft.raw_name}
                                onChange={(e) => setDraft(r.id, { raw_name: e.target.value }, draft)}
                                className="h-9"
                                placeholder="高麗菜"
                              />
                              {!r.ingredient_id && (
                                <p className="text-[11px] text-amber-600 mt-1 md:hidden">尚未對應主檔</p>
                              )}
                            </div>
                            <div className="md:col-span-2">
                              <Input
                                type="number"
                                value={draft.quantity}
                                onChange={(e) => setDraft(r.id, { quantity: e.target.value }, draft)}
                                className="h-9"
                                placeholder="0.5"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Input
                                value={draft.unit}
                                onChange={(e) => setDraft(r.id, { unit: e.target.value }, draft)}
                                className="h-9"
                                placeholder="台斤"
                              />
                            </div>
                            <div className="md:col-span-3">
                              {ingredientSelect(draft.ingredient_id, (v) =>
                                setDraft(r.id, { ingredient_id: v }, draft),
                              )}
                              {mappedName && draft.ingredient_id === r.ingredient_id && (
                                <p className="text-[11px] text-slate-400 mt-1 truncate">
                                  目前:{mappedName}
                                </p>
                              )}
                            </div>
                            <div className="md:col-span-1 flex md:justify-end items-center gap-1">
                              {dirty && (
                                <Button
                                  size="icon"
                                  className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  disabled={savingId === r.id}
                                  onClick={() => saveRow(r)}
                                  aria-label="儲存"
                                  title="儲存修正"
                                >
                                  {savingId === r.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteTarget(r)}
                                aria-label="刪除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 新增一列 */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center mt-3 pt-3 border-t border-dashed border-slate-200">
                      <div className="md:col-span-4">
                        <Input
                          value={newDraft.raw_name}
                          onChange={(e) =>
                            setNewRows((n) => ({ ...n, [d.id]: { ...newDraft, raw_name: e.target.value } }))
                          }
                          className="h-9 bg-white"
                          placeholder="新增食材名稱"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Input
                          type="number"
                          value={newDraft.quantity}
                          onChange={(e) =>
                            setNewRows((n) => ({ ...n, [d.id]: { ...newDraft, quantity: e.target.value } }))
                          }
                          className="h-9 bg-white"
                          placeholder="數量"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Input
                          value={newDraft.unit}
                          onChange={(e) =>
                            setNewRows((n) => ({ ...n, [d.id]: { ...newDraft, unit: e.target.value } }))
                          }
                          className="h-9 bg-white"
                          placeholder="單位"
                        />
                      </div>
                      <div className="md:col-span-3">
                        {ingredientSelect(newDraft.ingredient_id, (v) =>
                          setNewRows((n) => ({ ...n, [d.id]: { ...newDraft, ingredient_id: v } })),
                        )}
                      </div>
                      <div className="md:col-span-1 flex md:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          disabled={savingId === `new-${d.id}` || !newDraft.raw_name.trim()}
                          onClick={() => addRow(d.id)}
                        >
                          {savingId === `new-${d.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              確定刪除「{deleteTarget?.raw_name ?? '這筆食材'}」?
            </AlertDialogTitle>
            <AlertDialogDescription>
              會從這道菜的食材組成中移除,此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRow} className="bg-red-600 hover:bg-red-700">
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDishMappingPage;
