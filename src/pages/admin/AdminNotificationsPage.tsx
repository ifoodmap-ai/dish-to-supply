import { useEffect, useMemo, useState } from 'react';
import {
  MessageCircle,
  Mail,
  Smartphone,
  Send,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Inbox,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface NotificationRow {
  id: string;
  recipient: string | null;
  channel: string | null;
  title: string | null;
  message: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
}

const channelMeta: Record<
  string,
  { label: string; icon: typeof MessageCircle; iconBg: string; iconColor: string }
> = {
  line: { label: 'LINE', icon: MessageCircle, iconBg: 'bg-[#06C755]', iconColor: 'text-white' },
  email: { label: 'Email', icon: Mail, iconBg: 'bg-blue-500', iconColor: 'text-white' },
  sms: { label: 'SMS', icon: Smartphone, iconBg: 'bg-purple-500', iconColor: 'text-white' },
};

const statusMeta: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  sent: {
    label: '已送達',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: CheckCircle2,
  },
  pending: {
    label: '傳送中',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    icon: Clock,
  },
  failed: {
    label: '失敗',
    className: 'bg-red-100 text-red-800 border-red-300',
    icon: AlertTriangle,
  },
};

const formatTime = (ts: string | null) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isToday = (ts: string | null) => {
  if (!ts) return false;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

interface SettingToggle {
  key: string;
  label: string;
  desc: string;
}

const settingToggles: SettingToggle[] = [
  { key: 'new_order', label: '新訂單通知', desc: '收到新採購訂單時推播' },
  { key: 'shipment', label: '出貨通知', desc: '供應商出貨後即時通知' },
  { key: 'quote', label: '報價提醒', desc: '供應商回報報價時提醒' },
];

const AdminNotificationsPage = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ recipient: '', title: '', message: '' });
  const [settings, setSettings] = useState<Record<string, boolean>>({
    new_order: true,
    shipment: true,
    quote: false,
  });

  const fetchRows = async () => {
    setLoading(true);
    const { data } = (await (supabase as never)
      .from('notifications')
      .select('id, recipient, channel, title, message, status, sent_at, created_at')
      .order('sent_at', { ascending: false, nullsFirst: false })) as {
      data: NotificationRow[] | null;
    };
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const todayCount = useMemo(
    () => rows.filter((r) => r.status === 'sent' && isToday(r.sent_at)).length,
    [rows],
  );

  const handleSend = async () => {
    if (!form.recipient.trim() || !form.title.trim() || !form.message.trim()) {
      toast({
        title: '請填寫完整',
        description: '收件對象、標題與訊息皆為必填。',
        variant: 'destructive',
      });
      return;
    }
    setSending(true);
    const now = new Date().toISOString();
    const payload = {
      recipient: form.recipient.trim(),
      channel: 'line',
      title: form.title.trim(),
      message: form.message.trim(),
      status: 'sent',
      sent_at: now,
    };
    const { data, error } = (await (supabase as never)
      .from('notifications')
      .insert(payload)
      .select('id, recipient, channel, title, message, status, sent_at, created_at')
      .single()) as { data: NotificationRow | null; error: { message?: string } | null };
    setSending(false);
    if (error) {
      toast({
        title: '發送失敗 (Send failed)',
        description: (error as { message?: string }).message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: '測試通知已送出', description: `已推播給 ${payload.recipient}` });
    if (data) {
      setRows((prev) => [data, ...prev]);
    } else {
      fetchRows();
    }
    setForm({ recipient: '', title: '', message: '' });
    setDialogOpen(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">LINE 即時通知</h1>
          <p className="text-sm text-slate-500 mt-1">
            Realtime Notifications · 供應鏈事件即時推播中心
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Send className="h-4 w-4 mr-2" />
          發送測試通知
        </Button>
      </div>

      {/* Sandbox note */}
      <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">沙盒示範模式</span>
          ：尚未串接 LINE Messaging API；實際上線需 LINE 官方帳號 channel token。
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chat feed */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base text-slate-700 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#06C755]">
                <MessageCircle className="h-3.5 w-3.5 text-white" />
              </div>
              通知動態
            </CardTitle>
            <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">
              共 {rows.length} 則
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-14 w-full rounded-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                <Inbox className="h-10 w-10 mb-3" />
                <p className="text-sm">尚無通知紀錄</p>
                <p className="text-xs mt-1">點擊右上角「發送測試通知」開始</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
                {rows.map((n) => {
                  const ch =
                    channelMeta[n.channel ?? ''] ?? {
                      label: n.channel ?? '通知',
                      icon: Bell,
                      iconBg: 'bg-slate-400',
                      iconColor: 'text-white',
                    };
                  const st =
                    statusMeta[n.status ?? ''] ?? {
                      label: n.status ?? '—',
                      className: 'bg-slate-100 text-slate-700 border-slate-300',
                      icon: Clock,
                    };
                  const ChIcon = ch.icon;
                  const StIcon = st.icon;
                  return (
                    <div key={n.id} className="flex gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ch.iconBg}`}
                      >
                        <ChIcon className={`h-4 w-4 ${ch.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {n.recipient || '未指定收件人'}
                          </span>
                          <span className="text-[11px] text-slate-400">{ch.label}</span>
                        </div>
                        <div className="rounded-2xl rounded-tl-sm bg-slate-50 border border-slate-200 px-3.5 py-2.5">
                          <p className="text-sm font-semibold text-slate-800 break-words">
                            {n.title || '（無標題）'}
                          </p>
                          {n.message && (
                            <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap break-words">
                              {n.message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge
                            variant="outline"
                            className={`${st.className} gap-1 py-0 h-5 text-[11px]`}
                          >
                            <StIcon className="h-3 w-3" />
                            {st.label}
                          </Badge>
                          <span className="text-[11px] text-slate-400">
                            {formatTime(n.sent_at ?? n.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* KPI */}
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="inline-flex p-1.5 rounded-lg bg-emerald-50 mb-2">
                <Send className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {loading ? '—' : todayCount}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">今日已發送</div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700 flex items-center gap-2">
                <Bell className="h-4 w-4 text-slate-500" />
                通知設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {settingToggles.map((t, i) => (
                <div key={t.key}>
                  <div className="flex items-center justify-between py-2.5">
                    <div className="pr-3">
                      <p className="text-sm font-medium text-slate-700">{t.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                    </div>
                    <Switch
                      checked={settings[t.key]}
                      onCheckedChange={(v) =>
                        setSettings((prev) => ({ ...prev, [t.key]: v }))
                      }
                      className="data-[state=checked]:bg-emerald-600"
                    />
                  </div>
                  {i < settingToggles.length - 1 && (
                    <div className="border-t border-slate-100" />
                  )}
                </div>
              ))}
              <p className="pt-2 text-[11px] text-slate-400">
                * 設定為示範用途，尚未持久化儲存。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send test dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#06C755]">
                <MessageCircle className="h-3.5 w-3.5 text-white" />
              </div>
              發送測試通知
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                收件對象
              </label>
              <Input
                placeholder="例如：明華餐廳 / LINE 用戶 ID"
                value={form.recipient}
                onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">標題</label>
              <Input
                placeholder="例如：您的訂單已出貨"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">訊息</label>
              <Textarea
                placeholder="輸入要推播的訊息內容…"
                rows={4}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={sending}
            >
              取消
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? '發送中…' : '確認發送'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNotificationsPage;
