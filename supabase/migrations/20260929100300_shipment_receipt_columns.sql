-- =====================================================================
-- 出貨紀錄:餐廳只能回填收貨欄位(接續 20260929100200;2026-09-29 程式審查複驗的發現)
--
-- 發現的問題:
--   出貨紀錄(supplier_shipments)現在由供應商的「出貨」事件寫(20260929100100 的 trigger),
--   但 20260726120000 的兩條 policy 還讓任何餐廳成員(含採購員):
--     - restaurant_confirm_receipt(UPDATE):改寫整列 —— 出貨時間、供應商、物流、確認人都能改成假的
--     - restaurant_insert_shipment_on_receipt(INSERT):自己新增一筆掛別家供應商的假出貨紀錄
--   結果供應商訂單頁那張單的出貨資訊會消失或變成假的,收貨對話框也會把送貨單連到假的那一列。
--
-- 做法:
--   - supplier_shipments 的 UPDATE 權限改成欄位層級:authenticated 只能改 received_at / received_by / receive_status
--     (收貨對話框 ReceiveOrderDialog 只寫這三欄);anon 不再有 UPDATE。
--     列的範圍仍由 restaurant_confirm_receipt 管(只有自己店的單),這條 policy 不動。
--   - 拿掉 restaurant_insert_shipment_on_receipt:前端沒有任何地方由餐廳新增出貨紀錄
--     (收貨對話框找不到出貨紀錄時是略過,不補建)。
--   事件 trigger(SECURITY DEFINER,擁有者身分)與 admin_delete_order 不受欄位權限影響。
--   ⚠️ 管理員經由 API(authenticated + admin JWT)也只剩這三欄可改;後台目前沒有任何改出貨紀錄的畫面。
--
-- 還原:supabase/rollbacks/20260929100300_shipment_receipt_columns.down.sql(先於 100200 還原)
-- 測試:supabase/tests/database/shipment_receipt_columns.test.sql
-- =====================================================================

SET LOCAL lock_timeout = '3s';

REVOKE UPDATE ON public.supplier_shipments FROM anon, authenticated;
GRANT UPDATE (received_at, received_by, receive_status) ON public.supplier_shipments TO authenticated;

DROP POLICY IF EXISTS "restaurant_insert_shipment_on_receipt" ON public.supplier_shipments;

NOTIFY pgrst, 'reload schema';
