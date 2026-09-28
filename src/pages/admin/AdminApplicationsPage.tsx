import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Check, Mail, Phone, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// supplier_applications 不在自動產生的型別裡;只描述這頁用得到的查詢
type ListQuery = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  select: (columns: string) => ListQuery;
  order: (column: string, opts: { ascending: boolean }) => ListQuery;
};
const db = supabase as unknown as { from: (table: string) => ListQuery };

interface ApplicationRow {
  id: string;
  created_at: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  contact_line: string | null;
  categories: string[] | string | null;
  service_areas: string[] | string | null;
  description: string | null;
  status: string;
  admin_notes: string | null;
  /** 退件時寄給申請者的說明(admin_notes 是內部備註,不會寄出) */
  applicant_message: string | null;
  reviewed_at: string | null;
}

/** approve-supplier 核准的回傳(見 supabase/functions/approve-supplier/handler.ts) */
interface ApproveResult {
  supplier_id: string;
  supplier_name: string;
  login_email: string;
  /** new = 這次新建的帳號;existing = 這個 Email 原本就有帳號(沿用,不改原有身分) */
  account?: 'new' | 'existing';
  /** 新帳號:邀請信是否寄出 */
  invited?: boolean;
  /** 新帳號且邀請信寄不出去時的臨時密碼(僅此一次) */
  temp_password: string | null;
  /** 既有帳號:「請用原本的帳號登入」通知是否寄出 */
  notified?: boolean;
  mail_error?: string | null;
}

interface RejectResult {
  status: 'rejected';
  notified: boolean;
  mail_error: string | null;
}

/** 核准 / 退件都走 approve-supplier(只有平台管理員呼叫得了,寄信也在伺服器端) */
const callReviewFunction = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('尚未登入或登入已過期，請重新登入');
  }
  // Supabase Edge Function(service-role 由平台注入,獨立於 Railway 部署)
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-supplier`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as ({ data?: T } & { message?: string }) | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.message ?? `處理失敗 (${res.status})`);
  }
  return json.data;
};

const APPLICANT_MESSAGE_MAX = 1000;
const ADMIN_NOTES_MAX = 2000;

const statusBadgeClass: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
};

const statusLabel: Record<string, string> = {
  pending: '待審核',
  approved: '已核准',
  rejected: '已拒絕',
};

const listText = (v: string[] | string | null): string => {
  if (!v) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join('、');
  return v;
};

const AdminApplicationsPage = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);

  // approve flow
  const [approveTarget, setApproveTarget] = useState<ApplicationRow | null>(null);
  const [approving, setApproving] = useState(false);
  const [credentials, setCredentials] = useState<ApproveResult | null>(null);
  const [copied, setCopied] = useState(false);

  // reject flow
  const [rejectTarget, setRejectTarget] = useState<ApplicationRow | null>(null);
  /** 內部備註:只有管理員看得到,不會寄出 */
  const [rejectReason, setRejectReason] = useState('');
  /** 給申請者的說明:會寫在退件信裡 */
  const [applicantMessage, setApplicantMessage] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = (await db
      .from('supplier_applications')
      .select(
        'id, created_at, company_name, contact_name, contact_email, contact_phone, contact_line, categories, service_areas, description, status, admin_notes, applicant_message, reviewed_at',
      )
      .order('created_at', { ascending: false })) as {
      data: ApplicationRow[] | null;
      error: { message?: string } | null;
    };
    if (error) {
      toast({
        title: '載入失敗',
        description: error.message,
        variant: 'destructive',
      });
    }
    setRows(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    const target = approveTarget;
    setApproving(true);
    try {
      const result = await callReviewFunction<ApproveResult>({ application_id: target.id });
      setApproveTarget(null);
      setCredentials(result);
      setCopied(false);
      toast({
        title: '已核准',
        description: `${result.supplier_name} 已建立為供應商`,
      });
      fetchRows();
    } catch (e) {
      toast({
        title: '核准失敗',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejecting(true);
    try {
      // 退件改走 approve-supplier(只有管理員呼叫得了):改狀態 + 寄退件信在伺服器端一次完成。
      // 信裡只會有 applicant_message;admin_notes 是內部備註,不會寄出。
      const result = await callReviewFunction<RejectResult>({
        action: 'reject',
        application_id: target.id,
        admin_notes: rejectReason.trim() || null,
        applicant_message: applicantMessage.trim() || null,
      });
      setRejectTarget(null);
      setRejectReason('');
      setApplicantMessage('');
      if (result.notified) {
        toast({ title: '已拒絕', description: `${target.company_name} 的申請已退件，並已寄出通知信` });
      } else {
        toast({
          title: '已拒絕，但通知信沒有寄出',
          description: `${target.company_name} 的申請已退件。${result.mail_error ?? ''} 請另外通知申請者。`,
          variant: 'destructive',
        });
      }
      fetchRows();
    } catch (e) {
      toast({
        title: '拒絕失敗',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setRejecting(false);
    }
  };

  const isExistingAccount = credentials?.account === 'existing';
  const showsTempPassword = !isExistingAccount && !credentials?.invited && !!credentials?.temp_password;

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = isExistingAccount
      ? `登入帳號：${credentials.login_email}\n（這個 Email 原本就有 iFoodmap 帳號，請用原本的密碼登入）`
      : credentials.invited
        ? `登入帳號：${credentials.login_email}\n（已寄出邀請信，請供應商依信中連結自行設定密碼）`
        : showsTempPassword
          ? `登入帳號：${credentials.login_email}\n臨時密碼：${credentials.temp_password}`
          : `登入帳號：${credentials.login_email}\n（請到登入頁用「忘記密碼」設定密碼）`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: '已複製帳密' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: '複製失敗',
        description: '請手動選取複製',
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">入駐審核 (Applications)</h1>
      <p className="text-sm text-slate-500 mb-6">審核供應商入駐申請，核准後自動建立供應商帳號</p>

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-slate-600">申請時間</TableHead>
              <TableHead className="text-slate-600">公司</TableHead>
              <TableHead className="text-slate-600">聯絡人</TableHead>
              <TableHead className="text-slate-600">品類</TableHead>
              <TableHead className="text-slate-600">區域</TableHead>
              <TableHead className="text-slate-600">狀態</TableHead>
              <TableHead className="text-slate-600 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                  尚無入駐申請
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm text-slate-600 whitespace-nowrap align-top">
                    {new Date(r.created_at).toLocaleString('zh-TW')}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="text-sm font-medium text-slate-800">{r.company_name}</div>
                    {r.description ? (
                      <div className="text-xs text-slate-400 mt-0.5 max-w-[220px] truncate" title={r.description}>
                        {r.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="text-sm text-slate-700">
                      {r.contact_name || <span className="text-slate-400 italic">未填</span>}
                    </div>
                    <div className="mt-0.5 space-y-0.5 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="break-all">{r.contact_email}</span>
                      </div>
                      {r.contact_phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span>{r.contact_phone}</span>
                        </div>
                      ) : null}
                      {r.contact_line ? (
                        <div className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3 shrink-0" />
                          <span>LINE: {r.contact_line}</span>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-[160px] align-top">
                    {listText(r.categories) || <span className="text-slate-400 italic">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-[160px] align-top">
                    {listText(r.service_areas) || <span className="text-slate-400 italic">—</span>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge
                      variant="outline"
                      className={
                        statusBadgeClass[r.status] ?? 'bg-slate-100 text-slate-700 border-slate-300'
                      }
                    >
                      {statusLabel[r.status] ?? r.status}
                    </Badge>
                    {r.status === 'rejected' && r.admin_notes ? (
                      <div className="text-xs text-slate-400 mt-1 max-w-[140px] truncate" title={r.admin_notes}>
                        {r.admin_notes}
                      </div>
                    ) : null}
                    {r.status === 'rejected' && r.applicant_message ? (
                      <div
                        className="text-xs text-slate-500 mt-1 max-w-[140px] truncate"
                        title={`寄給申請者：${r.applicant_message}`}
                      >
                        寄給申請者：{r.applicant_message}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {r.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                          onClick={() => setApproveTarget(r)}
                        >
                          核准
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setRejectReason('');
                            setApplicantMessage('');
                            setRejectTarget(r);
                          }}
                        >
                          拒絕
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString('zh-TW') : '—'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 核准 confirm */}
      <AlertDialog
        open={!!approveTarget}
        onOpenChange={(o) => {
          if (!o && !approving) setApproveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>核准「{approveTarget?.company_name}」的入駐申請？</AlertDialogTitle>
            <AlertDialogDescription>
              核准後系統會建立供應商資料，並寄一封「設定密碼」的邀請信到 {approveTarget?.contact_email}
              ，供應商點信裡的連結設定密碼就能登入。若這個 Email 原本就有 iFoodmap 帳號，會直接綁定為供應商並改寄「申請已通過」通知（不會更動該帳號原有的身分與權限）。此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleApprove();
              }}
              disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {approving ? '核准中…' : '確定核准'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 拒絕 confirm + reason */}
      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o && !rejecting) setRejectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>拒絕「{rejectTarget?.company_name}」的入駐申請？</AlertDialogTitle>
            <AlertDialogDescription>
              退件後會寄一封通知信給申請者（{rejectTarget?.contact_email}）。信裡只會出現「給申請者的說明」，內部備註不會寄出。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-applicant-message">給申請者的說明（選填，會寫在退件信裡）</Label>
            <Textarea
              id="reject-applicant-message"
              placeholder="例：目前您的服務區域尚未開放，歡迎之後再申請。"
              value={applicantMessage}
              onChange={(e) => setApplicantMessage(e.target.value)}
              maxLength={APPLICANT_MESSAGE_MAX}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reject-admin-notes">內部備註（選填，只有管理員看得到，不會寄出）</Label>
            <Textarea
              id="reject-admin-notes"
              placeholder="拒絕原因、內部紀錄…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={ADMIN_NOTES_MAX}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReject();
              }}
              disabled={rejecting}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejecting ? '處理中…' : '確定拒絕'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 帳密 Dialog（僅顯示一次） */}
      <Dialog
        open={!!credentials}
        onOpenChange={(o) => {
          if (!o) setCredentials(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isExistingAccount
                ? '已核准（沿用既有帳號）'
                : credentials?.invited
                  ? '已寄出邀請信'
                  : '供應商帳號已建立'}
            </DialogTitle>
            <DialogDescription>
              {isExistingAccount
                ? credentials?.notified
                  ? '這個 Email 原本就有 iFoodmap 帳號，已直接綁定為供應商，並寄出「申請已通過，請用原本的帳號登入」的通知。帳號原有的身分與權限都沒有更動。'
                  : `這個 Email 原本就有 iFoodmap 帳號，已直接綁定為供應商（帳號原有的身分與權限都沒有更動），但通知信沒有寄出${credentials?.mail_error ? `：${credentials.mail_error}` : ''}。請另外通知對方用原本的帳號登入。`
                : credentials?.invited
                  ? '供應商會收到一封信，點連結自行設定密碼即可登入 —— 你不需要轉達任何密碼。連結 1 小時內有效，過期的話對方可以在連結打開的頁面按「重新寄送設定密碼連結」。'
                  : showsTempPassword
                    ? '邀請信寄送失敗，改用臨時密碼。此密碼僅顯示一次，關閉視窗後無法再查看，請盡快轉交供應商。'
                    : '邀請信寄送失敗，也無法設定臨時密碼。請對方到登入頁用「忘記密碼」以這個 Email 設定密碼。'}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">供應商</span>
              <span className="font-medium text-slate-800 text-right">
                {credentials?.supplier_name}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">登入帳號</span>
              <span className="font-mono font-medium text-slate-800 text-right break-all">
                {credentials?.login_email}
              </span>
            </div>
            {showsTempPassword ? (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">臨時密碼</span>
                <span className="font-mono font-medium text-slate-800 text-right break-all">
                  {credentials?.temp_password}
                </span>
              </div>
            ) : (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">密碼</span>
                <span className="text-emerald-700 text-right">
                  {isExistingAccount
                    ? '沿用原本的密碼'
                    : credentials?.invited
                      ? '由供應商自行設定'
                      : '請對方用「忘記密碼」設定'}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={copyCredentials}
              className="gap-1.5"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? '已複製' : showsTempPassword ? '複製帳密' : '複製登入帳號'}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setCredentials(null)}
            >
              {showsTempPassword ? '我已妥善保存' : '知道了'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApplicationsPage;
