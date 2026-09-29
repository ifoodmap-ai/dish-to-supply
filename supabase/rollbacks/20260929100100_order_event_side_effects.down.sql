-- =====================================================================
-- Rollback:20260929100100_order_event_side_effects.sql
--
-- 拿掉「派單寫 supplier_id、報價寫 total_amount + order_quotes、出貨新增 supplier_shipments」的 AFTER trigger,
-- 再刪掉 ledger。不動任何資料列:已經寫進去的供應商、金額、報價、出貨紀錄都維持原狀。
--
-- ⚠️ 還原後,供應商訂單頁的「報價」只會把訂單推到「已報價」,金額不會再寫到訂單上(餐廳看不到報價金額);
--    管理員「派給…」也不會再把供應商寫到訂單上。要還原這支,請先把前端退回 SupplierOrdersPage / AdminPipelinePage
--    改版之前的版本,或接受這段期間的報價與派單要人工補資料。
-- 還原順序:20260929100200.down → 這支 → 20260929100000_order_transition_rules.down.sql。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- 20260929100200 還在的話要先還原它(它讓老闆/店長不能直接改供應商與金額,前提是這支 trigger 會寫)
DO $$
BEGIN
  IF to_regprocedure('public.guard_order_update()') IS NOT NULL
     AND pg_get_functiondef(to_regprocedure('public.guard_order_update()')) LIKE '%order_supplier_via_dispatch%' THEN
    RAISE EXCEPTION '請先跑 20260929100200_order_integrity_hardening.down.sql,再跑這支';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_order_event_details ON public.order_events;
DROP FUNCTION IF EXISTS public.apply_order_event_details();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929100100';

NOTIFY pgrst, 'reload schema';
