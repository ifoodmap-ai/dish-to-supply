import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Minus,
  PackageX,
  Save,
  Tag,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface SupplyRow {
  id: string;
  supplier_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: string | null;
  price: number | null;
  is_available: boolean | null;
}

interface SupplierRow {
  id: string;
  name: string;
  service_areas: string[] | null;
  is_active: boolean | null;
}

interface OrderIngredient {
  name?: string;
}

interface OrderRow {
  id: string;
  supplier_id: string | null;
  created_at: string;
  ingredient_list: OrderIngredient[] | null;
}

type Verdict = 'high' | 'low' | 'fair' | 'none';

interface PriceRow {
  supply: SupplyRow;
  competitorPrices: number[];
  marketAvg: number | null;
  marketMin: number | null;
  diffPct: number | null;
  verdict: Verdict;
  lostOrderIds: string[];
}

/** 與 src/lib/api.ts 相同的名稱正規化(去空白、去括號註記) */
const normalizeName = (s: string) =>
  s.toLowerCase().replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '');

/** 雙向 includes 視為同品項 */
const sameItem = (a: string, b: string) => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
};

const HIGH_THRESHOLD = 15; // 價差 > 15% 視為偏高
const DAY = 24 * 60 * 60 * 1000;

const money = (n: number) =>
  `$${n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;

/** 在同區報價池中的名次(1 = 最便宜) */
const rankOf = (price: number, competitors: number[]) =>
  competitors.filter((p) => p < price).length + 1;

const verdictMeta: Record<Verdict, { label: string; className: string }> = {
  high: { label: '偏高', className: 'bg-red-50 text-red-700 border-red-200' },
  low: { label: '有競爭力', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  fair: { label: '接近行情', className: 'bg-slate-100 text-slate-600 border-slate-300' },
  none: { label: '無同區報價', className: 'bg-slate-50 text-slate-400 border-slate-200' },
};

export default function SupplierPricingPage() {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [myAreas, setMyAreas] = useState<string[]>([]);
  const [mySupplies, setMySupplies] = useState<SupplyRow[]>([]);
  const [rivalSupplies, setRivalSupplies] = useState<SupplyRow[]>([]);
  const [rivalCount, setRivalCount] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: acct } = (await (supabase as never)
        .from('supplier_accounts')
        .select('supplier_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()) as { data: { supplier_id: string } | null };

      const sid = acct?.supplier_id ?? null;
      if (!sid) {
        setLoading(false);
        return;
      }
      setSupplierId(sid);

      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const [suppliersRes, suppliesRes, ordersRes] = await Promise.all([
        (supabase as never)
          .from('suppliers')
          .select('id, name, service_areas, is_active') as Promise<{
          data: SupplierRow[] | null;
        }>,
        (supabase as never)
          .from('supplies')
          .select('id, supplier_id, name, category, unit, pack_size, price, is_available') as Promise<{
          data: SupplyRow[] | null;
        }>,
        (supabase as never)
          .from('supplier_orders')
          .select('id, supplier_id, created_at, ingredient_list')
          .gte('created_at', since) as Promise<{ data: OrderRow[] | null }>,
      ]);

      const suppliers = suppliersRes.data ?? [];
      const supplies = suppliesRes.data ?? [];

      const me = suppliers.find((s) => s.id === sid);
      const areas = (me?.service_areas ?? []).filter(Boolean);
      setMyAreas(areas);

      // 同區 = service_areas 有交集;我方未填服務區域時退回「全平台」比較
      const rivalIds = new Set(
        suppliers
          .filter((s) => s.id !== sid && s.is_active !== false)
          .filter(
            (s) =>
              areas.length === 0 ||
              (s.service_areas ?? []).some((a) => areas.includes(a)),
          )
          .map((s) => s.id),
      );

      setRivalCount(rivalIds.size);
      setMySupplies(
        supplies
          .filter((s) => s.supplier_id === sid)
          .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name)),
      );
      setRivalSupplies(
        supplies.filter(
          (s) => rivalIds.has(s.supplier_id) && s.is_available !== false && s.price != null,
        ),
      );
      setOrders(ordersRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  const rows: PriceRow[] = useMemo(() => {
    return mySupplies.map((supply) => {
      const competitorPrices = rivalSupplies
        .filter((r) => sameItem(r.name, supply.name))
        .map((r) => Number(r.price))
        .filter((p) => Number.isFinite(p) && p > 0)
        .sort((a, b) => a - b);

      const marketAvg =
        competitorPrices.length > 0
          ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length
          : null;
      const marketMin = competitorPrices.length > 0 ? competitorPrices[0] : null;

      const myPrice = supply.price != null ? Number(supply.price) : null;
      const diffPct =
        marketAvg && marketAvg > 0 && myPrice != null
          ? ((myPrice - marketAvg) / marketAvg) * 100
          : null;

      let verdict: Verdict = 'none';
      if (diffPct != null) {
        if (diffPct > HIGH_THRESHOLD) verdict = 'high';
        else if (diffPct < -HIGH_THRESHOLD) verdict = 'low';
        else verdict = 'fair';
      }

      // 近 30 天有這個品項的需求、但這張單沒有派給我 → 可能流失的詢價
      const lostOrderIds = orders
        .filter((o) => o.supplier_id !== supplierId)
        .filter((o) => (o.ingredient_list ?? []).some((i) => i?.name && sameItem(i.name, supply.name)))
        .map((o) => o.id);

      return { supply, competitorPrices, marketAvg, marketMin, diffPct, verdict, lostOrderIds };
    });
  }, [mySupplies, rivalSupplies, orders, supplierId]);

  const summary = useMemo(() => {
    const highRows = rows.filter((r) => r.verdict === 'high');
    const lost = new Set<string>();
    highRows.forEach((r) => r.lostOrderIds.forEach((id) => lost.add(id)));
    return {
      highCount: highRows.length,
      lowCount: rows.filter((r) => r.verdict === 'low').length,
      comparedCount: rows.filter((r) => r.verdict !== 'none').length,
      lostInquiries: lost.size,
    };
  }, [rows]);

  const handleSave = async (row: PriceRow) => {
    const raw = drafts[row.supply.id];
    const next = Number(raw);
    if (!raw?.trim() || !Number.isFinite(next) || next <= 0) {
      toast.error('請輸入有效的價格');
      return;
    }
    setSavingId(row.supply.id);
    const { error } = (await (supabase as never)
      .from('supplies')
      .update({ price: next })
      .eq('id', row.supply.id)) as { error: { message: string } | null };
    setSavingId(null);
    if (error) {
      toast.error('調價失敗', { description: error.message });
      return;
    }
    setMySupplies((prev) =>
      prev.map((s) => (s.id === row.supply.id ? { ...s, price: next } : s)),
    );
    setDrafts((prev) => {
      const rest = { ...prev };
      delete rest[row.supply.id];
      return rest;
    });
    toast.success(`已將「${row.supply.name}」調整為 ${money(next)}`);
  };

  const kpis = [
    {
      label: '偏高品項',
      value: summary.highCount,
      hint: `高於同區均價 ${HIGH_THRESHOLD}% 以上`,
      icon: AlertTriangle,
      accent: summary.highCount > 0 ? 'text-red-600' : 'text-slate-700',
      bg: summary.highCount > 0 ? 'bg-red-50' : 'bg-slate-100',
    },
    {
      label: '可能流失的詢價',
      value: summary.lostInquiries,
      hint: '近 30 天有偏高品項需求、卻沒下給你的單',
      icon: ArrowDownRight,
      accent: summary.lostInquiries > 0 ? 'text-amber-600' : 'text-slate-700',
      bg: summary.lostInquiries > 0 ? 'bg-amber-50' : 'bg-slate-100',
    },
    {
      label: '有競爭力品項',
      value: summary.lowCount,
      hint: `低於同區均價 ${HIGH_THRESHOLD}% 以上`,
      icon: Trophy,
      accent: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: '已比價品項',
      value: `${summary.comparedCount} / ${rows.length}`,
      hint: `同區共 ${rivalCount} 家供應商`,
      icon: Tag,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">定價助手</h1>
      <p className="text-sm text-gray-500 mb-6">
        比對同區同品項行情,找出定價偏高、可能導致流失詢價的商品
        {myAreas.length > 0 ? `(服務區域:${myAreas.join('、')})` : '(尚未設定服務區域,以全平台行情比較)'}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ label, value, hint, icon: Icon, accent, bg }) => (
          <Card key={label} className="border border-gray-200">
            <CardContent className="p-4">
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`h-4 w-4 ${accent}`} />
              </div>
              <div className={`text-2xl font-bold tabular-nums ${accent}`}>
                {loading ? '—' : value}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">{label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500" size={28} />
        </div>
      ) : !supplierId ? (
        <div className="text-center py-20 text-gray-400">此帳號尚未綁定供應商</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <PackageX size={40} className="mx-auto mb-3 opacity-40" />
          <p>尚無商品可比價,請先到「商品目錄」建立品項與價格</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">商品</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">我的價格</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">同區均價</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600 whitespace-nowrap">同區最低</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600 whitespace-nowrap">價差</th>
                  <th className="text-center px-5 py-3 font-medium text-gray-600 whitespace-nowrap">價格排名</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-600 w-56 whitespace-nowrap">調整價格</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { supply, competitorPrices, marketAvg, marketMin, diffPct, verdict } = row;
                  const myPrice = supply.price != null ? Number(supply.price) : null;
                  const poolSize = competitorPrices.length + 1;
                  const currentRank = myPrice != null ? rankOf(myPrice, competitorPrices) : null;

                  const draft = drafts[supply.id];
                  const draftNum = draft != null && draft.trim() ? Number(draft) : NaN;
                  const draftValid = Number.isFinite(draftNum) && draftNum > 0;
                  const changed = draftValid && draftNum !== myPrice;
                  const nextRank = changed ? rankOf(draftNum, competitorPrices) : null;

                  const meta = verdictMeta[verdict];

                  return (
                    <tr key={supply.id} className="border-b border-gray-100 last:border-0 align-top hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{supply.name}</p>
                        <p className="text-xs text-gray-400">
                          {supply.category ?? '未分類'}
                          {supply.pack_size ? ` · ${supply.pack_size}` : ''}
                          {competitorPrices.length > 0 ? ` · 同區 ${competitorPrices.length} 筆報價` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-800 tabular-nums whitespace-nowrap">
                        {myPrice != null ? `${money(myPrice)} / ${supply.unit ?? '件'}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">
                        {marketAvg != null ? money(marketAvg) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">
                        {marketMin != null ? money(marketMin) : '—'}
                      </td>
                      <td className="px-5 py-3 text-center whitespace-nowrap">
                        <Badge variant="outline" className={meta.className}>
                          {verdict === 'high' && <ArrowUpRight size={12} className="mr-0.5" />}
                          {verdict === 'low' && <ArrowDownRight size={12} className="mr-0.5" />}
                          {verdict === 'fair' && <Minus size={12} className="mr-0.5" />}
                          {meta.label}
                        </Badge>
                        {diffPct != null && (
                          <p className="text-xs text-gray-500 mt-1 tabular-nums">
                            {diffPct >= 0 ? '+' : ''}
                            {diffPct.toFixed(1)}%
                          </p>
                        )}
                        {verdict === 'high' && row.lostOrderIds.length > 0 && (
                          <p className="text-[11px] text-amber-600 mt-1">
                            近 30 天流失 {row.lostOrderIds.length} 張詢價
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center whitespace-nowrap">
                        {currentRank != null && competitorPrices.length > 0 ? (
                          <div className="text-gray-700 tabular-nums">
                            第 {currentRank} / {poolSize} 便宜
                            {nextRank != null && (
                              <p
                                className={`text-xs mt-1 font-medium ${
                                  nextRank < currentRank
                                    ? 'text-emerald-600'
                                    : nextRank > currentRank
                                      ? 'text-red-600'
                                      : 'text-gray-400'
                                }`}
                              >
                                調整後預估:第 {nextRank} / {poolSize}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            type="number"
                            min="0"
                            className="h-8 w-28 text-right"
                            placeholder={myPrice != null ? String(myPrice) : '未定價'}
                            value={draft ?? ''}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [supply.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                            disabled={!changed || savingId === supply.id}
                            onClick={() => handleSave(row)}
                          >
                            {savingId === supply.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <>
                                <Save size={14} className="mr-1" />
                                調價
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && supplierId && rows.length > 0 && summary.comparedCount === 0 && (
        <p className="text-xs text-gray-400 mt-4">
          同區目前沒有找到相同品項的其他報價,無法計算行情價差。
        </p>
      )}
    </div>
  );
}
