import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Loader2,
  MessageSquareOff,
  PackageCheck,
  Star,
  Timer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';

interface OrderReviewRow {
  id: string;
  order_id: string;
  restaurant_id: string | null;
  rating_overall: number | null;
  rating_ontime: number | null;
  rating_quality: number | null;
  rating_accuracy: number | null;
  comment: string | null;
  created_at: string;
}

interface LegacyReviewRow {
  id: string;
  rating: number | null;
  comment: string | null;
  reviewer_name: string | null;
  created_at: string;
}

interface MetricsRow {
  supplier_id: string;
  orders_total: number | null;
  ontime_rate: number | null;
  shortage_rate: number | null;
  avg_reply_minutes: number | null;
  avg_rating: number | null;
  computed_at: string | null;
}

interface RestaurantRow {
  id: string;
  name: string;
}

type ReviewKind = 'order' | 'store';

interface MergedReview {
  id: string;
  kind: ReviewKind;
  rating: number | null;
  ontime: number | null;
  quality: number | null;
  accuracy: number | null;
  comment: string | null;
  who: string;
  created_at: string;
}

const kindMeta: Record<ReviewKind, { label: string; className: string }> = {
  order: { label: '交易評價', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  store: { label: '商店評價', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/** 比率欄位可能存 0~1 或 0~100,統一轉成百分比 */
const asPercent = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return n <= 1 ? n * 100 : n;
};

const formatMinutes = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Math.round(Number(v));
  if (n < 60) return `${n} 分鐘`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
};

const avg = (nums: number[]) =>
  nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  const filled = value != null ? Math.round(value) : 0;
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= filled ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
        />
      ))}
    </span>
  );
}

function ScoreLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="flex items-center gap-2">
        <Stars value={value} size={13} />
        <span className="text-sm font-medium text-gray-800 tabular-nums w-8 text-right">
          {value != null ? value.toFixed(1) : '—'}
        </span>
      </span>
    </div>
  );
}

export default function SupplierReviewsPage() {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [orderReviews, setOrderReviews] = useState<OrderReviewRow[]>([]);
  const [legacyReviews, setLegacyReviews] = useState<LegacyReviewRow[]>([]);
  const [metrics, setMetrics] = useState<MetricsRow | null>(null);
  const [restaurants, setRestaurants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | ReviewKind>('all');

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

      const [orderRes, legacyRes, metricsRes, restaurantRes] = await Promise.all([
        (supabase as never)
          .from('order_reviews')
          .select(
            'id, order_id, restaurant_id, rating_overall, rating_ontime, rating_quality, rating_accuracy, comment, created_at',
          )
          .eq('supplier_id', sid)
          .order('created_at', { ascending: false }) as Promise<{
          data: OrderReviewRow[] | null;
        }>,
        (supabase as never)
          .from('supplier_reviews')
          .select('id, rating, comment, reviewer_name, created_at')
          .eq('supplier_id', sid)
          .order('created_at', { ascending: false }) as Promise<{
          data: LegacyReviewRow[] | null;
        }>,
        (supabase as never)
          .from('supplier_metrics')
          .select('*')
          .eq('supplier_id', sid)
          .maybeSingle() as Promise<{ data: MetricsRow | null }>,
        (supabase as never).from('restaurants').select('id, name') as Promise<{
          data: RestaurantRow[] | null;
        }>,
      ]);

      setOrderReviews(orderRes.data ?? []);
      setLegacyReviews(legacyRes.data ?? []);
      setMetrics(metricsRes.data ?? null);

      const map: Record<string, string> = {};
      (restaurantRes.data ?? []).forEach((r) => {
        map[r.id] = r.name;
      });
      setRestaurants(map);
      setLoading(false);
    })();
  }, []);

  const merged: MergedReview[] = useMemo(() => {
    const fromOrders: MergedReview[] = orderReviews.map((r) => ({
      id: `order-${r.id}`,
      kind: 'order',
      rating: r.rating_overall,
      ontime: r.rating_ontime,
      quality: r.rating_quality,
      accuracy: r.rating_accuracy,
      comment: r.comment,
      who: (r.restaurant_id && restaurants[r.restaurant_id]) || '餐廳買家',
      created_at: r.created_at,
    }));
    const fromLegacy: MergedReview[] = legacyReviews.map((r) => ({
      id: `store-${r.id}`,
      kind: 'store',
      rating: r.rating,
      ontime: null,
      quality: null,
      accuracy: null,
      comment: r.comment,
      who: r.reviewer_name?.trim() || '匿名買家',
      created_at: r.created_at,
    }));
    return [...fromOrders, ...fromLegacy].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [orderReviews, legacyReviews, restaurants]);

  const summary = useMemo(() => {
    const allRatings = merged
      .map((r) => (r.rating != null ? Number(r.rating) : NaN))
      .filter((n) => Number.isFinite(n));

    const dist = [0, 0, 0, 0, 0]; // index 0 = 1 星
    allRatings.forEach((n) => {
      const i = Math.min(5, Math.max(1, Math.round(n))) - 1;
      dist[i] += 1;
    });

    const num = (v: number | null) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    const pick = (key: keyof OrderReviewRow) =>
      avg(
        orderReviews
          .map((r) => num(r[key] as number | null))
          .filter((n): n is number => n != null),
      );

    return {
      overall: avg(allRatings),
      count: allRatings.length,
      dist,
      maxDist: Math.max(1, ...dist),
      ontime: pick('rating_ontime'),
      quality: pick('rating_quality'),
      accuracy: pick('rating_accuracy'),
      orderCount: orderReviews.length,
      storeCount: legacyReviews.length,
    };
  }, [merged, orderReviews, legacyReviews]);

  const visible = merged.filter((r) => tab === 'all' || r.kind === tab);

  const ontimeRate = asPercent(metrics?.ontime_rate);
  const shortageRate = asPercent(metrics?.shortage_rate);

  const metricCards = [
    {
      label: '準時率',
      value: ontimeRate != null ? `${ontimeRate.toFixed(0)}%` : '—',
      icon: Clock,
      accent: ontimeRate != null && ontimeRate < 80 ? 'text-red-600' : 'text-emerald-600',
      bg: ontimeRate != null && ontimeRate < 80 ? 'bg-red-50' : 'bg-emerald-50',
    },
    {
      label: '短少率',
      value: shortageRate != null ? `${shortageRate.toFixed(0)}%` : '—',
      icon: PackageCheck,
      accent: shortageRate != null && shortageRate > 5 ? 'text-red-600' : 'text-emerald-600',
      bg: shortageRate != null && shortageRate > 5 ? 'bg-red-50' : 'bg-emerald-50',
    },
    {
      label: '平均回覆時間',
      value: formatMinutes(metrics?.avg_reply_minutes),
      icon: Timer,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
    },
    {
      label: '累計訂單數',
      value: metrics?.orders_total != null ? String(metrics.orders_total) : '—',
      icon: PackageCheck,
      accent: 'text-slate-700',
      bg: 'bg-slate-100',
    },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">我的評價</h1>
      <p className="text-sm text-gray-500 mb-6">
        買家對你的交易評分與商店評價,以及平台計算的服務指標
      </p>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500" size={28} />
        </div>
      ) : !supplierId ? (
        <div className="text-center py-20 text-gray-400">此帳號尚未綁定供應商</div>
      ) : (
        <div className="space-y-4">
          {/* 評分摘要 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="border-gray-200">
              <CardContent className="p-5 flex flex-col items-center justify-center h-full">
                <div className="text-4xl font-bold text-gray-900 tabular-nums">
                  {summary.overall != null ? summary.overall.toFixed(1) : '—'}
                </div>
                <Stars value={summary.overall} size={16} />
                <p className="text-xs text-gray-500 mt-2">
                  共 {summary.count} 則評價
                  {summary.count > 0 && (
                    <span className="text-gray-400">
                      (交易 {summary.orderCount}·商店 {summary.storeCount})
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-700">分項平均(交易評價)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <ScoreLine label="準時" value={summary.ontime} />
                <ScoreLine label="品質" value={summary.quality} />
                <ScoreLine label="數量正確" value={summary.accuracy} />
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-700">星等分布</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = summary.dist[star - 1];
                  const pct = (count / summary.maxDist) * 100;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-6 tabular-nums">{star} 星</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-6 text-right tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* 平台服務指標 */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-700">
                服務指標
                {metrics?.computed_at && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    統計於 {formatDate(metrics.computed_at)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {metricCards.map(({ label, value, icon: Icon, accent, bg }) => (
                  <div key={label} className="rounded-lg border border-gray-200 p-3">
                    <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                      <Icon className={`h-4 w-4 ${accent}`} />
                    </div>
                    <div className={`text-xl font-bold tabular-nums ${accent}`}>{value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {!metrics && (
                <p className="text-xs text-gray-400 mt-3">
                  平台尚未產生你的服務指標,累積足夠訂單後會自動計算。
                </p>
              )}
            </CardContent>
          </Card>

          {/* 評價列表 */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <CardTitle className="text-base text-slate-700">評價紀錄</CardTitle>
                <Tabs
                  value={tab}
                  onValueChange={(v) => setTab(v as 'all' | ReviewKind)}
                  className="sm:ml-auto"
                >
                  <TabsList>
                    <TabsTrigger value="all">全部 {merged.length}</TabsTrigger>
                    <TabsTrigger value="order">交易評價 {summary.orderCount}</TabsTrigger>
                    <TabsTrigger value="store">商店評價 {summary.storeCount}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {visible.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <MessageSquareOff size={40} className="mx-auto mb-3 opacity-40" />
                  <p>{merged.length === 0 ? '目前還沒有收到任何評價' : '這個分類還沒有評價'}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visible.map((r) => (
                    <div key={r.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <Stars value={r.rating} />
                        <span className="text-sm font-medium text-gray-800 tabular-nums">
                          {r.rating != null ? Number(r.rating).toFixed(1) : '—'}
                        </span>
                        <Badge variant="outline" className={kindMeta[r.kind].className}>
                          {kindMeta[r.kind].label}
                        </Badge>
                        <span className="text-sm text-gray-500">{r.who}</span>
                        <span className="text-xs text-gray-400 ml-auto">
                          {formatDate(r.created_at)}
                        </span>
                      </div>

                      {r.kind === 'order' && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-1.5">
                          <span>準時 {r.ontime != null ? Number(r.ontime).toFixed(1) : '—'}</span>
                          <span>品質 {r.quality != null ? Number(r.quality).toFixed(1) : '—'}</span>
                          <span>
                            數量正確 {r.accuracy != null ? Number(r.accuracy).toFixed(1) : '—'}
                          </span>
                        </div>
                      )}

                      {r.comment?.trim() ? (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.comment}</p>
                      ) : (
                        <p className="text-sm text-gray-300">（未留下評語）</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
