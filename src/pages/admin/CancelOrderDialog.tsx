// 管理員「取消訂單」對話框(業主拍板 F5):卡住的單(待接單、待報價、待餐廳確認、待出貨、已出貨、運送中)
// 管理員可以取消,一定要填原因 —— 原因寫進事件備註(履歷保留);notify 寄給雙方的信也附上原因(經寄信閘門)。
// 只寫一筆 recordOrderEvent(→ cancelled);資料庫 guard_order_transition 也要求進行中的單取消要有原因。

import { useEffect, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
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
import { ORDER_STATUS, isStaleOrderError, recordOrderEvent, type OrderStatus } from "@/lib/orders";
import { formatOrderNo } from "@/lib/order-number";

/** 這些狀態的單,供應商可能已經在備貨或貨已在路上:取消時提醒管理員另外打電話(通知信不一定送得到) */
const SUPPLIER_MAY_BE_WORKING: OrderStatus[] = ["confirmed", "shipped", "in_transit"];

/**
 * 要不要提醒打電話給供應商:待出貨、已出貨、運送中一定要;逾時的單如果已經派給供應商也要 ——
 * 逾時是排程自動標的,原供應商不一定知道(可能是待出貨時逾時,還在備貨),而且從逾時取消不會寄信
 */
const shouldCallSupplier = (order: CancelTarget): boolean =>
  SUPPLIER_MAY_BE_WORKING.includes(order.status) || (order.status === "expired" && !!order.supplier_id);

export interface CancelTarget {
  id: string;
  status: OrderStatus;
  /** 派給哪家供應商(逾時的單要不要提醒打電話看這個) */
  supplier_id?: string | null;
}

interface Props {
  order: CancelTarget | null;
  onClose: () => void;
  /** 取消成功、或發現畫面過期時呼叫,讓上層重抓 */
  onChanged: () => void;
}

export default function CancelOrderDialog({ order, onClose, onChanged }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setReason("");
    setError(null);
    setBusy(false);
  }, [order]);

  const submit = async () => {
    if (!order) return;
    const r = reason.trim();
    if (!r) {
      setError("請填寫取消原因(會留在履歷,也會附在通知信裡)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordOrderEvent({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "cancelled",
        actorRole: "admin",
        source: "admin_portal",
        note: r,
        payload: { reason: r },
      });
      // 不寫「已通知」:正式寄信還沒開放前通知信只寄內部測試信箱,供應商沒填信箱時也不會寄 —— 別讓管理員以為對方已經知道
      toast.success(`訂單 ${formatOrderNo(order.id)} 已取消`, { description: "原因已記在履歷,供應商後台會顯示取消原因" });
      onChanged();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "取消失敗";
      setError(message);
      toast.error("取消失敗", { description: message });
      if (isStaleOrderError(e)) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const label = order ? ORDER_STATUS[order.status]?.label ?? order.status : "";

  return (
    <Dialog open={!!order} onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            取消訂單 {order ? formatOrderNo(order.id) : ""}
          </DialogTitle>
          <DialogDescription>
            這張單目前是「{label}」。取消後不會再進行,履歷會保留;原因會記在履歷與通知信裡。
          </DialogDescription>
        </DialogHeader>
        {order && shouldCallSupplier(order) && (
          <p data-testid="cancel-call-supplier" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            供應商可能已經在備貨或送貨,請另外打電話給供應商,確認不要再出貨或送達。
          </p>
        )}
        <div className="space-y-2">
          <label htmlFor="admin-cancel-reason" className="text-sm font-medium text-slate-700">
            取消原因(必填)
          </label>
          <Textarea
            id="admin-cancel-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如:供應商超過兩天沒有回應,餐廳改向其他通路叫貨"
          />
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            先不要
          </Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={submit} disabled={busy || !reason.trim()}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            確定取消訂單
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
