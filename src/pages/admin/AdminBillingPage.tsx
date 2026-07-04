import { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Clock,
  Receipt,
  CreditCard,
  Landmark,
  Store,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// ---------- Types ----------
interface OrderRow {
  id: string;
  created_at: string;
  status: string;
  supplier_id: string | null;
}

interface PaymentRow {
  id: string;
  order_id: string | null;
  amount: number | null;
  method: string | null;
  status: string | null;
  transaction_no: string | null;
  paid_at: string | null;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  order_id: string | null;
  invoice_number: string | null;
  buyer_name: string | null;
  amount: number | null;
  tax_amount: number | null;
  status: string | null;
  issued_at: string | null;
  created_at: string;
}

// ---------- Constants ----------
const METHOD_LABEL: Record<string, string> = {
  credit_card: '信用卡',
  atm: 'ATM 轉帳',
  cvs: '超商代收',
};

const METHOD_ICON: Record<string, typeof CreditCard> = {
  credit_card: CreditCard,
  atm: Landmark,
  cvs: Store,
};

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: '已收款', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  pending: { label: '待收款', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  failed: { label: '失敗', cls: 'bg-red-100 text-red-800 border-red-300' },
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  issued: { label: '已開立', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  void: { label: '已作廢', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const fmtMoney = (n: number | null | undefined) =>
  `NT$ ${Number(n ?? 0).toLocaleString('zh-TW')}`;

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('zh-TW') : '—';

const orderLabel = (id: string | null | undefined) =>
  id ? `#${id.slice(0, 8)}` : '—';

const pad4 = () => String(Math.floor(1000 + Math.random() * 9000));
const yyyymmdd = () => {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  );
};

const AdminBillingPage = () => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  // 模擬收款 dialog
  const [payOpen, setPayOpen] = useState(false);
  const [paySaving, setPaySaving] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('credit_card');
  const [payAmount, setPayAmount] = useState<string>('');

  // 開立發票 dialog
  const [invOpen, setInvOpen] = useState(false);
  const [invSaving, setInvSaving] = useState(false);
  const [invOrderId, setInvOrderId] = useState<string>('');
  const [invBuyer, setInvBuyer] = useState<string>('');
  const [invAmount, setInvAmount] = useState<string>('');

  const loadAll = async () => {
    const [oRes, pRes, iRes] = await Promise.all([
      (supabase as never)
        .from('supplier_orders')
        .select('id, created_at, status, supplier_id')
        .order('created_at', { ascending: false }),
      (supabase as never)
        .from('order_payments')
        .select('id, order_id, amount, method, status, transaction_no, paid_at, created_at')
        .order('created_at', { ascending: false }),
      (supabase as never)
        .from('invoices')
        .select('id, order_id, invoice_number, buyer_name, amount, tax_amount, status, issued_at, created_at')
        .order('created_at', { ascending: false }),
    ]);
    setOrders(((oRes as { data: OrderRow[] | null }).data) ?? []);
    setPayments(((pRes as { data: PaymentRow[] | null }).data) ?? []);
    setInvoices(((iRes as { data: InvoiceRow[] | null }).data) ?? []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
  }, []);

  // 已付款的 order id 集合
  const paidOrderIds = useMemo(() => {
    const s = new Set<string>();
    payments.forEach((p) => {
      if (p.status === 'paid' && p.order_id) s.add(p.order_id);
    });
    return s;
  }, [payments]);

  // 尚未有已付款紀錄的訂單(可模擬收款)
  const unpaidOrders = useMemo(
    () => orders.filter((o) => !paidOrderIds.has(o.id)),
    [orders, paidOrderIds],
  );

  // 已開發票的 order id 集合
  const invoicedOrderIds = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((i) => {
      if (i.status === 'issued' && i.order_id) s.add(i.order_id);
    });
    return s;
  }, [invoices]);

  // 已付款但尚未開發票的訂單(可開立發票)
  const invoicableOrders = useMemo(
    () => orders.filter((o) => paidOrderIds.has(o.id) && !invoicedOrderIds.has(o.id)),
    [orders, paidOrderIds, invoicedOrderIds],
  );

  const orderById = useMemo(() => {
    const m: Record<string, OrderRow> = {};
    orders.forEach((o) => { m[o.id] = o; });
    return m;
  }, [orders]);

  // 已付款金額對照(供發票對帳)
  const paidAmountByOrder = useMemo(() => {
    const m: Record<string, number> = {};
    payments.forEach((p) => {
      if (p.status === 'paid' && p.order_id) {
        m[p.order_id] = (m[p.order_id] ?? 0) + Number(p.amount ?? 0);
      }
    });
    return m;
  }, [payments]);

  // KPI
  const collectedTotal = useMemo(
    () => payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [payments],
  );
  const pendingCount = unpaidOrders.length;

  // ---------- 模擬收款 ----------
  const openPay = () => {
    setPayOrderId('');
    setPayMethod('credit_card');
    setPayAmount('');
    setPayOpen(true);
  };

  const handlePay = async () => {
    if (!payOrderId || !payAmount.trim()) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: '金額不正確', description: '請輸入大於 0 的金額', variant: 'destructive' });
      return;
    }
    setPaySaving(true);
    const now = new Date().toISOString();
    const txn = `DEMO${Date.now()}`;
    const { error } = await (supabase as never).from('order_payments').insert({
      order_id: payOrderId,
      amount: amt,
      method: payMethod,
      status: 'paid',
      transaction_no: txn,
      paid_at: now,
    });
    setPaySaving(false);
    if (error) {
      toast({
        title: '收款失敗',
        description: (error as { message?: string }).message,
        variant: 'destructive',
      });
      return;
    }
    setPayOpen(false);
    toast({ title: '模擬收款成功', description: `交易序號 ${txn}` });
    await loadAll();
  };

  // ---------- 開立電子發票 ----------
  const openInvoice = () => {
    setInvOrderId('');
    setInvBuyer('');
    setInvAmount('');
    setInvOpen(true);
  };

  // 選訂單時自動帶入已收款金額
  const onPickInvoiceOrder = (id: string) => {
    setInvOrderId(id);
    const paid = paidAmountByOrder[id];
    if (paid != null && paid > 0) setInvAmount(String(paid));
  };

  const invAmountNum = Number(invAmount) || 0;
  const invTax = Math.round(invAmountNum * 0.05);

  const handleIssueInvoice = async () => {
    if (!invOrderId || !invBuyer.trim() || !invAmount.trim()) return;
    const amt = Number(invAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: '金額不正確', description: '請輸入大於 0 的金額', variant: 'destructive' });
      return;
    }
    setInvSaving(true);
    const now = new Date().toISOString();
    const invoiceNumber = `AB-${yyyymmdd()}-${pad4()}`;
    const tax = Math.round(amt * 0.05);
    const { error } = await (supabase as never).from('invoices').insert({
      order_id: invOrderId,
      invoice_number: invoiceNumber,
      buyer_name: invBuyer.trim(),
      amount: amt,
      tax_amount: tax,
      status: 'issued',
      issued_at: now,
    });
    setInvSaving(false);
    if (error) {
      toast({
        title: '開立發票失敗',
        description: (error as { message?: string }).message,
        variant: 'destructive',
      });
      return;
    }
    setInvOpen(false);
    toast({ title: '電子發票已開立', description: invoiceNumber });
    await loadAll();
  };

  const sandboxNote = (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 mb-5">
      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <p className="text-sm text-amber-800">
        沙盒模式,尚未串接真實金流/發票商。此頁面資料僅供示範,所有交易為模擬產生。
      </p>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">
        下單付款金流 · 對帳與電子發票
      </h1>
      <p className="text-sm text-slate-500 mb-5">Billing · Reconciliation &amp; e-Invoice (Sandbox)</p>

      {sandboxNote}

      <Tabs defaultValue="payments">
        <TabsList className="mb-4">
          <TabsTrigger value="payments">金流收款</TabsTrigger>
          <TabsTrigger value="invoices">電子發票</TabsTrigger>
        </TabsList>

        {/* ============ 金流收款 ============ */}
        <TabsContent value="payments">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            <Card className="border border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex p-1.5 rounded-lg bg-emerald-50 mb-2">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-600">
                  {loading ? '—' : fmtMoney(collectedTotal)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">已收款總額</div>
              </CardContent>
            </Card>
            <Card className="border border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex p-1.5 rounded-lg bg-yellow-50 mb-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                </div>
                <div className="text-2xl font-bold text-yellow-600">
                  {loading ? '—' : pendingCount}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">待收款筆數</div>
              </CardContent>
            </Card>
            <Card className="border border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex p-1.5 rounded-lg bg-blue-50 mb-2">
                  <Receipt className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {loading ? '—' : payments.filter((p) => p.status === 'paid').length}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">已收款筆數</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-700">收款紀錄</h2>
            <Button
              onClick={openPay}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
            >
              <Plus size={16} className="mr-1.5" />
              模擬收款
            </Button>
          </div>

          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-slate-600">訂單</TableHead>
                  <TableHead className="text-slate-600">訂單日期</TableHead>
                  <TableHead className="text-slate-600 text-right">金額</TableHead>
                  <TableHead className="text-slate-600">付款方式</TableHead>
                  <TableHead className="text-slate-600">交易序號</TableHead>
                  <TableHead className="text-slate-600">收款時間</TableHead>
                  <TableHead className="text-slate-600">狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                      尚無收款紀錄,點右上角「模擬收款」建立一筆示範交易
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => {
                    const MIcon = (p.method && METHOD_ICON[p.method]) || CreditCard;
                    const st = (p.status && PAY_STATUS[p.status]) ?? {
                      label: p.status ?? '—',
                      cls: 'bg-slate-100 text-slate-700 border-slate-300',
                    };
                    const ord = p.order_id ? orderById[p.order_id] : undefined;
                    return (
                      <TableRow key={p.id} className="hover:bg-slate-50">
                        <TableCell className="text-sm font-medium text-slate-700 whitespace-nowrap">
                          {orderLabel(p.order_id)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          {ord ? fmtDate(ord.created_at) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 text-right tabular-nums whitespace-nowrap">
                          {fmtMoney(p.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <MIcon className="h-3.5 w-3.5 text-slate-400" />
                            {(p.method && METHOD_LABEL[p.method]) || p.method || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono whitespace-nowrap">
                          {p.transaction_no ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          {fmtDate(p.paid_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.cls}>
                            {st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============ 電子發票 ============ */}
        <TabsContent value="invoices">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            <Card className="border border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex p-1.5 rounded-lg bg-emerald-50 mb-2">
                  <FileText className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-600">
                  {loading ? '—' : invoices.filter((i) => i.status === 'issued').length}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">已開立發票數</div>
              </CardContent>
            </Card>
            <Card className="border border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex p-1.5 rounded-lg bg-blue-50 mb-2">
                  <Wallet className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {loading
                    ? '—'
                    : fmtMoney(
                        invoices
                          .filter((i) => i.status === 'issued')
                          .reduce((s, i) => s + Number(i.amount ?? 0), 0),
                      )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">發票開立總額</div>
              </CardContent>
            </Card>
            <Card className="border border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex p-1.5 rounded-lg bg-purple-50 mb-2">
                  <Receipt className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-2xl font-bold text-purple-600">
                  {loading
                    ? '—'
                    : fmtMoney(
                        invoices
                          .filter((i) => i.status === 'issued')
                          .reduce((s, i) => s + Number(i.tax_amount ?? 0), 0),
                      )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">稅額合計 (5%)</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-700">已開立發票</h2>
            <Button
              onClick={openInvoice}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading}
            >
              <Plus size={16} className="mr-1.5" />
              開立電子發票
            </Button>
          </div>

          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-slate-600">發票號碼</TableHead>
                  <TableHead className="text-slate-600">買受人</TableHead>
                  <TableHead className="text-slate-600">關聯訂單</TableHead>
                  <TableHead className="text-slate-600 text-right">金額(含稅)</TableHead>
                  <TableHead className="text-slate-600 text-right">稅額</TableHead>
                  <TableHead className="text-slate-600">開立時間</TableHead>
                  <TableHead className="text-slate-600">狀態</TableHead>
                  <TableHead className="text-slate-600">對帳狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                      尚無發票紀錄,點右上角「開立電子發票」開立一張示範發票
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => {
                    const st = (inv.status && INV_STATUS[inv.status]) ?? {
                      label: inv.status ?? '—',
                      cls: 'bg-slate-100 text-slate-700 border-slate-300',
                    };
                    // 對帳:發票金額 vs 該訂單已收款金額
                    const paid = inv.order_id ? paidAmountByOrder[inv.order_id] : undefined;
                    const matched =
                      inv.order_id != null &&
                      paid != null &&
                      Math.round(paid) === Math.round(Number(inv.amount ?? 0));
                    return (
                      <TableRow key={inv.id} className="hover:bg-slate-50">
                        <TableCell className="text-sm font-medium text-slate-700 font-mono whitespace-nowrap">
                          {inv.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">
                          {inv.buyer_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          {orderLabel(inv.order_id)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-800 text-right tabular-nums whitespace-nowrap">
                          {fmtMoney(inv.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 text-right tabular-nums whitespace-nowrap">
                          {fmtMoney(inv.tax_amount)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          {fmtDate(inv.issued_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.cls}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {matched ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-100 text-emerald-800 border-emerald-300"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              帳款相符
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-100 text-amber-800 border-amber-300"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              待核對
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ===== 模擬收款 Dialog ===== */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>模擬收款</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">選擇訂單 *</label>
              <Select value={payOrderId} onValueChange={setPayOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇一筆尚未收款的訂單" />
                </SelectTrigger>
                <SelectContent>
                  {unpaidOrders.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">目前沒有待收款的訂單</div>
                  ) : (
                    unpaidOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {orderLabel(o.id)} · {fmtDate(o.created_at)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">付款方式 *</label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">信用卡</SelectItem>
                  <SelectItem value="atm">ATM 轉帳</SelectItem>
                  <SelectItem value="cvs">超商代收</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">收款金額 (NT$) *</label>
              <Input
                type="number"
                inputMode="numeric"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="例:12800"
              />
            </div>
            <p className="text-xs text-slate-400">
              送出後將以 status=paid 建立一筆模擬收款,交易序號自動產生 (DEMO…)。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!payOrderId || !payAmount.trim() || paySaving}
              onClick={handlePay}
            >
              {paySaving ? '收款中…' : '確認收款'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 開立發票 Dialog ===== */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>開立電子發票</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">選擇已付款訂單 *</label>
              <Select value={invOrderId} onValueChange={onPickInvoiceOrder}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇一筆已收款但尚未開票的訂單" />
                </SelectTrigger>
                <SelectContent>
                  {invoicableOrders.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">目前沒有可開票的已付款訂單</div>
                  ) : (
                    invoicableOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {orderLabel(o.id)} · 已收 {fmtMoney(paidAmountByOrder[o.id])}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">買受人名稱 *</label>
              <Input
                value={invBuyer}
                onChange={(e) => setInvBuyer(e.target.value)}
                placeholder="例:好味餐飲有限公司"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 mb-1 block">發票金額(含稅, NT$) *</label>
              <Input
                type="number"
                inputMode="numeric"
                value={invAmount}
                onChange={(e) => setInvAmount(e.target.value)}
                placeholder="例:12800"
              />
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600 flex items-center justify-between">
              <span>營業稅額(自動 5%)</span>
              <span className="font-semibold text-slate-800 tabular-nums">{fmtMoney(invTax)}</span>
            </div>
            <p className="text-xs text-slate-400">
              發票號碼將自動產生 (AB-{yyyymmdd()}-XXXX),狀態設為已開立。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!invOrderId || !invBuyer.trim() || !invAmount.trim() || invSaving}
              onClick={handleIssueInvoice}
            >
              {invSaving ? '開立中…' : '確認開立'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminBillingPage;
