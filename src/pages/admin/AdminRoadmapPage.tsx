import { useEffect, useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  BLOCKS,
  PHASES,
  STATUS_META,
  type RoadmapBlock,
  type RoadmapFeature,
  type RoadmapStatus,
} from '@/components/investors/roadmap-config';

const statusBadgeClass: Record<RoadmapStatus, string> = {
  done: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  in_progress: 'bg-amber-100 text-amber-800 border-amber-300',
  planned: 'bg-slate-100 text-slate-600 border-slate-300',
};

interface FormState {
  id: string | null;
  title: string;
  description: string;
  block: RoadmapBlock;
  phase: number;
  status: RoadmapStatus;
}

const emptyForm: FormState = {
  id: null,
  title: '',
  description: '',
  block: 'ai_matching',
  phase: 1,
  status: 'planned',
};

const AdminRoadmapPage = () => {
  const { toast } = useToast();
  const [features, setFeatures] = useState<RoadmapFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFeatures = async () => {
    const { data } = (await (supabase as never)
      .from('roadmap_features')
      .select('*')
      .order('sort_order', { ascending: true })) as { data: RoadmapFeature[] | null };
    setFeatures(data ?? []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchFeatures();
      setLoading(false);
    })();
  }, []);

  const updateField = async (id: string, patch: Partial<RoadmapFeature>) => {
    const prev = features;
    setFeatures((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const { error } = await (supabase as never)
      .from('roadmap_features')
      .update(patch)
      .eq('id', id);
    if (error) {
      setFeatures(prev);
      toast({
        title: '更新失敗',
        description: (error as { message?: string }).message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: '已更新,投資人頁面即時生效' });
  };

  const openCreate = () => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (f: RoadmapFeature) => {
    setForm({
      id: f.id,
      title: f.title,
      description: f.description ?? '',
      block: f.block,
      phase: f.phase,
      status: f.status,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);

    if (form.id) {
      const { error } = await (supabase as never)
        .from('roadmap_features')
        .update({
          title: form.title.trim(),
          description: form.description.trim() || null,
          block: form.block,
          phase: form.phase,
          status: form.status,
        })
        .eq('id', form.id);
      setSaving(false);
      if (error) {
        toast({ title: '儲存失敗', description: (error as { message?: string }).message, variant: 'destructive' });
        return;
      }
    } else {
      const maxSort = features
        .filter((f) => f.block === form.block)
        .reduce((m, f) => Math.max(m, f.sort_order), 0);
      const { error } = await (supabase as never).from('roadmap_features').insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        block: form.block,
        phase: form.phase,
        status: form.status,
        sort_order: maxSort + 1,
      });
      setSaving(false);
      if (error) {
        toast({ title: '新增失敗', description: (error as { message?: string }).message, variant: 'destructive' });
        return;
      }
    }

    setFormOpen(false);
    toast({ title: form.id ? '已儲存' : '已新增功能' });
    await fetchFeatures();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleting(true);
    const { error } = await (supabase as never)
      .from('roadmap_features')
      .delete()
      .eq('id', id);
    setDeleting(false);
    setDeleteId(null);
    if (error) {
      toast({ title: '刪除失敗', description: (error as { message?: string }).message, variant: 'destructive' });
      return;
    }
    setFeatures((fs) => fs.filter((f) => f.id !== id));
    toast({ title: '已刪除' });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-slate-800">發展藍圖 (Roadmap)</h1>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4 mr-1.5" />
          新增功能
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-2.5 mb-6">
        <span>此頁內容即時顯示於投資人頁面</span>
        <a
          href="/investors"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-emerald-600"
        >
          /investors
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {BLOCKS.map((block) => {
            const rows = features
              .filter((f) => f.block === block.key)
              .sort((a, b) => a.sort_order - b.sort_order);
            const done = rows.filter((f) => f.status === 'done').length;

            return (
              <div key={block.key} className="rounded-md border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-800">
                    {block.title} <span className="text-slate-400 font-normal text-sm">{block.subtitle}</span>
                  </h2>
                  <Badge variant="outline" className="bg-white text-slate-600 tabular-nums">
                    {done}/{rows.length} 完成
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-slate-600 w-20">排序</TableHead>
                      <TableHead className="text-slate-600">功能</TableHead>
                      <TableHead className="text-slate-600 w-24">階段</TableHead>
                      <TableHead className="text-slate-600 w-36">狀態</TableHead>
                      <TableHead className="text-slate-600 w-24 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                          尚無功能項目
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell>
                            <Input
                              type="number"
                              defaultValue={f.sort_order}
                              className="h-8 w-16"
                              onBlur={(e) => {
                                const v = Number.parseInt(e.target.value, 10);
                                if (!Number.isNaN(v) && v !== f.sort_order) {
                                  updateField(f.id, { sort_order: v });
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-slate-800">{f.title}</p>
                            {f.description && (
                              <p className="text-xs text-slate-500 truncate max-w-md">{f.description}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-slate-50 text-slate-600">
                              Phase {f.phase}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={f.status}
                              onValueChange={(v) => updateField(f.id, { status: v as RoadmapStatus })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue>
                                  <Badge variant="outline" className={statusBadgeClass[f.status]}>
                                    {STATUS_META[f.status].label}
                                  </Badge>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(STATUS_META) as RoadmapStatus[]).map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {STATUS_META[s].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-slate-700"
                              onClick={() => openEdit(f)}
                              aria-label="編輯"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setDeleteId(f.id)}
                              aria-label="刪除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? '編輯功能' : '新增功能'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-slate-600 mb-1.5 block">功能名稱 *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例:多供應商比價引擎"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1.5 block">說明</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="一句話說明這個功能(投資人頁點擊方塊時顯示)"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-slate-600 mb-1.5 block">區塊</label>
                <Select
                  value={form.block}
                  onValueChange={(v) => setForm((f) => ({ ...f, block: v as RoadmapBlock }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOCKS.map((b) => (
                      <SelectItem key={b.key} value={b.key}>
                        {b.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1.5 block">階段</label>
                <Select
                  value={String(form.phase)}
                  onValueChange={(v) => setForm((f) => ({ ...f, phase: Number.parseInt(v, 10) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHASES.map((p) => (
                      <SelectItem key={p.phase} value={String(p.phase)}>
                        Phase {p.phase}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-slate-600 mb-1.5 block">狀態</label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as RoadmapStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_META) as RoadmapStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.title.trim() || saving}
              onClick={handleSave}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除這個功能項目?</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原,投資人頁面將立即移除此方塊。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? '刪除中…' : '確定刪除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminRoadmapPage;
