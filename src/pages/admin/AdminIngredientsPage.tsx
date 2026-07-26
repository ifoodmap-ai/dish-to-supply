import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
  Tags,
  Ruler,
  AlertTriangle,
  Link2,
  Loader2,
  Sprout,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface IngredientRow {
  id: string;
  canonical_name: string;
  category: string | null;
  base_unit: string | null;
  season_months: number[] | null;
  notes: string | null;
  created_at: string;
}

interface AliasRow {
  id: string;
  ingredient_id: string;
  alias: string;
}

interface ConversionRow {
  id: string;
  ingredient_id: string | null;
  from_unit: string;
  to_unit: string;
  factor: number;
}

interface SupplyLite {
  id: string;
  supplier_id: string | null;
  name: string;
  category: string | null;
  unit: string | null;
}

interface UnmatchedItem {
  key: string;
  name: string;
  count: number;
  category: string | null;
  supplierCount: number;
}

interface IngredientForm {
  id: string | null;
  canonical_name: string;
  category: string;
  base_unit: string;
  season_months: number[];
  notes: string;
}

const emptyForm: IngredientForm = {
  id: null,
  canonical_name: '',
  category: '',
  base_unit: '',
  season_months: [],
  notes: '',
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 名稱正規化:去除空白與常見標點,轉小寫,方便做別名包含比對 */
const normalize = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/[\s　·・、,，.。/\\()（）[\]【】「」-]/g, '')
    .trim();

const seasonText = (months: number[] | null): string => {
  if (!months || months.length === 0) return '全年';
  if (months.length === 12) return '全年';
  return months
    .slice()
    .sort((a, b) => a - b)
    .map((m) => `${m}月`)
    .join('、');
};

const AdminIngredientsPage = () => {
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [conversions, setConversions] = useState<ConversionRow[]>([]);
  const [supplies, setSupplies] = useState<SupplyLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 食材主檔表單
  const [form, setForm] = useState<IngredientForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IngredientRow | null>(null);

  // 別名 / 單位換算的暫存輸入(key = ingredient_id)
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  const [convDraft, setConvDraft] = useState<
    Record<string, { from_unit: string; to_unit: string; factor: string }>
  >({});
  const [busy, setBusy] = useState(false);

  // 從「未對應品項」快速掛別名
  const [quickAlias, setQuickAlias] = useState<{ alias: string; ingredientId: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [ingRes, aliasRes, convRes, supRes] = await Promise.all([
      (supabase as never)
        .from('ingredients')
        .select('id, canonical_name, category, base_unit, season_months, notes, created_at')
        .order('canonical_name', { ascending: true }),
      (supabase as never).from('ingredient_aliases').select('id, ingredient_id, alias'),
      (supabase as never)
        .from('unit_conversions')
        .select('id, ingredient_id, from_unit, to_unit, factor'),
      (supabase as never)
        .from('supplies')
        .select('id, supplier_id, name, category, unit')
        .limit(2000),
    ]);

    const ingErr = (ingRes as { error: { message?: string } | null }).error;
    if (ingErr) toast.error('載入食材主檔失敗', { description: ingErr.message });

    setIngredients(((ingRes as { data: IngredientRow[] | null }).data) ?? []);
    setAliases(((aliasRes as { data: AliasRow[] | null }).data) ?? []);
    setConversions(((convRes as { data: ConversionRow[] | null }).data) ?? []);
    setSupplies(((supRes as { data: SupplyLite[] | null }).data) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const aliasesByIngredient = useMemo(() => {
    const map = new Map<string, AliasRow[]>();
    aliases.forEach((a) => {
      const list = map.get(a.ingredient_id) ?? [];
      list.push(a);
      map.set(a.ingredient_id, list);
    });
    return map;
  }, [aliases]);

  const conversionsByIngredient = useMemo(() => {
    const map = new Map<string, ConversionRow[]>();
    conversions.forEach((c) => {
      if (!c.ingredient_id) return;
      const list = map.get(c.ingredient_id) ?? [];
      list.push(c);
      map.set(c.ingredient_id, list);
    });
    return map;
  }, [conversions]);

  /** 主檔覆蓋率:用「標準名稱 + 別名」對 supplies.name 做包含比對 */
  const coverage = useMemo(() => {
    const keys: string[] = [];
    ingredients.forEach((i) => {
      const k = normalize(i.canonical_name);
      if (k) keys.push(k);
    });
    aliases.forEach((a) => {
      const k = normalize(a.alias);
      if (k) keys.push(k);
    });
    const uniqueKeys = [...new Set(keys)].sort((a, b) => b.length - a.length);

    let matched = 0;
    const unmatchedMap = new Map<string, UnmatchedItem & { suppliers: Set<string> }>();

    supplies.forEach((s) => {
      const n = normalize(s.name);
      const hit = n.length > 0 && uniqueKeys.some((k) => n.includes(k));
      if (hit) {
        matched += 1;
        return;
      }
      const key = n || s.id;
      const exist = unmatchedMap.get(key);
      if (exist) {
        exist.count += 1;
        if (s.supplier_id) exist.suppliers.add(s.supplier_id);
        if (!exist.category && s.category) exist.category = s.category;
      } else {
        unmatchedMap.set(key, {
          key,
          name: s.name,
          count: 1,
          category: s.category,
          supplierCount: 0,
          suppliers: new Set(s.supplier_id ? [s.supplier_id] : []),
        });
      }
    });

    const unmatched = [...unmatchedMap.values()]
      .map((u) => ({
        key: u.key,
        name: u.name,
        count: u.count,
        category: u.category,
        supplierCount: u.suppliers.size,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const total = supplies.length;
    const unmatchedCount = total - matched;
    const rate = total > 0 ? Math.round((matched / total) * 100) : 0;

    return { total, matched, unmatchedCount, rate, unmatched };
  }, [ingredients, aliases, supplies]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return ingredients;
    return ingredients.filter((i) => {
      if (normalize(i.canonical_name).includes(q)) return true;
      if (i.category && normalize(i.category).includes(q)) return true;
      return (aliasesByIngredient.get(i.id) ?? []).some((a) => normalize(a.alias).includes(q));
    });
  }, [ingredients, search, aliasesByIngredient]);

  const openCreate = (prefillName?: string) => {
    setForm({ ...emptyForm, canonical_name: prefillName ?? '' });
    setFormOpen(true);
  };

  const openEdit = (i: IngredientRow) => {
    setForm({
      id: i.id,
      canonical_name: i.canonical_name,
      category: i.category ?? '',
      base_unit: i.base_unit ?? '',
      season_months: i.season_months ?? [],
      notes: i.notes ?? '',
    });
    setFormOpen(true);
  };

  const toggleMonth = (m: number) => {
    setForm((f) => ({
      ...f,
      season_months: f.season_months.includes(m)
        ? f.season_months.filter((x) => x !== m)
        : [...f.season_months, m].sort((a, b) => a - b),
    }));
  };

  const handleSave = async () => {
    const name = form.canonical_name.trim();
    if (!name) return;
    setSaving(true);
    const payload = {
      canonical_name: name,
      category: form.category.trim() || null,
      base_unit: form.base_unit.trim() || null,
      season_months: form.season_months.length > 0 ? form.season_months : null,
      notes: form.notes.trim() || null,
    };
    const { error } = form.id
      ? await (supabase as never).from('ingredients').update(payload).eq('id', form.id)
      : await (supabase as never).from('ingredients').insert(payload);
    setSaving(false);
    if (error) {
      const msg = (error as { message?: string }).message ?? '';
      toast.error('儲存失敗', {
        description: msg.includes('duplicate') ? '此標準名稱已存在於主檔' : msg,
      });
      return;
    }
    setFormOpen(false);
    toast.success(form.id ? '已更新食材' : '已新增食材');
    await fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const { error } = await (supabase as never).from('ingredients').delete().eq('id', id);
    if (error) {
      toast.error('刪除失敗', { description: (error as { message?: string }).message });
      return;
    }
    toast.success('已刪除食材');
    await fetchAll();
  };

  const addAlias = async (ingredientId: string, rawAlias?: string) => {
    const value = (rawAlias ?? aliasDraft[ingredientId] ?? '').trim();
    if (!value) return;
    setBusy(true);
    const { error } = await (supabase as never)
      .from('ingredient_aliases')
      .insert({ ingredient_id: ingredientId, alias: value });
    setBusy(false);
    if (error) {
      const msg = (error as { message?: string }).message ?? '';
      toast.error('新增別名失敗', {
        description: msg.includes('duplicate') ? `「${value}」已是其他食材的別名` : msg,
      });
      return;
    }
    setAliasDraft((d) => ({ ...d, [ingredientId]: '' }));
    toast.success(`已新增別名「${value}」`);
    const { data } = (await (supabase as never)
      .from('ingredient_aliases')
      .select('id, ingredient_id, alias')) as { data: AliasRow[] | null };
    setAliases(data ?? []);
  };

  const removeAlias = async (a: AliasRow) => {
    setAliases((prev) => prev.filter((x) => x.id !== a.id));
    const { error } = await (supabase as never).from('ingredient_aliases').delete().eq('id', a.id);
    if (error) {
      toast.error('刪除別名失敗', { description: (error as { message?: string }).message });
      setAliases((prev) => [...prev, a]);
    }
  };

  const addConversion = async (ingredientId: string) => {
    const draft = convDraft[ingredientId] ?? { from_unit: '', to_unit: '', factor: '' };
    const from = draft.from_unit.trim();
    const to = draft.to_unit.trim();
    const factor = Number(draft.factor);
    if (!from || !to || !draft.factor.trim() || Number.isNaN(factor) || factor <= 0) {
      toast.error('請填寫完整的換算資料', { description: '來源單位、目標單位與大於 0 的倍率' });
      return;
    }
    setBusy(true);
    const { error } = await (supabase as never)
      .from('unit_conversions')
      .insert({ ingredient_id: ingredientId, from_unit: from, to_unit: to, factor });
    setBusy(false);
    if (error) {
      toast.error('新增換算失敗', { description: (error as { message?: string }).message });
      return;
    }
    setConvDraft((d) => ({ ...d, [ingredientId]: { from_unit: '', to_unit: '', factor: '' } }));
    toast.success(`已新增換算 ${from} → ${to} ×${factor}`);
    const { data } = (await (supabase as never)
      .from('unit_conversions')
      .select('id, ingredient_id, from_unit, to_unit, factor')) as { data: ConversionRow[] | null };
    setConversions(data ?? []);
  };

  const removeConversion = async (c: ConversionRow) => {
    setConversions((prev) => prev.filter((x) => x.id !== c.id));
    const { error } = await (supabase as never).from('unit_conversions').delete().eq('id', c.id);
    if (error) {
      toast.error('刪除換算失敗', { description: (error as { message?: string }).message });
      setConversions((prev) => [...prev, c]);
    }
  };

  const submitQuickAlias = async () => {
    if (!quickAlias || !quickAlias.ingredientId) return;
    await addAlias(quickAlias.ingredientId, quickAlias.alias);
    setQuickAlias(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">食材主檔 (Ingredients)</h1>
        <Button
          onClick={() => openCreate()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          新增食材
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        規格標準化引擎的核心:一個食材一筆標準名稱,別名與單位換算讓不同供應商的品項可以被正確比價。
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* 主檔列表 */}
        <div className="xl:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="搜尋標準名稱 / 別名 / 分類…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-slate-200">
              <CardContent className="py-16 text-center text-slate-400">
                <Sprout className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>{ingredients.length === 0 ? '尚無食材主檔,點右上角「新增食材」開始建立' : '找不到符合的食材'}</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((i) => {
              const expanded = expandedId === i.id;
              const myAliases = aliasesByIngredient.get(i.id) ?? [];
              const myConversions = conversionsByIngredient.get(i.id) ?? [];
              const draft = convDraft[i.id] ?? { from_unit: '', to_unit: '', factor: '' };
              return (
                <Card key={i.id} className="border-slate-200 overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedId(expanded ? null : i.id)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{i.canonical_name}</span>
                        {i.category && (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                            {i.category}
                          </Badge>
                        )}
                        {i.base_unit && (
                          <span className="text-xs text-slate-500">基準單位 {i.base_unit}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Tags className="h-3 w-3" />
                          別名 {myAliases.length}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Ruler className="h-3 w-3" />
                          換算 {myConversions.length}
                        </span>
                        <span>產季 {seasonText(i.season_months)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-slate-700"
                        onClick={() => openEdit(i)}
                        aria-label="編輯"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(i)}
                        aria-label="刪除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 space-y-5">
                      {/* 別名管理 */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2 inline-flex items-center gap-1.5">
                          <Tags className="h-3.5 w-3.5" />
                          別名 (供應商可能這樣寫)
                        </p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {myAliases.length === 0 ? (
                            <span className="text-xs text-slate-400">尚無別名</span>
                          ) : (
                            myAliases.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 pl-2.5 pr-1 py-0.5 text-xs text-slate-700"
                              >
                                {a.alias}
                                <button
                                  type="button"
                                  onClick={() => removeAlias(a)}
                                  className="text-slate-300 hover:text-red-600 p-0.5"
                                  aria-label={`刪除別名 ${a.alias}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={aliasDraft[i.id] ?? ''}
                            onChange={(e) =>
                              setAliasDraft((d) => ({ ...d, [i.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addAlias(i.id);
                            }}
                            placeholder="例:甘藍、捲心菜"
                            className="h-9 bg-white max-w-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !(aliasDraft[i.id] ?? '').trim()}
                            onClick={() => addAlias(i.id)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            新增別名
                          </Button>
                        </div>
                      </div>

                      {/* 單位換算 */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2 inline-flex items-center gap-1.5">
                          <Ruler className="h-3.5 w-3.5" />
                          單位換算 (換算成基準單位才能比價)
                        </p>
                        <div className="space-y-1.5 mb-2">
                          {myConversions.length === 0 ? (
                            <span className="text-xs text-slate-400">尚無換算規則</span>
                          ) : (
                            myConversions.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-md px-3 py-1.5 max-w-sm"
                              >
                                <span className="text-slate-700">
                                  1 {c.from_unit} = {c.factor} {c.to_unit}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 ml-auto text-slate-300 hover:text-red-600"
                                  onClick={() => removeConversion(c)}
                                  aria-label="刪除換算"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={draft.from_unit}
                            onChange={(e) =>
                              setConvDraft((d) => ({
                                ...d,
                                [i.id]: { ...draft, from_unit: e.target.value },
                              }))
                            }
                            placeholder="箱"
                            className="h-9 w-24 bg-white"
                          />
                          <span className="text-slate-400 text-sm">→</span>
                          <Input
                            value={draft.to_unit}
                            onChange={(e) =>
                              setConvDraft((d) => ({
                                ...d,
                                [i.id]: { ...draft, to_unit: e.target.value },
                              }))
                            }
                            placeholder="台斤"
                            className="h-9 w-24 bg-white"
                          />
                          <span className="text-slate-400 text-sm">×</span>
                          <Input
                            type="number"
                            value={draft.factor}
                            onChange={(e) =>
                              setConvDraft((d) => ({
                                ...d,
                                [i.id]: { ...draft, factor: e.target.value },
                              }))
                            }
                            placeholder="10"
                            className="h-9 w-24 bg-white"
                          />
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => addConversion(i.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            新增換算
                          </Button>
                        </div>
                      </div>

                      {i.notes && (
                        <p className="text-xs text-slate-500 border-t border-slate-200 pt-3">
                          備註:{i.notes}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        {/* 右側:主檔覆蓋率 + 未對應品項 */}
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">主檔覆蓋率</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-bold text-slate-800">
                    {loading ? '—' : ingredients.length}
                  </div>
                  <div className="text-xs text-slate-500">主檔食材數</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">
                    {loading ? '—' : aliases.length}
                  </div>
                  <div className="text-xs text-slate-500">別名總數</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {loading ? '—' : coverage.matched}
                  </div>
                  <div className="text-xs text-slate-500">已對應品項</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">
                    {loading ? '—' : coverage.unmatchedCount}
                  </div>
                  <div className="text-xs text-slate-500">未對應品項</div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>供應商品項覆蓋率</span>
                  <span className="tabular-nums font-semibold text-slate-700">{coverage.rate}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(coverage.rate, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  共 {coverage.total} 筆 supplies 品項,以標準名稱與別名做包含比對
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-amber-700 inline-flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                未對應品項 Top 20
              </CardTitle>
              <p className="text-xs text-slate-500">
                這些供應商品項還吃不到主檔,補上主檔或別名就能進比價與媒合。
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : coverage.unmatched.length === 0 ? (
                <div className="py-8 text-center text-sm text-emerald-600">
                  全部品項都已對應到主檔,漂亮 🎉
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                  {coverage.unmatched.slice(0, 20).map((u) => (
                    <div
                      key={u.key}
                      className="flex items-center gap-2 rounded-md border border-slate-100 bg-white px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate">{u.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {u.count} 筆品項
                          {u.supplierCount > 0 && ` · ${u.supplierCount} 家供應商`}
                          {u.category && ` · ${u.category}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          title="建立為新主檔食材"
                          aria-label="建立為新主檔食材"
                          onClick={() => openCreate(u.name)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          title="設為既有食材的別名"
                          aria-label="設為既有食材的別名"
                          disabled={ingredients.length === 0}
                          onClick={() => setQuickAlias({ alias: u.name, ingredientId: '' })}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 新增 / 編輯食材 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? '編輯食材' : '新增食材'}</DialogTitle>
            <DialogDescription>標準名稱是全平台比價與媒合的唯一依據,請填寫最通用的說法。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">標準名稱 *</label>
              <Input
                value={form.canonical_name}
                onChange={(e) => setForm((f) => ({ ...f, canonical_name: e.target.value }))}
                placeholder="例:高麗菜"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">分類</label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="蔬菜 / 肉類 / 海鮮…"
                />
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1 block">基準單位</label>
                <Input
                  value={form.base_unit}
                  onChange={(e) => setForm((f) => ({ ...f, base_unit: e.target.value }))}
                  placeholder="台斤 / kg / 顆"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">
                產季月份 <span className="text-slate-400">(不選 = 全年)</span>
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {MONTHS.map((m) => {
                  const on = form.season_months.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className={`h-8 rounded-md border text-xs transition-colors ${
                        on
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                      }`}
                    >
                      {m}月
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">備註</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="產地、等級差異、常見規格…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.canonical_name.trim() || saving}
              onClick={handleSave}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 未對應品項 → 掛到既有食材當別名 */}
      <Dialog open={!!quickAlias} onOpenChange={(o) => { if (!o) setQuickAlias(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>設為既有食材的別名</DialogTitle>
            <DialogDescription>
              把「{quickAlias?.alias}」掛到主檔食材底下,之後這個寫法就能自動對應。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">別名</label>
              <Input
                value={quickAlias?.alias ?? ''}
                onChange={(e) =>
                  setQuickAlias((q) => (q ? { ...q, alias: e.target.value } : q))
                }
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">對應到主檔食材 *</label>
              <Select
                value={quickAlias?.ingredientId ?? ''}
                onValueChange={(v) => setQuickAlias((q) => (q ? { ...q, ingredientId: v } : q))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇食材…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ingredients.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.canonical_name}
                      {i.category ? ` (${i.category})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAlias(null)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={busy || !quickAlias?.ingredientId || !quickAlias?.alias.trim()}
              onClick={submitQuickAlias}
            >
              加入別名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              確定刪除「{deleteTarget?.canonical_name}」?
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原,該食材的別名、單位換算與替代關係也會一併失效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminIngredientsPage;
