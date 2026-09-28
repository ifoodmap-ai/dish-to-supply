-- =====================================================================
-- Rollback:20260928190000_restaurant_draft_approval.sql
--
-- 拿掉「送出類事件要老闆/店長簽核」的 trigger,並把 supplier_orders 的 INSERT policy
-- 還原成 20260726120000_restaurant_order_rls.sql 的版本(成員可直接建 draft 或 submitted),再刪掉 ledger。
-- ⚠️ 還原後資料庫不再擋「採購員自己送出草稿」—— 只剩前端擋(草稿只出現在叫貨分頁的待簽核區)。
-- 不動任何資料列:已經送出/被擋下的單都維持原狀。
--
-- 若 20260928190100 已套用,要先跑 20260928190100_restaurant_order_update_guard.down.sql 再跑這支。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- 順序反了會留下一支沒掛 trigger 的 guard_order_submission(190100.down 會把它重建回來),直接擋掉
DO $$
BEGIN
  IF to_regprocedure('public.guard_order_update()') IS NOT NULL THEN
    RAISE EXCEPTION '請先跑 20260928190100_restaurant_order_update_guard.down.sql,再跑這支';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_submission ON public.order_events;
DROP FUNCTION IF EXISTS public.guard_order_submission();

DROP POLICY IF EXISTS "restaurant_create_own_orders" ON public.supplier_orders;
CREATE POLICY "restaurant_create_own_orders" ON public.supplier_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IN (SELECT public.current_restaurant_ids())
    AND status IN ('draft','submitted')
  );

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928190000';

NOTIFY pgrst, 'reload schema';
