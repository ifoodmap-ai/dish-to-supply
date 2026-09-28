-- =====================================================================
-- Rollback:20260928190300_order_pipeline_select_only.sql
--
-- 還原成 190200 套用後的權限:authenticated 有 SELECT,PostgreSQL 17 以上再加回 MAINTAIN;並刪掉 ledger。
-- 要再往前退,接著跑 20260928190200_order_pipeline_security_invoker.down.sql。不動任何資料列。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

GRANT SELECT ON public.order_pipeline TO authenticated;
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'GRANT MAINTAIN ON public.order_pipeline TO authenticated';
  END IF;
END;
$$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928190300';

NOTIFY pgrst, 'reload schema';
