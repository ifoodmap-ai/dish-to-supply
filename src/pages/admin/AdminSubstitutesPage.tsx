import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Search,
  Shuffle,
  ArrowRight,
  Repeat,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
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

interface SubstituteRow {
  id: string;
  ingredient_id: string;
  substitute_id: string;
  similarity: number | null;
  note: string | null;
  created_at: string;
}

interface IngredientLite {
  id: string;
  canonical_name: string;
  category: string | null;
}

interface FormState {
  ingredient_id: string;
  substitute_id: string;
  similarity: number;
  note: string;
  bidirectional: boolean;
}

const emptyForm: FormState = {
  ingredient_id: '',
  substitute_id: '',
  similarity: 0.8,
  note: '',
  bidirectional: true,
};

const similarityStyle = (v: number | null): string => {
  const s = v ?? 0;
  if (s >= 0.85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s >= 0.7) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const similarityText = (v: number | null): string =>
  v == null ? '未評分' : `${Math.round(v * 100)}%`;

const AdminSubstitutesPage = () => {
  const [rows, setRows] = useState<SubstituteRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubstituteRow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [subRes, ingRes] = await Promise.all([
      (supabase as never)
        .from('ingredient_substitutes')
        .select('id, ingredient_id, substitute_id, similarity, note, created_at')
        .order('created_at', { ascending: false }),
      (supabase as never)
        .from('ingredients')
        .select('id, canonical_name, category')
        .order('canonical_name', { ascending: true }),
    ]);

    const err = (subRes as { error: { message?: string } | null }).error;
    if (err) toast.error('載入替代關係失敗', { description: err.message });

    setRows(((subRes as { data: SubstituteRow[] | null }).data) ?? []);
    setIngredients(((ingRes as { data: IngredientLite[] | null }).data) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const ingredientMap = useMemo(() => {
    const map = new Map<string, IngredientLite>();
    ingredients.forEach((i) => map.set(i.id, i));
    return map;
  }, [ingredients]);

  const nameOf = useCallback(
    (id: string) => ingredientMap.get(id)?.canonical_name ?? '（已刪除的食材）',
    [ingredientMap],
  );

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, SubstituteRow[]>();
    rows.forEach((r) => {
      if (q) {
        const hay = `${nameOf(r.ingredient_id)} ${nameOf(r.substitute_id)} ${r.note ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return;
      }
      const list = map.get(r.ingredient_id) ?? [];
      list.push(r);
      map.set(r.ingredient_id, list);
    });
    return [...map.entries()]
      .map(([ingredientId, list]) => ({
        ingredientId,
        name: nameOf(ingredientId),
        category: ingredientMap.get(ingredientId)?.category ?? null,
        items: list.slice().sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search, nameOf, ingredientMap]);

  const stats = useMemo(() => {
    const covered = new Set<string>();
    let sum = 0;
    let scored = 0;
    rows.forEach((r) => {
      covered.add(r.ingredient_id);
      covered.add(r.substitute_id);
      if (r.similarity != null) {
        sum += r.similarity;
        scored += 1;
      }
    });
    return {
      total: rows.length,
      covered: covered.size,
      avg: scored > 0 ? Math.round((sum / scored) * 100) : 0,
    };
  }, [rows]);

  const openCreate = (prefillIngredientId?: string) => {
    setForm({ ...emptyForm, ingredient_id: prefillIngredientId ?? '' });
    setFormOpen(true);
  };

  const duplicateExists = useMemo(() => {
    if (!form.ingredient_id || !form.substitute_id) return false;
    return rows.some(
      (r) => r.ingredient_id === form.ingredient_id && r.substitute_id === form.substitute_id,
    );
  }, [rows, form.ingredient_id, form.substitute_id]);

  const handleSave = async () => {
    if (!form.ingredient_id || !form.substitute_id) return;
    if (form.ingredient_id === form.substitute_id) {
      toast.error('不能把食材設為自己的替代品');
      return;
    }
    if (duplicateExists) {
      toast.error('這組替代關係已經存在');
      return;
    }
    setSaving(true);
    const payload = [
      {
        ingredient_id: form.ingredient_id,
        substitute_id: form.substitute_id,
        similarity: form.similarity,
        note: form.note.trim() || null,
      },
    ];
    if (form.bidirectional) {
      const reverseExists = rows.some(
        (r) => r.ingredient_id === form.substitute_id && r.substitute_id === form.ingredient_id,
      );
      if (!reverseExists) {
        payload.push({
          ingredient_id: form.substitute_id,
          substitute_id: form.ingredient_id,
          similarity: form.similarity,
          note: form.note.trim() || null,
        });
      }
    }
    const { error } = await (supabase as never).from('ingredient_substitutes').insert(payload);
    setSaving(false);
    if (error) {
      toast.error('儲存失敗', { description: (error as { message?: string }).message });
      return;
    }
    setFormOpen(false);
    toast.success('已建立替代關係', {
      description: form.bidirectional ? '同時建立了反向關係' : undefined,
    });
    await fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setRows((prev) => prev.filter((x) => x.id !== target.id));
    const { error } = await (supabase as never)
      .from('ingredient_substitutes')
      .delete()
      .eq('id', target.id);
    if (error) {
      toast.error('刪除失敗', { description: (error as { message?: string }).message });
      setRows((prev) => [...prev, target]);
      return;
    }
    toast.success('已刪除替代關係');
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">替代食材 (Substitutes)</h1>
        <Button
          onClick={() => openCreate()}
          disabled={ingredients.length < 2}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          新增替代關係
        </Button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        缺貨或價格暴衝時,系統會依相似度推薦可替換的食材;相似度越高代表口感與用途越接近。
      </p>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: '替代關係數', value: stats.total, accent: 'text-slate-800' },
          { label: '涵蓋食材數', value: stats.covered, accent: 'text-emerald-600' },
          { label: '平均相似度', value: `${stats.avg}%`, accent: 'text-blue-600' },
        ].map((k) => (
          <Card key={k.label} className="border-slate-200">
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${k.accent}`}>{loading ? '—' : k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative mb-4 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="搜尋食材名稱 / 備註…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : ingredients.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <Shuffle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>請先到「食材主檔」建立食材,才能設定替代關係</p>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <Shuffle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>
              {rows.length === 0
                ? '尚無替代關係,點右上角「新增替代關係」開始建立'
                : '找不到符合的替代關係'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {groups.map((g) => (
            <Card key={g.ingredientId} className="border-slate-200">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-base text-slate-800 truncate">{g.name}</CardTitle>
                  {g.category && (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 shrink-0">
                      {g.category}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-emerald-600 shrink-0"
                  onClick={() => openCreate(g.ingredientId)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  加一組
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.items.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2"
                  >
                    <ArrowRight className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {nameOf(r.substitute_id)}
                        </span>
                        <Badge variant="outline" className={similarityStyle(r.similarity)}>
                          相似度 {similarityText(r.similarity)}
                        </Badge>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-[180px]">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.round((r.similarity ?? 0) * 100)}%` }}
                        />
                      </div>
                      {r.note && <p className="text-xs text-slate-500 mt-1.5">{r.note}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-slate-300 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(r)}
                      aria-label="刪除替代關係"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新增替代關係 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新增替代關係</DialogTitle>
            <DialogDescription>
              當「原食材」缺貨或漲價時,系統可以推薦「替代食材」。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1 block">原食材 *</label>
                <Select
                  value={form.ingredient_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, ingredient_id: v }))}
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
              <div>
                <label className="text-sm text-slate-600 mb-1 block">替代食材 *</label>
                <Select
                  value={form.substitute_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, substitute_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇食材…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ingredients
                      .filter((i) => i.id !== form.ingredient_id)
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.canonical_name}
                          {i.category ? ` (${i.category})` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-slate-600">相似度</label>
                <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                  {Math.round(form.similarity * 100)}%
                </span>
              </div>
              <Slider
                value={[form.similarity]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(v) => setForm((f) => ({ ...f, similarity: v[0] }))}
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>0% 勉強能換</span>
                <span>100% 幾乎等價</span>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-600 mb-1 block">備註</label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={2}
                placeholder="例:口感較脆,燉煮類可直接替換,生食建議不換"
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={form.bidirectional}
                onCheckedChange={(v) => setForm((f) => ({ ...f, bidirectional: v === true }))}
                className="mt-0.5"
              />
              <span className="text-sm text-slate-600">
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <Repeat className="h-3.5 w-3.5" />
                  同時建立反向關係
                </span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  兩邊互為替代品,推薦時雙向都吃得到
                </span>
              </span>
            </label>

            {duplicateExists && (
              <p className="text-xs text-amber-600">這組替代關係已經存在,請換一組。</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={
                saving ||
                !form.ingredient_id ||
                !form.substitute_id ||
                form.ingredient_id === form.substitute_id ||
                duplicateExists
              }
              onClick={handleSave}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {saving ? '儲存中…' : '建立'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除這組替代關係?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${nameOf(deleteTarget.ingredient_id)} → ${nameOf(deleteTarget.substitute_id)},此操作無法復原。`
                : '此操作無法復原。'}
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

export default AdminSubstitutesPage;
