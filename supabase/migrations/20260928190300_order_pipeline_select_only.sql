-- =====================================================================
-- order_pipeline:authenticated 只留 SELECT(接續 20260928190200)
--
-- 190200 是逐項收回 INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER,漏了 PostgreSQL 17 起才有的 MAINTAIN
-- (套用後 relacl 是 authenticated=rm)。經 PostgREST 用不到這個權限,但這裡改成「全部收回、只給 SELECT」,
-- 跟檔頭說的一致,也不用再跟著 PostgreSQL 版本補權限名稱。
--
-- ⚠️ 之後若有 migration 用 CREATE OR REPLACE VIEW 重建 order_pipeline,要記得帶
--    WITH (security_invoker = true),不然這個設定會被悄悄清掉、又變回繞過 RLS
--    (測試 restaurant_draft_approval.test.sql 第 0 段會檢查)。
--
-- 還原:supabase/rollbacks/20260928190300_order_pipeline_select_only.down.sql
-- =====================================================================

SET LOCAL lock_timeout = '3s';

REVOKE ALL ON public.order_pipeline FROM authenticated;
GRANT SELECT ON public.order_pipeline TO authenticated;

NOTIFY pgrst, 'reload schema';
