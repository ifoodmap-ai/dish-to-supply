-- =====================================================================
-- Rollback:20260928190200_order_pipeline_security_invoker.sql
--
-- 把 order_pipeline 還原成套用前:用擁有者(postgres)權限跑、anon / authenticated 有全部權限,並刪掉 ledger。
-- ⚠️ 還原後又回到:任何人(含未登入)都能經由這個檢視讀取所有進行中訂單、而且能新增/修改/刪除訂單(繞過 RLS)。
-- 跟 20260928190000 / 190100 互不相依,單獨退也可以。不動任何資料列。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

ALTER VIEW public.order_pipeline RESET (security_invoker);

GRANT ALL ON public.order_pipeline TO anon;
GRANT ALL ON public.order_pipeline TO authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928190200';

NOTIFY pgrst, 'reload schema';
