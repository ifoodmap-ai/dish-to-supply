import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Ingredient {
  name?: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

interface Order {
  id: string;
  created_at: string;
  status: string;
  sent_at: string | null;
  supplier_id: string | null;
  analysis_id: string | null;
  ingredient_list: Ingredient[] | null;
  notes: string | null;
}

const statusBadgeClass: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  sent: 'bg-blue-100 text-blue-800 border-blue-300',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  shipped: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
};

const statusLabel: Record<string, string> = {
  pending: '待處理',
  sent: '已發送',
  accepted: '已接受',
  shipped: '已出貨',
  completed: '已完成',
  rejected: '已拒絕',
};

const STATUS_OPTIONS = ['pending', 'sent', 'accepted', 'shipped', 'completed', 'rejected'];

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2">
    <span className="text-slate-500 w-28 shrink-0">{label}</span>
    <span className="text-slate-800">{value}</span>
  </div>
);

const AdminOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<{
    company_name: string | null;
    contact_phone: string | null;
    contact_line: string | null;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!order) return;
    setDeleting(true);
    const { error } = await (supabase as never)
      .from('supplier_orders')
      .delete()
      .eq('id', order.id);
    setDeleting(false);
    setDeleteOpen(false);
    if (error) {
      toast({
        title: '刪除失敗 (Delete failed)',
        description: (error as { message?: string }).message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: '已刪除 (Deleted)' });
    navigate('/admin/orders');
  };

  const fetchOrder = async () => {
    const { data } = await (supabase as never)
      .from('supplier_orders')
      .select('*')
      .eq('id', id)
      .single();
    const o = data as Order | null;
    setOrder(o);
    if (o) {
      setStatus(o.status);
      setNotes(o.notes ?? '');
      if (o.supplier_id) {
        const { data: s } = (await (supabase as never)
          .from('suppliers')
          .select('name')
          .eq('id', o.supplier_id)
          .single()) as { data: { name: string } | null };
        setSupplierName(s?.name ?? '');
      }
      if (o.analysis_id) {
        const { data: a } = (await (supabase as never)
          .from('analysis_records')
          .select('summary')
          .eq('id', o.analysis_id)
          .single()) as { data: { summary: string | null } | null };
        setAnalysisSummary(a?.summary ?? null);

        const { data: leads } = (await (supabase as never)
          .from('landing_leads')
          .select('company_name, contact_phone, contact_line')
          .eq('analysis_id', o.analysis_id)
          .order('created_at', { ascending: false })
          .limit(1)) as {
          data: { company_name: string | null; contact_phone: string | null; contact_line: string | null }[] | null;
        };
        setBuyer((leads && leads[0]) ?? null);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchOrder();
      setLoading(false);
    };
    init();
  }, [id]);

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    const patch: Record<string, unknown> = {
      status,
      notes,
      updated_at: new Date().toISOString(),
    };
    if (status === 'sent' && !order.sent_at) patch.sent_at = new Date().toISOString();

    const { error } = await (supabase as never)
      .from('supplier_orders')
      .update(patch)
      .eq('id', order.id);

    setSaving(false);
    if (error) {
      toast({
        title: '更新失敗 (Update failed)',
        description: (error as { message?: string }).message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: '已更新 (Saved)' });
    fetchOrder();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!order) {
    return <div className="text-center py-20 text-slate-500">找不到訂單 (Order not found)</div>;
  }

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/admin/orders')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回訂單列表 (Back)
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">訂單詳情 (Order Detail)</h1>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={statusBadgeClass[order.status] ?? 'bg-slate-100 text-slate-700 border-slate-300'}
          >
            {statusLabel[order.status] ?? order.status}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            刪除
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-slate-700">基本資訊 (Basic Info)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="建立時間" value={new Date(order.created_at).toLocaleString('zh-TW')} />
            <InfoRow label="供應商" value={supplierName || '未指定'} />
            <InfoRow
              label="發送時間"
              value={order.sent_at ? new Date(order.sent_at).toLocaleString('zh-TW') : '—'}
            />
          </CardContent>
        </Card>

        {buyer && (
          <Card className="border-emerald-200">
            <CardHeader>
              <CardTitle className="text-base text-emerald-700">買方聯絡資訊 (Buyer Contact)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="姓名 / 名稱" value={buyer.company_name || '—'} />
              <InfoRow label="聯絡電話" value={buyer.contact_phone || '—'} />
              <InfoRow label="LINE ID" value={buyer.contact_line || '—'} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-slate-700">食材清單 (Ingredients)</CardTitle>
          </CardHeader>
          <CardContent>
            {order.ingredient_list && order.ingredient_list.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-slate-600">品項</TableHead>
                    <TableHead className="text-slate-600">數量</TableHead>
                    <TableHead className="text-slate-600">單位</TableHead>
                    <TableHead className="text-slate-600">分類</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.ingredient_list.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-slate-800">{it.name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{it.quantity || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600">{it.unit || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600">{it.category || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-slate-400 italic">無食材清單</p>
            )}
          </CardContent>
        </Card>

        {order.analysis_id && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-slate-700">對應分析來源 (Source Analysis)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {analysisSummary ?? <span className="italic text-slate-400">無摘要</span>}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/analyses/${order.analysis_id}`)}
              >
                查看分析紀錄 →
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-slate-700">更新狀態 (Update Status)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="選擇狀態…" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="備註 (notes)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '儲存 (Save)'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除這筆訂單？</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原，訂單將永久刪除。</AlertDialogDescription>
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

export default AdminOrderDetailPage;
