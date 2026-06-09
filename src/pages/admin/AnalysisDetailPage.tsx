import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AnalysisRecord {
  id: string;
  created_at: string;
  source_type: string;
  summary: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  ingredient_list: string[] | null;
  admin_notes: string | null;
  reviewed_at: string | null;
}

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
}

const statusBadgeClass: Record<AnalysisRecord['status'], string> = {
  pending_review: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved: 'bg-blue-100 text-blue-800 border-blue-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
  sent: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const statusLabel: Record<AnalysisRecord['status'], string> = {
  pending_review: '待審核',
  approved: '已批准',
  rejected: '已拒絕',
  sent: '已發送',
};

const AnalysisDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Approve dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [approving, setApproving] = useState(false);

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fetchRecord = async () => {
    const { data } = await (supabase as never)
      .from('analysis_records')
      .select('*')
      .eq('id', id)
      .single();
    setRecord(data as AnalysisRecord | null);
  };

  const fetchSuppliers = async () => {
    const { data } = await (supabase as never)
      .from('suppliers')
      .select('id, name, contact_email, contact_phone');
    setSuppliers((data as Supplier[] | null) ?? []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchRecord(), fetchSuppliers()]);
      setLoading(false);
    };
    init();
  }, [id]);

  const handleApprove = async () => {
    if (!record || !selectedSupplier) return;
    setApproving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    await (supabase as never)
      .from('supplier_orders')
      .insert({
        analysis_id: record.id,
        supplier_id: selectedSupplier,
        ingredient_list: record.ingredient_list,
        status: 'pending',
      });

    await (supabase as never)
      .from('analysis_records')
      .update({
        status: 'sent',
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUserId,
      })
      .eq('id', record.id);

    await fetchRecord();
    setApproving(false);
    setApproveOpen(false);
    setSelectedSupplier('');
    toast({ title: '已審核並發送訂單 (Approved and order sent)' });
  };

  const handleReject = async () => {
    if (!record) return;
    setRejecting(true);

    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;

    await (supabase as never)
      .from('analysis_records')
      .update({
        status: 'rejected',
        admin_notes: rejectReason,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUserId,
      })
      .eq('id', record.id);

    await fetchRecord();
    setRejecting(false);
    setRejectOpen(false);
    setRejectReason('');
    toast({ title: '已拒絕 (Rejected)' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center py-20 text-slate-500">
        找不到紀錄 (Record not found)
      </div>
    );
  }

  const isPending = record.status === 'pending_review';

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/admin/analyses')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回列表 (Back to list)
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">分析詳情 (Analysis Detail)</h1>
        <Badge variant="outline" className={statusBadgeClass[record.status]}>
          {statusLabel[record.status]}
        </Badge>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-slate-700">基本資訊 (Basic Info)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-500 w-28 shrink-0">建立時間</span>
              <span className="text-slate-800">{new Date(record.created_at).toLocaleString('zh-TW')}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-500 w-28 shrink-0">來源類型</span>
              <span className="text-slate-800">{record.source_type}</span>
            </div>
            {record.reviewed_at && (
              <div className="flex gap-2">
                <span className="text-slate-500 w-28 shrink-0">審核時間</span>
                <span className="text-slate-800">{new Date(record.reviewed_at).toLocaleString('zh-TW')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-slate-700">摘要 (Summary)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {record.summary ?? <span className="italic text-slate-400">無摘要 (No summary)</span>}
            </p>
          </CardContent>
        </Card>

        {record.ingredient_list && record.ingredient_list.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-slate-700">食材列表 (Ingredient List)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {record.ingredient_list.map((item, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 text-xs rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {record.admin_notes && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-base text-red-700">拒絕原因 (Rejection Notes)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{record.admin_notes}</p>
            </CardContent>
          </Card>
        )}

        {isPending && (
          <div className="flex gap-3 pt-2">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setApproveOpen(true)}
            >
              批准並發送 (Approve &amp; Send)
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejectOpen(true)}
            >
              拒絕 (Reject)
            </Button>
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選擇供應商 (Select Supplier)</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger>
                <SelectValue placeholder="選擇供應商…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.contact_email ? ` — ${s.contact_email}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>取消</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!selectedSupplier || approving}
              onClick={handleApprove}
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : '確認發送'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒絕原因 (Rejection Reason)</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="請輸入拒絕原因…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              disabled={rejecting}
              onClick={handleReject}
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : '確認拒絕'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AnalysisDetailPage;
