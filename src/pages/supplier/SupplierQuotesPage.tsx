import { useEffect, useState } from 'react';
import { Loader2, FileText, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface IngredientItem {
  name?: string;
  quantity?: number | string;
  unit?: string;
}

interface SupplierOrder {
  id: string;
  created_at: string;
  status: string | null;
  ingredient_list: IngredientItem[] | null;
}

interface OrderQuote {
  id: string;
  order_id: string;
  supplier_id: string;
  total_amount: number | null;
  note: string | null;
  valid_until: string | null;
  status: string | null;
  created_at: string;
}

interface QuoteForm {
  orderId: string | null;
  totalAmount: string;
  note: string;
  validUntil: string;
}

const emptyForm: QuoteForm = {
  orderId: null,
  totalAmount: '',
  note: '',
  validUntil: '',
};

const statusMeta: Record<string, { label: string; className: string }> = {
  quoted: { label: '已報價', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  accepted: { label: '已接受', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  rejected: { label: '已婉拒', className: 'bg-rose-100 text-rose-700 hover:bg-rose-100' },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function ingredientSummary(list: IngredientItem[] | null): string {
  if (!list || list.length === 0) return '（無明細）';
  return list
    .map((i) => (i?.name ? String(i.name).trim() : ''))
    .filter(Boolean)
    .join('、');
}

export default function SupplierQuotesPage() {
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [quotes, setQuotes] = useState<OrderQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<QuoteForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchQuotes = async (sid: string) => {
    const { data } = (await (supabase as never)
      .from('order_quotes')
      .select('*')
      .eq('supplier_id', sid)
      .order('created_at', { ascending: false })) as { data: OrderQuote[] | null };
    setQuotes(data ?? []);
  };

  const fetchOrders = async (sid: string) => {
    const { data } = (await (supabase as never)
      .from('supplier_orders')
      .select('id, created_at, status, ingredient_list')
      .eq('supplier_id', sid)
      .order('created_at', { ascending: false })) as { data: SupplierOrder[] | null };
    setOrders(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: acct } = await (supabase as never)
        .from('supplier_accounts')
        .select('supplier_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle() as { data: { supplier_id: string } | null };
      if (acct?.supplier_id) {
        setSupplierId(acct.supplier_id);
        await Promise.all([fetchOrders(acct.supplier_id), fetchQuotes(acct.supplier_id)]);
      }
      setLoading(false);
    })();
  }, []);

  // Latest quote for a given order (quotes are already ordered newest-first).
  const quoteForOrder = (orderId: string): OrderQuote | undefined =>
    quotes.find((q) => q.order_id === orderId);

  const openQuote = (order: SupplierOrder) => {
    const existing = quoteForOrder(order.id);
    setForm({
      orderId: order.id,
      totalAmount: existing?.total_amount != null ? String(existing.total_amount) : '',
      note: existing?.note ?? '',
      validUntil: existing?.valid_until ?? '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.orderId || !supplierId) return;
    const amount = Number(form.totalAmount);
    if (!form.totalAmount.trim() || Number.isNaN(amount) || amount <= 0) {
      toast({ title: '請輸入有效的報價金額', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      order_id: form.orderId,
      supplier_id: supplierId,
      total_amount: amount,
      note: form.note.trim() || null,
      valid_until: form.validUntil.trim() || null,
      status: 'quoted',
    };
    const { error } = await (supabase as never).from('order_quotes').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: '報價送出失敗', description: (error as { message?: string }).message, variant: 'destructive' });
      return;
    }
    setFormOpen(false);
    toast({ title: '報價已送出' });
    await fetchQuotes(supplierId);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">線上報價</h1>
      <p className="text-sm text-gray-500 mb-6">Quote Requests · 檢視買家需求並回覆您的報價</p>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>
      ) : !supplierId ? (
        <div className="text-center py-20 text-gray-400">此帳號尚未綁定供應商</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
          <p>目前沒有需要報價的需求單</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600 whitespace-nowrap">建立時間</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">需求食材摘要</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600 whitespace-nowrap">報價狀態</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600 w-40 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const quote = quoteForOrder(order.id);
                  const meta = quote?.status ? statusMeta[quote.status] : undefined;
                  return (
                    <tr key={order.id} className="border-b border-gray-100 last:border-0 align-top hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(order.created_at)}</td>
                      <td className="px-5 py-3 text-gray-800">
                        <p className="max-w-md">{ingredientSummary(order.ingredient_list)}</p>
                        {order.ingredient_list && order.ingredient_list.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">共 {order.ingredient_list.length} 項</p>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {quote ? (
                          <div className="space-y-1">
                            <Badge className={meta?.className ?? 'bg-slate-100 text-slate-700 hover:bg-slate-100'}>
                              {meta?.label ?? quote.status ?? '已報價'}
                            </Badge>
                            {quote.total_amount != null && (
                              <p className="text-gray-800 font-medium tabular-nums">${quote.total_amount.toLocaleString()}</p>
                            )}
                          </div>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">待報價</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {quote ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => openQuote(order)}
                          >
                            已報價 ${quote.total_amount != null ? quote.total_amount.toLocaleString() : '—'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => openQuote(order)}
                          >
                            <FileText size={15} className="mr-1.5" />回覆報價
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>回覆報價</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">總報價金額 (TWD) *</label>
              <Input
                type="number"
                min="0"
                value={form.totalAmount}
                onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                placeholder="例:12800"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">有效日期</label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">備註</label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                placeholder="交期、付款條件、替代品項說明…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.totalAmount.trim() || saving}
              onClick={handleSubmit}
            >
              {saving ? '送出中…' : '送出報價'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
