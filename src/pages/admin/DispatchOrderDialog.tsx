// 管理員「派給…」對話框(業主拍板後台精簡 Q2-A):看板上待派發的單一鍵派給供應商。
//
// - 候選供應商的排序直接重用「供應商比價」同一套演算法 src/lib/api.ts 的 matchSuppliers()
//   (基礎 70 + 價格競爭力 ≤25 + 可供應 5;同分比上架品項數),不另寫一套。
//   沒有上架這些品項的啟用中供應商排在後面(沒有分數),管理員仍可以指定。
// - 派單只寫一筆事件(recordOrderEvent,submitted/pending/rejected/expired → dispatched),
//   payload.supplier_id 由資料庫 trigger(20260929100100)在同一個交易裡寫到訂單上;
//   notify 會寄「新訂單待接單」給供應商(經過寄信閘門:NOTIFY_LIVE 沒開就只寄內部測試信箱)。
// - 失敗照實顯示資料庫的訊息;畫面過期(別人剛派過)就通知看板重抓。

import { useEffect, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { matchSuppliers, type MatchedSupplier } from "@/lib/api";
import { isStaleOrderError, recordOrderEvent, type OrderStatus } from "@/lib/orders";
import { formatOrderNo } from "@/lib/order-number";

export interface DispatchTarget {
  id: string;
  status: OrderStatus;
  supplier_id: string | null;
  restaurantName?: string | null;
}

interface Candidate {
  id: string;
  name: string;
  score: number | null;
  matchedCount: number;
  items: MatchedSupplier["items"];
  serviceAreas: string[];
}

type Res<T> = { data: T | null; error: { message: string } | null };
interface Chain<T> extends PromiseLike<Res<T[]>> {
  eq(col: string, v: unknown): Chain<T>;
  maybeSingle(): PromiseLike<Res<T>>;
}
const table = <T,>(name: string) =>
  (supabase as never as { from: (t: string) => { select: (c: string) => Chain<T> } }).from(name);

interface Props {
  order: DispatchTarget | null;
  onClose: () => void;
  /** 派單成功、或發現畫面過期時呼叫,讓上層重抓 */
  onChanged: () => void;
}

export default function DispatchOrderDialog({ order, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySupplier, setBusySupplier] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setMatchError(null);
      setCandidates([]);

      const [orderRes, activeRes] = await Promise.all([
        table<{ ingredient_list: { name?: string }[] | null }>("supplier_orders")
          .select("ingredient_list")
          .eq("id", order.id)
          .maybeSingle(),
        table<{ id: string; name: string; service_areas: string[] | null }>("suppliers")
          .select("id, name, service_areas")
          .eq("is_active", true),
      ]);
      const names = (Array.isArray(orderRes.data?.ingredient_list) ? orderRes.data!.ingredient_list : [])
        .map((i) => (i?.name ?? "").trim())
        .filter(Boolean);

      let ranked: MatchedSupplier[] = [];
      if (names.length > 0) {
        try {
          ranked = (await matchSuppliers(names)).suppliers;
        } catch (e) {
          if (!cancelled) setMatchError(e instanceof Error ? e.message : "比價失敗");
        }
      }
      if (cancelled) return;

      const rankedIds = new Set(ranked.map((m) => m.supplier.id));
      const others: Candidate[] = (activeRes.data ?? [])
        .filter((s) => !rankedIds.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))
        .map((s) => ({ id: s.id, name: s.name, score: null, matchedCount: 0, items: [], serviceAreas: s.service_areas ?? [] }));

      setItemNames(names);
      setCandidates([
        ...ranked.map((m) => ({
          id: m.supplier.id,
          name: m.supplier.name,
          score: m.score,
          matchedCount: m.matchedCount,
          items: m.items,
          serviceAreas: m.supplier.service_areas ?? [],
        })),
        ...others,
      ]);
      if (activeRes.error) setError(`讀取供應商失敗:${activeRes.error.message}`);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  const dispatchTo = async (c: Candidate) => {
    if (!order) return;
    setBusySupplier(c.id);
    setError(null);
    try {
      await recordOrderEvent({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "dispatched",
        actorRole: "admin",
        source: "admin_portal",
        note: c.score != null ? `派給 ${c.name}(比價分數 ${c.score})` : `派給 ${c.name}`,
        payload: {
          supplier_id: c.id,
          match_score: c.score,
          matched_count: c.matchedCount,
          requested_count: itemNames.length,
        },
      });
      toast.success(`訂單 ${formatOrderNo(order.id)} 已派給 ${c.name}`, {
        description: "系統會寄「新訂單待接單」通知信給供應商",
      });
      onChanged();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "派單失敗";
      setError(message);
      toast.error("派單失敗", { description: message });
      if (isStaleOrderError(e)) onChanged();
    } finally {
      setBusySupplier(null);
    }
  };

  const previous = order?.supplier_id ?? null;
  const redispatch = order ? order.status === "rejected" || order.status === "expired" : false;

  return (
    <Dialog open={!!order} onOpenChange={(open) => (!open && !busySupplier ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {redispatch ? "改派" : "派單"} {order ? formatOrderNo(order.id) : ""}
            {order?.restaurantName ? ` — ${order.restaurantName}` : ""}
          </DialogTitle>
          <DialogDescription>
            依「供應商比價」同一套分數排序(價格越有競爭力、上架越多品項越前面)。派單後會通知供應商接單。
          </DialogDescription>
        </DialogHeader>

        {order?.status === "expired" && previous && (
          // 逾時是排程自動標的,原供應商不一定知道;改派後 supplier_id 換人,原供應商就看不到這張單了
          <p data-testid="redispatch-expired-warning" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            這張單是逾時交回平台的,原供應商可能還在備貨或已經出貨。改派之後原供應商就看不到這張單,請先聯絡原供應商確認不要出貨。
          </p>
        )}
        {itemNames.length > 0 && (
          <p className="text-xs text-slate-500">
            品項:{itemNames.slice(0, 8).join("、")}
            {itemNames.length > 8 ? ` …共 ${itemNames.length} 項` : ""}
          </p>
        )}
        {matchError && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            比價分數算不出來({matchError}),下面照名稱列出所有啟用中的供應商
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在比價…
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">目前沒有啟用中的供應商可以派單</p>
        ) : (
          <ol className="space-y-2" aria-label="候選供應商">
            {candidates.map((c, index) => (
              <li
                key={c.id}
                data-testid={`candidate-${c.id}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.score != null ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        比價分數 {c.score}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                        沒有上架這些品項
                      </Badge>
                    )}
                    {index === 0 && c.score != null && (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        <Sparkles className="mr-1 h-3 w-3" />
                        推薦
                      </Badge>
                    )}
                    {previous === c.id && redispatch && (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
                        {order?.status === "rejected" ? "剛拒絕這張單" : "上次沒有回應"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.score != null ? `上架 ${c.matchedCount}/${itemNames.length} 項` : "—"}
                    {c.serviceAreas.length > 0 ? ` · 服務 ${c.serviceAreas.slice(0, 3).join("、")}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!!busySupplier}
                  onClick={() => dispatchTo(c)}
                  className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
                  aria-label={`派給 ${c.name}`}
                >
                  {busySupplier === c.id ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  派給這家
                </Button>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
