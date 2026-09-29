-- =====================================================================
-- Rollback:20260929100300_shipment_receipt_columns.sql
--
-- 把 supplier_shipments 的 UPDATE 權限還原成表層級(anon、authenticated 都有,跟 Supabase 預設與套用前相同),
-- 重建 20260726120000 的 restaurant_insert_shipment_on_receipt,再刪掉 ledger。不動任何資料列。
-- ⚠️ 還原後餐廳成員又能改寫整列出貨紀錄、自己新增出貨紀錄(見 migration 檔頭)。前端不用跟著退版。
-- 還原順序:先跑這支,再跑 20260929100200、100100、100000 的 .down.sql。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

REVOKE UPDATE (received_at, received_by, receive_status) ON public.supplier_shipments FROM authenticated;
GRANT UPDATE ON public.supplier_shipments TO anon, authenticated;

DROP POLICY IF EXISTS "restaurant_insert_shipment_on_receipt" ON public.supplier_shipments;
CREATE POLICY "restaurant_insert_shipment_on_receipt" ON public.supplier_shipments
  FOR INSERT TO authenticated
  WITH CHECK (order_id IN (
    SELECT id FROM public.supplier_orders
     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
  ));

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929100300';

NOTIFY pgrst, 'reload schema';
