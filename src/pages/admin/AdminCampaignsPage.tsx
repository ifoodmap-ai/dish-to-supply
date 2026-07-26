import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  Flame,
  Megaphone,
  Moon,
  PackageX,
  RefreshCw,
  Sparkles,
  UserX,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/* ---------------------------------------------------------------
 * 新資料表尚未進 types.ts,沿用專案既有的 cast 慣例
 * ------------------------------------------------------------- */
type Res<T> = { data: T[] | null; error: { message: string } | null };

interface Chain<T> extends PromiseLike<Res<T>> {
  eq(col: string, v: unknown): Chain<T>;
  in(col: string, v: readonly unknown[]): Chain<T>;
  order(col: string, opts?: { ascending: boolean }): Chain<T>;
  limit(n: number): Chain<T>;
}

const table = <T,>(name: string) =>
  (supabase as never as {
    from: (t: string) => { select: (c: string) => Chain<T> };
  }).from(name);

/* ------------------------------ types ------------------------------ */
interface RestaurantRow {
  id: string;
  name: string | null;
  city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_line: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

interface SupplierRow {
  id: string;
  name: string | null;
  service_areas: string[] | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

interface OrderRow {
  id: string;
  restaurant_id: string | null;
  status: string;
  created_at: string;
}

interface SupplyRow {
  supplier_id: string | null;
}

interface LeadRow {
  id: string;
  supplier_id: string | null;
  status: string | null;
  created_at: string;
}

interface Member {
  id: string;
  name: string;
  cells: string[];
  /** 排序權重(越大越優先聯絡) */
  sort: number;
}

interface Segment {
  key: string;
  title: string;
  audience: '餐廳' | '供應商';
  icon: typeof Moon;
  tone: string;
  chip: string;
  /** 分眾規則(前端即時計算,不需新資料表) */
  rule: string;
  /** 建議動作 */
  action: string;
  columns: string[];
  members: Member[];
  template: string;
}

/* ------------------------------ 分眾門檻 ------------------------------ */
/** 沉睡:超過這麼多天沒下單 */
const SLEEPING_DAYS = 30;
/** 流失:超過這麼多天沒下單 */
const CHURNED_DAYS = 90;
/** 從未下單:註冊超過這麼多天仍無訂單才納入(避免打擾剛註冊的) */
const NEVER_ORDERED_MIN_DAYS = 14;
/** 商機未跟進:status = new 超過這麼多天 */
const STALE_LEAD_DAYS = 7;
/** 名單在畫面上最多列幾筆(其餘請匯出 CSV) */
const PREVIEW_LIMIT = 50;
/** PostgREST 單次查詢的預設上限;達到就代表資料可能被截斷,名單會不準 */
const ROW_CAP = 1000;

/** 不算「有下單」的狀態 */
const NOT_PLACED = new Set(['draft', 'cancelled']);

/* ------------------------------ 小工具 ------------------------------ */
const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
};

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-TW');
};

const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—');

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/** 複製到剪貼簿(含 http 或舊瀏覽器的 fallback) */
const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到下面的 fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 前端 Blob 下載;加 BOM 讓 Excel 正確顯示中文 */
const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const body = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  // \uFEFF = BOM,Excel 開啟才不會把中文變亂碼
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ------------------------------ 文案樣板 ------------------------------ */
const TEMPLATE_SLEEPING = `【ifoodmap】{{名稱}} 老闆,好久不見

您已經超過 ${SLEEPING_DAYS} 天沒有透過 ifoodmap 叫貨了。
這段期間您常叫的品項行情有變動,我們幫您整理好了:
・同品項比價後,平均可省下 8–15% 採購成本
・原本合作的供應商都還在線上,一鍵就能重新下單

回來看看最新報價 → {{下單連結}}
有任何需求直接回覆這則訊息,專人幫您處理。`;

const TEMPLATE_CHURNED = `【ifoodmap】{{名稱}},想聽聽您的意見

您已經超過 ${CHURNED_DAYS} 天沒有使用 ifoodmap 叫貨了。
如果是價格、配送時間或品項不夠齊,想請您花 1 分鐘告訴我們原因,
我們會把改善的結果直接回報給您。

回覆這則訊息,或填寫 → {{回饋表單連結}}
若願意再試一次,回歸首單我們安排專人全程協助比價與對帳。`;

const TEMPLATE_NEVER = `【ifoodmap】{{名稱}},您的第一張採購單我們幫您準備好了

您已經完成註冊,但還沒下過第一單。
上傳一次菜單,系統會自動拆出食材需求、媒合供應商報價,
第一單有專人全程協助,不需要改變您現有的叫貨習慣。

30 秒開始 → {{下單連結}}
不方便自己操作的話,把常叫的品項傳給我們,我們幫您建單。`;

const TEMPLATE_NO_CATALOG = `【ifoodmap】{{名稱}},您的商品目錄目前是空的

平台上的餐廳正在找貨,但因為您還沒有上架任何品項,
系統無法把需求媒合給您,等於商機直接跳過您。

先上架 5 個主力品項(名稱、單位、價格)就能開始接單:
{{上架連結}}
不方便自己建檔的話,把現有報價單傳給我們,我們幫您匯入。`;

const TEMPLATE_STALE_LEADS = `【ifoodmap】{{名稱}},有 {{商機數}} 筆商機還沒有人查看

系統已經把媒合到的餐廳需求指派給您,但超過 ${STALE_LEAD_DAYS} 天還沒有被開啟。
商機有時效,餐廳通常會把單下給先回覆的供應商。

立即查看並回覆 → {{商機連結}}
如果這些需求不在您的供應範圍,點「不合適」讓系統學習,之後會媒合得更準。`;

/* ------------------------------ page ------------------------------ */
export default function AdminCampaignsPage() {
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draftFor, setDraftFor] = useState<Segment | null>(null);
  const [draftText, setDraftText] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const [restRes, supRes, orderRes, supplyRes, leadRes] = await Promise.all([
      table<RestaurantRow>('restaurants').select(
        'id, name, city, contact_name, contact_phone, contact_line, is_active, created_at',
      ),
      table<SupplierRow>('suppliers').select(
        'id, name, service_areas, contact_name, contact_email, phone, is_active, created_at',
      ),
      table<OrderRow>('supplier_orders').select('id, restaurant_id, status, created_at'),
      table<SupplyRow>('supplies').select('supplier_id'),
      table<LeadRow>('supplier_leads').select('id, supplier_id, status, created_at'),
    ]);

    const fatal = restRes.error ?? supRes.error ?? orderRes.error;
    if (fatal) {
      setLoadError(fatal.message);
      toast.error('讀取分眾名單失敗', { description: fatal.message });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const warn: string[] = [];
    if (supplyRes.error) warn.push(`商品目錄讀取失敗,「未上架品項」名單不準(${supplyRes.error.message})`);
    if (leadRes.error) warn.push(`商機資料讀取失敗,「商機未跟進」名單不準(${leadRes.error.message})`);

    // 單次查詢達 1000 筆上限 → 名單會少人,寧可明講
    ([
      ['restaurants', restRes.data?.length ?? 0],
      ['suppliers', supRes.data?.length ?? 0],
      ['supplier_orders', orderRes.data?.length ?? 0],
      ['supplies', supplyRes.data?.length ?? 0],
      ['supplier_leads', leadRes.data?.length ?? 0],
    ] as [string, number][]).forEach(([t, n]) => {
      if (n >= ROW_CAP) {
        warn.push(`${t} 單次查詢已達 ${ROW_CAP} 筆上限,分眾名單可能不完整,需改為後端分頁`);
      }
    });

    setRestaurants(restRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setOrders(orderRes.data ?? []);
    setSupplies(supplyRes.data ?? []);
    setLeads(leadRes.data ?? []);
    setWarnings(warn);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* --------------------------- 分眾計算 --------------------------- */
  const segments = useMemo<Segment[]>(() => {
    /* 餐廳:最後一次有效下單時間 */
    const lastOrderAt = new Map<string, string>();
    orders.forEach((o) => {
      if (!o.restaurant_id || NOT_PLACED.has(o.status)) return;
      const prev = lastOrderAt.get(o.restaurant_id);
      if (!prev || o.created_at > prev) lastOrderAt.set(o.restaurant_id, o.created_at);
    });

    const activeRestaurants = restaurants.filter((r) => r.is_active !== false);
    const activeSuppliers = suppliers.filter((s) => s.is_active !== false);

    const restaurantCells = (r: RestaurantRow, last: string) => [
      dash(r.city),
      dash(r.contact_name),
      dash(r.contact_phone),
      dash(r.contact_line),
      last,
    ];

    /* 1) 沉睡餐廳(31–90 天) */
    const sleeping: Member[] = [];
    /* 2) 流失餐廳(>90 天) */
    const churned: Member[] = [];
    /* 3) 註冊後從未下單 */
    const neverOrdered: Member[] = [];

    activeRestaurants.forEach((r) => {
      const last = lastOrderAt.get(r.id);
      const gap = daysSince(last);
      if (gap == null) {
        const age = daysSince(r.created_at);
        if (age != null && age > NEVER_ORDERED_MIN_DAYS) {
          neverOrdered.push({
            id: r.id,
            name: dash(r.name),
            cells: [
              dash(r.city),
              dash(r.contact_name),
              dash(r.contact_phone),
              dash(r.contact_line),
              `${fmtDate(r.created_at)}(${Math.floor(age)} 天前)`,
            ],
            sort: age,
          });
        }
        return;
      }
      const label = `${fmtDate(last)}(${Math.floor(gap)} 天前)`;
      if (gap > CHURNED_DAYS) {
        churned.push({ id: r.id, name: dash(r.name), cells: restaurantCells(r, label), sort: gap });
      } else if (gap > SLEEPING_DAYS) {
        sleeping.push({ id: r.id, name: dash(r.name), cells: restaurantCells(r, label), sort: gap });
      }
    });

    /* 4) 未上架任何品項的供應商 */
    const supplyCount = new Map<string, number>();
    supplies.forEach((s) => {
      if (!s.supplier_id) return;
      supplyCount.set(s.supplier_id, (supplyCount.get(s.supplier_id) ?? 0) + 1);
    });
    const noCatalog: Member[] = activeSuppliers
      .filter((s) => (supplyCount.get(s.id) ?? 0) === 0)
      .map((s) => {
        const age = daysSince(s.created_at) ?? 0;
        return {
          id: s.id,
          name: dash(s.name),
          cells: [
            (s.service_areas ?? []).join('、') || '—',
            dash(s.contact_name),
            dash(s.phone),
            dash(s.contact_email),
            `${fmtDate(s.created_at)}(${Math.floor(age)} 天前)`,
          ],
          sort: age,
        };
      });

    /* 5) 有商機超過 7 天未跟進的供應商 */
    const staleBySupplier = new Map<string, { count: number; oldest: number }>();
    leads.forEach((l) => {
      if (!l.supplier_id || l.status !== 'new') return;
      const age = daysSince(l.created_at);
      if (age == null || age <= STALE_LEAD_DAYS) return;
      const cur = staleBySupplier.get(l.supplier_id) ?? { count: 0, oldest: 0 };
      cur.count += 1;
      cur.oldest = Math.max(cur.oldest, age);
      staleBySupplier.set(l.supplier_id, cur);
    });
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const staleLeads: Member[] = [...staleBySupplier.entries()].map(([sid, info]) => {
      const s = supplierById.get(sid);
      return {
        id: sid,
        name: dash(s?.name) === '—' ? `未知供應商 ${sid.slice(-8)}` : dash(s?.name),
        cells: [
          (s?.service_areas ?? []).join('、') || '—',
          dash(s?.contact_name),
          dash(s?.phone),
          dash(s?.contact_email),
          `${info.count} 筆未跟進 · 最久 ${Math.floor(info.oldest)} 天`,
        ],
        sort: info.count * 1000 + info.oldest,
      };
    });

    const bySort = (a: Member, b: Member) => b.sort - a.sort;

    return [
      {
        key: 'sleeping',
        title: '沉睡餐廳',
        audience: '餐廳',
        icon: Moon,
        tone: 'text-amber-600',
        chip: 'bg-amber-50',
        rule: `最後一次下單在 ${SLEEPING_DAYS}–${CHURNED_DAYS} 天前(排除草稿與取消單)`,
        action: '喚回下單:給行情變動 + 一鍵重下單的理由',
        columns: ['城市', '聯絡人', '電話', 'LINE', '最後下單'],
        members: sleeping.sort(bySort),
        template: TEMPLATE_SLEEPING,
      },
      {
        key: 'churned',
        title: '流失餐廳',
        audience: '餐廳',
        icon: UserX,
        tone: 'text-red-600',
        chip: 'bg-red-50',
        rule: `最後一次下單超過 ${CHURNED_DAYS} 天前`,
        action: '先問原因再談回歸,不要直接推銷',
        columns: ['城市', '聯絡人', '電話', 'LINE', '最後下單'],
        members: churned.sort(bySort),
        template: TEMPLATE_CHURNED,
      },
      {
        key: 'never_ordered',
        title: '註冊後從未下單的餐廳',
        audience: '餐廳',
        icon: Sparkles,
        tone: 'text-slate-600',
        chip: 'bg-slate-100',
        rule: `註冊超過 ${NEVER_ORDERED_MIN_DAYS} 天、且沒有任何有效訂單`,
        action: '推第一單:降低啟用門檻,提供代客建單',
        columns: ['城市', '聯絡人', '電話', 'LINE', '註冊時間'],
        members: neverOrdered.sort(bySort),
        template: TEMPLATE_NEVER,
      },
      {
        key: 'no_catalog',
        title: '未上架品項的供應商',
        audience: '供應商',
        icon: PackageX,
        tone: 'text-blue-600',
        chip: 'bg-blue-50',
        rule: 'supplies 表中該供應商的品項數 = 0',
        action: '協助上架:5 個主力品項就能進媒合池',
        columns: ['服務區域', '聯絡人', '電話', 'Email', '加入時間'],
        members: noCatalog.sort(bySort),
        template: TEMPLATE_NO_CATALOG,
      },
      {
        key: 'stale_leads',
        title: '有商機未跟進的供應商',
        audience: '供應商',
        icon: Flame,
        tone: 'text-orange-600',
        chip: 'bg-orange-50',
        rule: `supplier_leads 狀態仍是 new、且建立超過 ${STALE_LEAD_DAYS} 天`,
        action: '立即催辦:商機有時效,餐廳會轉單給先回覆的人',
        columns: ['服務區域', '聯絡人', '電話', 'Email', '未跟進商機'],
        members: staleLeads.sort(bySort),
        template: TEMPLATE_STALE_LEADS,
      },
    ];
  }, [restaurants, suppliers, orders, supplies, leads]);

  const totalTargets = segments.reduce((s, seg) => s + seg.members.length, 0);

  /* --------------------------- 動作 --------------------------- */
  const exportSegment = (seg: Segment) => {
    if (seg.members.length === 0) {
      toast.info('這個分眾目前沒有名單');
      return;
    }
    downloadCsv(
      `ifoodmap_${seg.key}_${stamp()}.csv`,
      [`${seg.audience}名稱`, ...seg.columns, 'ID'],
      seg.members.map((m) => [m.name, ...m.cells, m.id]),
    );
    toast.success(`已匯出 ${seg.title} ${seg.members.length} 筆`);
  };

  const exportAll = () => {
    if (totalTargets === 0) {
      toast.info('目前沒有任何分眾名單可匯出');
      return;
    }
    const rows: (string | number)[][] = [];
    segments.forEach((seg) => {
      seg.members.forEach((m) => {
        rows.push([
          seg.title,
          seg.audience,
          m.name,
          m.cells[1] ?? '',
          m.cells[2] ?? '',
          m.cells[3] ?? '',
          m.cells[4] ?? '',
          m.id,
        ]);
      });
    });
    downloadCsv(
      `ifoodmap_全部分眾_${stamp()}.csv`,
      ['分眾', '對象類型', '名稱', '聯絡人', '電話', 'LINE / Email', '分眾指標', 'ID'],
      rows,
    );
    toast.success(`已匯出全部 ${rows.length} 筆名單`);
  };

  const openDraft = (seg: Segment) => {
    setDraftFor(seg);
    setDraftText(seg.template);
  };

  const handleCopy = async (text: string, okMessage: string) => {
    const ok = await copyText(text);
    if (ok) toast.success(okMessage);
    else toast.error('複製失敗,請手動選取文字複製');
  };

  /* --------------------------- render --------------------------- */
  if (loadError) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-6">推播與活動 (Campaigns)</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-10 text-center">
          <p className="text-sm text-red-700">讀取分眾名單失敗:{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchData()}>
            重新載入
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800">推播與活動 (Campaigns)</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportAll} disabled={loading || totalTargets === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            匯出全部名單
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={loading || refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            重新整理
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        分眾名單即時由訂單與商機資料計算,不需要另外建表
        {!loading && (
          <span className="text-slate-400">
            {' '}
            · 目前 {segments.length} 個分眾、共 {totalTargets} 個待觸達對象
          </span>
        )}
      </p>

      {/* 通道狀態說明 */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Megaphone className="h-5 w-5 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-800 flex-1">
          <span className="font-semibold">名單匯出與文案產生已可用</span>
          ,自動發送待串接通知管道(LINE OA / Email)。目前請匯出 CSV
          後,用既有的群發工具或專人聯繫。
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            部分資料來源讀取失敗,名單可能不完整
          </div>
          <ul className="mt-1.5 ml-6 list-disc text-xs text-amber-700 space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-5">
                <Skeleton className="h-5 w-40 mb-3" />
                <Skeleton className="h-4 w-full max-w-md mb-2" />
                <Skeleton className="h-8 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {segments.map((seg) => {
            const Icon = seg.icon;
            const open = !!expanded[seg.key];
            const visible = seg.members.slice(0, PREVIEW_LIMIT);
            return (
              <Card key={seg.key} className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${seg.chip} shrink-0`}>
                        <Icon className={`h-5 w-5 ${seg.tone}`} />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base text-slate-800 flex items-center gap-2 flex-wrap">
                          {seg.title}
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-slate-600 border-slate-300 text-[11px] px-1.5 py-0"
                          >
                            {seg.audience}
                          </Badge>
                          <span
                            className={`text-lg font-bold tabular-nums ${
                              seg.members.length > 0 ? seg.tone : 'text-slate-300'
                            }`}
                          >
                            {seg.members.length}
                          </span>
                          <span className="text-xs font-normal text-slate-400">人</span>
                        </CardTitle>
                        <p className="text-xs text-slate-500 mt-1">規則:{seg.rule}</p>
                        <p className="text-xs text-slate-400 mt-0.5">建議動作:{seg.action}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpanded((p) => ({ ...p, [seg.key]: !p[seg.key] }))}
                        disabled={seg.members.length === 0}
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 mr-1.5" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-1.5" />
                        )}
                        {open ? '收合名單' : '展開名單'}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => openDraft(seg)}
                      >
                        <Megaphone className="h-4 w-4 mr-1.5" />
                        產生推播文案
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportSegment(seg)}
                        disabled={seg.members.length === 0}
                      >
                        <Download className="h-4 w-4 mr-1.5" />
                        匯出 CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {open && (
                  <CardContent className="pt-0">
                    {seg.members.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-400">
                        目前沒有符合這個條件的對象
                      </div>
                    ) : (
                      <div className="rounded-md border border-slate-200 overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium text-slate-600">
                                {seg.audience}名稱
                              </th>
                              {seg.columns.map((c) => (
                                <th
                                  key={c}
                                  className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap"
                                >
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((m) => (
                              <tr
                                key={m.id}
                                className="border-t border-slate-100 hover:bg-slate-50"
                              >
                                <td className="px-4 py-2 text-slate-800 font-medium">{m.name}</td>
                                {m.cells.map((cell, i) => (
                                  <td
                                    key={i}
                                    className="px-4 py-2 text-slate-600 whitespace-nowrap"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {seg.members.length > PREVIEW_LIMIT && (
                      <p className="mt-2 text-xs text-slate-400">
                        畫面只列出前 {PREVIEW_LIMIT} 筆(依優先度排序),完整 {seg.members.length}{' '}
                        筆請匯出 CSV
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 文案產生 */}
      <Dialog
        open={!!draftFor}
        onOpenChange={(o) => {
          if (!o) setDraftFor(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draftFor?.title} · 推播文案</DialogTitle>
            <DialogDescription>
              建議文案,可直接編輯後複製。{'{{名稱}}'} 等變數請由群發工具帶入,
              或匯出 CSV 後用試算表套用。
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={14}
            className="text-sm leading-relaxed"
          />

          <div className="text-xs text-slate-400">
            可用變數:{'{{名稱}}'}
            {draftFor?.key === 'stale_leads' && `、${'{{商機數}}'}`}
            、{'{{下單連結}}'}、{'{{上架連結}}'}、{'{{商機連結}}'}、{'{{回饋表單連結}}'}
            {draftFor && ` · 這份文案將發給 ${draftFor.members.length} 個對象`}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDraftFor(null)}>
              關閉
            </Button>
            {draftFor && draftFor.members.length > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  handleCopy(
                    draftFor.members.map((m) => m.name).join('\n'),
                    `已複製 ${draftFor.members.length} 個名稱`,
                  )
                }
              >
                <ClipboardCopy className="h-4 w-4 mr-1.5" />
                複製名單
              </Button>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleCopy(draftText, '已複製文案到剪貼簿')}
            >
              <ClipboardCopy className="h-4 w-4 mr-1.5" />
              複製文案
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-xs text-slate-400">
        名單為即時計算結果,沒有寫死或示範資料;實際發送需串接 LINE OA / Email
        後才會出現「直接發送」按鈕
      </p>
    </div>
  );
}
