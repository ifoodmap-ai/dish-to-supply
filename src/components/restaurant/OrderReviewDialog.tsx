import { useEffect, useState } from "react";
import { Loader2, Star, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordOrderEvent, type OrderStatus } from "@/lib/orders";

/* 新資料表不在 types.ts 裡 —— 沿用專案既有的 cast 慣例 */
type PgError = { message: string } | null;

interface QueryBuilder<T> extends PromiseLike<{ data: T[] | null; error: PgError }> {
  select: (cols: string) => QueryBuilder<T>;
  insert: (values: unknown) => QueryBuilder<T>;
  eq: (col: string, val: string | number | boolean) => QueryBuilder<T>;
  limit: (n: number) => QueryBuilder<T>;
}

const db = <T,>(table: string): QueryBuilder<T> =>
  (supabase as never as { from: (t: string) => QueryBuilder<T> }).from(table);

export interface ReviewableOrder {
  id: string;
  status: OrderStatus;
  supplier_id: string | null;
  supplier_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ReviewableOrder | null;
  restaurantId: string;
  onDone?: () => void;
}

interface Scores {
  overall: number;
  ontime: number;
  quality: number;
  accuracy: number;
}

const EMPTY_SCORES: Scores = { overall: 0, ontime: 0, quality: 0, accuracy: 0 };

const SCORE_FIELDS: { key: keyof Scores; label: string; hint: string }[] = [
  { key: "overall", label: "整體滿意度", hint: "這次合作的總體感受" },
  { key: "ontime", label: "準時度", hint: "是否照約定時間送達" },
  { key: "quality", label: "商品品質", hint: "新鮮度、規格是否符合期待" },
  { key: "accuracy", label: "數量正確度", hint: "品項與數量是否無誤" },
];

const StarRow = ({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      <p className="text-xs text-slate-400">{hint}</p>
    </div>
    <div className="flex shrink-0 gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${label} ${n} 星`}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={`h-6 w-6 ${
              n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"
            }`}
          />
        </button>
      ))}
    </div>
  </div>
);

export default function OrderReviewDialog({
  open,
  onOpenChange,
  order,
  restaurantId,
  onDone,
}: Props) {
  const [step, setStep] = useState<"review" | "nps">("review");
  const [scores, setScores] = useState<Scores>(EMPTY_SCORES);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  /** 這間餐廳先前已留下的評價筆數 —— 決定要不要追問 NPS */
  const [priorReviews, setPriorReviews] = useState(0);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [npsReason, setNpsReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("review");
    setScores(EMPTY_SCORES);
    setComment("");
    setSaving(false);
    setNpsScore(null);
    setNpsReason("");

    let cancelled = false;
    (async () => {
      const { data } = await db<{ id: string }>("order_reviews")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .limit(20);
      if (!cancelled) setPriorReviews(data?.length ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, restaurantId]);

  const setScore = (key: keyof Scores, v: number) =>
    setScores((prev) => ({ ...prev, [key]: v }) as Scores);

  const handleSubmitReview = async () => {
    if (!order || scores.overall === 0) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await db("order_reviews").insert({
        order_id: order.id,
        restaurant_id: restaurantId,
        supplier_id: order.supplier_id,
        rating_overall: scores.overall,
        // 未填的細項沿用整體評分,避免統計出現 0 分
        rating_ontime: scores.ontime || scores.overall,
        rating_quality: scores.quality || scores.overall,
        rating_accuracy: scores.accuracy || scores.overall,
        comment: comment.trim() || null,
        reviewer_id: user?.id ?? null,
      });
      if (error) throw new Error(error.message);

      // ★ 狀態一律走事件,不直接 update supplier_orders.status
      await recordOrderEvent({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "reviewed",
        actorRole: "restaurant",
        source: "restaurant_portal",
        note: comment.trim() || null,
        payload: {
          rating_overall: scores.overall,
          rating_ontime: scores.ontime || scores.overall,
          rating_quality: scores.quality || scores.overall,
          rating_accuracy: scores.accuracy || scores.overall,
          supplier_id: order.supplier_id,
        },
      });

      toast.success("感謝您的評價", {
        description: "評分會回饋到供應商的服務分數",
      });
      onDone?.();

      // 第 2 次(含)以上評價才追問 NPS
      if (priorReviews >= 1) {
        setStep("nps");
      } else {
        onOpenChange(false);
      }
    } catch (e) {
      toast.error("評價送出失敗", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitNps = async () => {
    if (npsScore == null) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await db("nps_responses").insert({
        user_id: user?.id ?? null,
        audience: "restaurant",
        score: npsScore,
        reason: npsReason.trim() || null,
        context: `order_review:${order?.id ?? ""}`,
      });
      if (error) throw new Error(error.message);

      toast.success("已收到您的回饋", { description: "這會幫我們把服務做得更好" });
      onOpenChange(false);
    } catch (e) {
      toast.error("回饋送出失敗", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const npsColor = (n: number) => {
    if (npsScore !== n) return "bg-white text-slate-600 border-slate-200 hover:border-slate-400";
    if (n <= 6) return "bg-red-500 text-white border-red-500";
    if (n <= 8) return "bg-amber-500 text-white border-amber-500";
    return "bg-emerald-600 text-white border-emerald-600";
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (saving ? null : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        {step === "review" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                為這次交易評價
              </DialogTitle>
              <DialogDescription>
                訂單 #{order ? order.id.slice(-8).toUpperCase() : "—"}
                {order?.supplier_name ? ` · ${order.supplier_name}` : ""}
                {" —— 您的評分只會以彙整分數呈現給供應商"}
              </DialogDescription>
            </DialogHeader>

            <div className="divide-y divide-slate-100">
              {SCORE_FIELDS.map((f) => (
                <StarRow
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  value={scores[f.key]}
                  onChange={(v) => setScore(f.key, v)}
                />
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">評語(選填)</p>
              <Textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="例:出貨很準時,魚貨新鮮度穩定,下次還會再訂"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                稍後再說
              </Button>
              <Button
                onClick={handleSubmitReview}
                disabled={saving || scores.overall === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {saving ? "送出中…" : "送出評價"}
              </Button>
            </DialogFooter>
            {scores.overall === 0 && (
              <p className="text-center text-xs text-slate-400">請至少給「整體滿意度」評分</p>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 text-emerald-600" />
                再一題就好
              </DialogTitle>
              <DialogDescription>
                0 分代表完全不會,10 分代表非常願意
              </DialogDescription>
            </DialogHeader>

            <div className="py-1">
              <p className="mb-3 text-sm font-medium text-slate-800">
                您有多願意把 iFoodmap 推薦給同業?
              </p>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }).map((_, n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNpsScore(n)}
                    className={`rounded-md border py-2 text-sm font-medium transition-colors ${npsColor(n)}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>完全不會</span>
                <span>非常願意</span>
              </div>

              <div className="mt-4">
                <p className="mb-1.5 text-sm font-medium text-slate-700">主要原因(選填)</p>
                <Textarea
                  rows={3}
                  value={npsReason}
                  onChange={(e) => setNpsReason(e.target.value)}
                  placeholder="哪一點最有幫助?哪裡還可以更好?"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                先跳過
              </Button>
              <Button
                onClick={handleSubmitNps}
                disabled={saving || npsScore == null}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {saving ? "送出中…" : "送出回饋"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
