import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  PackageCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/* ------------------------------------------------------------------ *
 * 新資料表不在 types.ts 裡 —— 沿用專案既有的 cast 慣例
 * ------------------------------------------------------------------ */
type PgError = { message: string } | null;

interface QueryBuilder<T> extends PromiseLike<{ data: T[] | null; error: PgError }> {
  select: (cols: string) => QueryBuilder<T>;
  insert: (values: unknown) => QueryBuilder<T>;
  update: (values: unknown) => QueryBuilder<T>;
  eq: (col: string, val: string | number | boolean) => QueryBuilder<T>;
  order: (col: string, opts: { ascending: boolean }) => QueryBuilder<T>;
  limit: (n: number) => QueryBuilder<T>;
  single: () => PromiseLike<{ data: T | null; error: PgError }>;
}

const db = <T,>(table: string): QueryBuilder<T> =>
  (supabase as never as { from: (t: string) => QueryBuilder<T> }).from(table);

/* ------------------------------------------------------------------ */

/** supplier_orders.ingredient_list 的單一品項(欄位都可能缺) */
export interface OrderIngredient {
  name?: string;
  quantity?: string | number;
  unit?: string;
  category?: string;
}

export interface ReceivableOrder {
  id: string;
  status: OrderStatus;
  supplier_id: string | null;
  supplier_name?: string;
  ingredient_list: OrderIngredient[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ReceivableOrder | null;
  /** receive = 正常收貨(預設全部正確);report = 主動回報異常 */
  mode?: "receive" | "report";
  /** 寫入成功後通知外層重新載入 */
  onDone?: () => void;
}

interface ItemState {
  key: string;
  name: string;
  expected: string;
  unit: string;
  ok: boolean;
  actual: string;
  note: string;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** 壓成 1280px / JPEG 0.75 的 base64,避免整張原圖塞進資料庫 */
const fileToCompressedDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const img = new Image();
      img.onerror = () => resolve(raw); // 無法解碼就退回原始 base64
      img.onload = () => {
        try {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(img.width, img.height) || 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(raw);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        } catch {
          resolve(raw);
        }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });

const buildItems = (list: OrderIngredient[] | null): ItemState[] =>
  (Array.isArray(list) ? list : []).map((it, i) => ({
    key: `${i}-${it.name ?? "item"}`,
    name: it.name?.trim() || `品項 ${i + 1}`,
    expected: it.quantity != null && it.quantity !== "" ? String(it.quantity) : "",
    unit: it.unit ?? "",
    ok: true,
    actual: "",
    note: "",
  }));

export default function ReceiveOrderDialog({
  open,
  onOpenChange,
  order,
  mode = "receive",
  onDone,
}: Props) {
  const [items, setItems] = useState<ItemState[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const isReport = mode === "report";

  useEffect(() => {
    if (!open) return;
    setItems(buildItems(order?.ingredient_list ?? null));
    setPhoto(null);
    setPhotoName("");
    setNote("");
    setSaving(false);
    setUploading(false);
  }, [open, order]);

  const diffs = useMemo(
    () =>
      items
        .filter((it) => !it.ok)
        .map((it) => ({
          name: it.name,
          expected: it.expected || null,
          received: it.actual.trim() || null,
          unit: it.unit || null,
          note: it.note.trim() || null,
        })),
    [items],
  );

  // 主動回報異常時,即使品項都勾正確,也算異常(以文字說明為準)
  const hasDiscrepancy = diffs.length > 0 || isReport;
  const canSubmit =
    !saving &&
    !uploading &&
    !!order &&
    (!isReport || diffs.length > 0 || note.trim().length > 0);

  const patchItem = (key: string, patch: Partial<ItemState>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("照片太大", { description: "請上傳 8MB 以內的圖片" });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setPhoto(dataUrl);
      setPhotoName(file.name);
    } catch (e) {
      toast.error("照片讀取失敗", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      // 1. 找這張單最新的出貨紀錄(可能沒有,供應商未建 shipment)
      const { data: shipments } = await db<{ id: string }>("supplier_shipments")
        .select("id")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const shipmentId = shipments?.[0]?.id ?? null;

      // 2. 有照片或有差異才留一筆送貨單紀錄
      let receiptId: string | null = null;
      if (photo || hasDiscrepancy) {
        const { data: receipt, error: receiptError } = await db<{ id: string }>(
          "delivery_receipts",
        )
          .insert({
            order_id: order.id,
            shipment_id: shipmentId,
            image_url: photo,
            ai_parsed: null, // AI 解析由主控端後續接上
            discrepancies: diffs.length > 0 ? diffs : null,
            has_discrepancy: hasDiscrepancy,
            uploaded_by: userId,
          })
          .select("id")
          .single();
        if (receiptError) throw new Error(receiptError.message);
        receiptId = receipt?.id ?? null;
      }

      // 3. 回填出貨紀錄的收貨欄位(沒有 shipment 就略過)
      if (shipmentId) {
        const { error: shipError } = await db("supplier_shipments")
          .update({
            received_at: new Date().toISOString(),
            received_by: userId,
            receive_status: hasDiscrepancy ? "discrepancy" : "ok",
          })
          .eq("id", shipmentId);
        if (shipError) {
          // 不阻斷收貨,只提醒
          toast.warning("出貨紀錄未同步", { description: shipError.message });
        }
      }

      // 4. ★ 狀態一律走事件,不直接 update supplier_orders.status
      await recordOrderEvent({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: hasDiscrepancy ? "discrepancy" : "received",
        actorRole: "restaurant",
        source: "restaurant_portal",
        note: note.trim() || null,
        payload: {
          items_total: items.length,
          discrepancy_count: diffs.length,
          discrepancies: diffs,
          receipt_id: receiptId,
          shipment_id: shipmentId,
          has_photo: !!photo,
        },
      });

      toast.success(hasDiscrepancy ? "已回報收貨異常" : "已確認收貨", {
        description: hasDiscrepancy
          ? "客服會與供應商確認差異,請留意後續通知"
          : "感謝確認,可以接著給這次交易評價",
      });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error("送出失敗", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (saving ? null : onOpenChange(o))}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReport ? (
              <TriangleAlert className="h-5 w-5 text-orange-500" />
            ) : (
              <PackageCheck className="h-5 w-5 text-emerald-600" />
            )}
            {isReport ? "回報收貨異常" : "確認收貨"}
          </DialogTitle>
          <DialogDescription>
            訂單 #{order ? order.id.slice(-8).toUpperCase() : "—"}
            {order?.supplier_name ? ` · ${order.supplier_name}` : ""}
            {isReport
              ? " —— 請說明短缺、錯品或品質問題,我們會介入協調"
              : " —— 請逐項確認實際收到的數量"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 品項核對 */}
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
              這張訂單沒有品項明細,可直接以下方說明回報收貨狀況
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
                <span>品項 · 訂購數量</span>
                <span>收貨核對</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((it) => (
                  <li key={it.key} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{it.name}</p>
                        <p className="text-xs text-slate-400">
                          訂購 {it.expected || "—"}
                          {it.unit}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => patchItem(it.key, { ok: true, actual: "", note: "" })}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            it.ok
                              ? "bg-white text-emerald-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          數量正確
                        </button>
                        <button
                          type="button"
                          onClick={() => patchItem(it.key, { ok: false })}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            !it.ok
                              ? "bg-white text-orange-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          數量不符
                        </button>
                      </div>
                    </div>

                    {!it.ok && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr]">
                        <Input
                          value={it.actual}
                          onChange={(e) => patchItem(it.key, { actual: e.target.value })}
                          placeholder={`實收數量${it.unit ? `(${it.unit})` : ""}`}
                          className="h-9 text-sm"
                        />
                        <Input
                          value={it.note}
                          onChange={(e) => patchItem(it.key, { note: e.target.value })}
                          placeholder="狀況說明,例:短缺 2 箱 / 品項錯誤 / 有壓傷"
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 送貨單照片 */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">送貨單照片(選填)</p>
            {photo ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <img
                  src={photo}
                  alt="送貨單"
                  className="h-16 w-16 rounded-md object-cover border border-slate-100"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">{photoName || "已上傳"}</p>
                  <p className="text-xs text-slate-400">已壓縮存檔,後續會自動比對品項與數量</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-red-600"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoName("");
                  }}
                  aria-label="移除照片"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-700">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {uploading ? "處理中…" : "拍照或選擇送貨單圖片"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handlePhoto(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          {/* 補充說明 */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              補充說明
              {isReport && diffs.length === 0 && <span className="text-orange-600"> *</span>}
            </p>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isReport
                  ? "請描述異常狀況,例:兩箱蔬菜到貨已軟爛、司機未帶送貨單"
                  : "有什麼想告訴供應商的?(選填)"
              }
            />
          </div>

          {/* 結果提示 */}
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              hasDiscrepancy
                ? "bg-orange-50 text-orange-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {hasDiscrepancy ? (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {hasDiscrepancy
                ? `送出後訂單會標記為「收貨有差異」${
                    diffs.length > 0 ? `(${diffs.length} 項不符)` : ""
                  },由客服協助處理`
                : "送出後訂單會標記為「已收貨」,並開放給這次交易評價"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={
              hasDiscrepancy
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {saving ? "送出中…" : hasDiscrepancy ? "送出異常回報" : "確認已收到貨"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
