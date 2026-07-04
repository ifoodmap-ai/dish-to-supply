import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, Store, PiggyBank, Trophy, TrendingDown, PackageSearch } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface SupplyRow {
  id: string;
  supplier_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: string | null;
  price: number | null;
  currency: string | null;
  is_available: boolean;
}

interface SupplierRow {
  id: string;
  name: string;
}

interface RankedOffer {
  supplyId: string;
  supplierId: string;
  supplierName: string;
  price: number | null;
  unit: string | null;
  packSize: string | null;
  currency: string;
  isAvailable: boolean;
  score: number;
  isCheapest: boolean;
  isRecommended: boolean;
}

interface ItemGroup {
  name: string;
  category: string | null;
  offers: RankedOffer[];
  supplierCount: number;
  cheapestPrice: number | null;
  highestPrice: number | null;
  savingPct: number | null;
}

/**
 * 媒合信心分數 (0-100):
 *   基礎 70
 *   + 最多 25 依價格競爭力 (最低價得滿分,其餘依 最低價/自身價 等比例縮放)
 *   + 5 若目前可供應 (is_available)
 */
const computeScore = (price: number | null, cheapest: number | null, isAvailable: boolean): number => {
  let score = 70;
  if (price != null && cheapest != null && price > 0) {
    const ratio = Math.min(1, cheapest / price);
    score += Math.round(25 * ratio);
  }
  if (isAvailable) score += 5;
  return Math.max(0, Math.min(100, score));
};

const scoreBadgeClass = (score: number): string => {
  if (score >= 90) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (score >= 80) return 'bg-lime-100 text-lime-800 border-lime-300';
  if (score >= 75) return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
};

const scoreBarClass = (score: number): string => {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-lime-500';
  if (score >= 75) return 'bg-amber-500';
  return 'bg-slate-400';
};

const AdminMatchingPage = () => {
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [suRes, spRes] = await Promise.all([
        (supabase as never)
          .from('supplies')
          .select('id, supplier_id, name, category, unit, pack_size, price, currency, is_available')
          .eq('is_available', true)
          .order('name', { ascending: true }),
        (supabase as never).from('suppliers').select('id, name'),
      ]);
      setSupplies(((suRes as { data: SupplyRow[] | null }).data) ?? []);
      const map: Record<string, string> = {};
      (((spRes as { data: SupplierRow[] | null }).data) ?? []).forEach((s) => {
        map[s.id] = s.name;
      });
      setSupplierMap(map);
      setLoading(false);
    })();
  }, []);

  const groups = useMemo<ItemGroup[]>(() => {
    // group by normalized item name
    const byName = new Map<string, SupplyRow[]>();
    supplies.forEach((s) => {
      const key = (s.name ?? '').trim();
      if (!key) return;
      const arr = byName.get(key);
      if (arr) arr.push(s);
      else byName.set(key, [s]);
    });

    const result: ItemGroup[] = [];
    byName.forEach((rows, name) => {
      const prices = rows.map((r) => r.price).filter((p): p is number => p != null && p > 0);
      const cheapest = prices.length ? Math.min(...prices) : null;
      const highest = prices.length ? Math.max(...prices) : null;

      const offers: RankedOffer[] = rows.map((r) => ({
        supplyId: r.id,
        supplierId: r.supplier_id,
        supplierName: supplierMap[r.supplier_id] ?? '未知供應商',
        price: r.price,
        unit: r.unit,
        packSize: r.pack_size,
        currency: r.currency ?? 'TWD',
        isAvailable: r.is_available,
        score: computeScore(r.price, cheapest, r.is_available),
        isCheapest: cheapest != null && r.price != null && r.price === cheapest,
        isRecommended: false,
      }));

      // rank by score desc; tie-break by cheaper price then supplier name
      offers.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ap = a.price ?? Number.POSITIVE_INFINITY;
        const bp = b.price ?? Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return a.supplierName.localeCompare(b.supplierName);
      });
      if (offers.length) offers[0].isRecommended = true;

      // unique supplier count
      const supplierCount = new Set(rows.map((r) => r.supplier_id)).size;
      const savingPct =
        cheapest != null && highest != null && highest > 0 && highest !== cheapest
          ? Math.round(((highest - cheapest) / highest) * 100)
          : null;

      result.push({
        name,
        category: rows[0]?.category ?? null,
        offers,
        supplierCount,
        cheapestPrice: cheapest,
        highestPrice: highest,
        savingPct,
      });
    });

    // comparable items (>=2 suppliers) first, then by supplier count desc, then name
    result.sort((a, b) => {
      const ac = a.supplierCount >= 2 ? 1 : 0;
      const bc = b.supplierCount >= 2 ? 1 : 0;
      if (ac !== bc) return bc - ac;
      if (a.supplierCount !== b.supplierCount) return b.supplierCount - a.supplierCount;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [supplies, supplierMap]);

  const summary = useMemo(() => {
    const comparable = groups.filter((g) => g.supplierCount >= 2);
    const supplierCount = new Set(supplies.map((s) => s.supplier_id)).size;
    const savings = comparable.map((g) => g.savingPct).filter((p): p is number => p != null);
    const avgSaving = savings.length
      ? Math.round(savings.reduce((a, b) => a + b, 0) / savings.length)
      : 0;
    return {
      comparableCount: comparable.length,
      supplierCount,
      avgSaving,
    };
  }, [groups, supplies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const suppliers = g.offers.map((o) => o.supplierName).join(' ');
      return `${g.name} ${g.category ?? ''} ${suppliers}`.toLowerCase().includes(q);
    });
  }, [groups, search]);

  const fmtPrice = (o: RankedOffer): string => {
    if (o.price == null) return '未報價';
    const sym = o.currency === 'TWD' ? '$' : `${o.currency} `;
    return `${sym}${o.price.toLocaleString()} / ${o.unit ?? '件'}`;
  };

  const summaryCards = [
    { title: '可比價品項數', subtitle: 'Comparable items', value: summary.comparableCount, icon: PackageSearch, accent: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '供應商數', subtitle: 'Active suppliers', value: summary.supplierCount, icon: Store, accent: 'text-blue-600', bg: 'bg-blue-50' },
    { title: '平均可節省', subtitle: 'Avg. potential saving', value: `${summary.avgSaving}%`, icon: PiggyBank, accent: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-800">智慧媒合 (Smart Matching)</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        依價格競爭力與供應狀態,自動排序供應商並計算媒合信心分數,協助您快速找到最佳採購對象
      </p>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {summaryCards.map(({ title, subtitle, value, icon: Icon, accent, bg }) => (
          <Card key={title} className="border border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`inline-flex p-2.5 rounded-lg ${bg}`}>
                <Icon className={`h-5 w-5 ${accent}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${accent}`}>{loading ? '—' : value}</div>
                <div className="text-xs text-slate-500">{title}</div>
                <div className="text-[10px] text-slate-400">{subtitle}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="搜尋品項 / 分類 / 供應商…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Item list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border border-slate-200">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border border-slate-200">
          <CardContent className="py-16 text-center text-slate-400">
            <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>{search.trim() ? '找不到符合的品項 (No matching items)' : '目前沒有可供比價的商品 (No available supplies)'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => (
            <Card key={g.name} className="border border-slate-200">
              <CardContent className="p-4">
                {/* item header */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-base font-semibold text-slate-800">{g.name}</span>
                  {g.category && (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                      {g.category}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      g.supplierCount >= 2
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }
                  >
                    {g.supplierCount} 家供應商
                  </Badge>
                  {g.savingPct != null && g.savingPct > 0 && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      最高可省 {g.savingPct}%
                    </Badge>
                  )}
                </div>

                {/* ranked suppliers */}
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {g.offers.map((o, idx) => (
                    <div
                      key={o.supplyId}
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 ${
                        o.isRecommended ? 'bg-emerald-50/50' : 'bg-white'
                      }`}
                    >
                      {/* rank + supplier */}
                      <div className="flex items-center gap-3 min-w-0 sm:w-64">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-slate-800 truncate">{o.supplierName}</span>
                            {o.isRecommended && (
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1">
                                <Trophy className="h-3 w-3" />推薦
                              </Badge>
                            )}
                          </div>
                          {o.packSize && <div className="text-xs text-slate-400 truncate">{o.packSize}</div>}
                        </div>
                      </div>

                      {/* price */}
                      <div className="flex items-center gap-2 sm:w-48">
                        <span className="text-sm font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          {fmtPrice(o)}
                        </span>
                        {o.isCheapest && o.price != null && (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
                            最低價
                          </Badge>
                        )}
                      </div>

                      {/* confidence score */}
                      <div className="flex items-center gap-2 sm:ml-auto sm:w-52">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${scoreBarClass(o.score)}`}
                            style={{ width: `${o.score}%` }}
                          />
                        </div>
                        <Badge
                          variant="outline"
                          className={`${scoreBadgeClass(o.score)} tabular-nums whitespace-nowrap`}
                          title="媒合信心分數"
                        >
                          {o.score} 分
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminMatchingPage;
