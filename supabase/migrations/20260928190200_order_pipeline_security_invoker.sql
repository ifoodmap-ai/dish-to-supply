-- =====================================================================
-- order_pipeline 這個檢視表改成照呼叫者的權限跑,並收回寫入權限
--
-- 發現的問題(2026-09-28 審查採購單簽核時發現,view 本身是 20260726100000 建的):
--   order_pipeline 是 postgres 擁有、沒設 security_invoker 的「單表簡單檢視」,
--   Supabase 預設又把 public 裡新物件的全部權限開給 anon 與 authenticated。結果:
--   - 透過它讀寫 supplier_orders 時用的是 postgres 的權限,supplier_orders 的 RLS 完全不套用
--   - 它可以寫:任何人(連未登入的 anon)都能經由它新增/修改/刪除訂單 ——
--     例如直接建一張 status='submitted' 的單,繞過採購員簽核(20260928190000/190100 擋的都是直接寫表)
--   - 未登入就讀得到所有進行中訂單的餐廳、供應商與金額
--
-- 做法:
--   - security_invoker = true:照呼叫者身分套 supplier_orders 的 RLS
--     (管理員看全部、供應商看自己的單、餐廳成員看自己店的單 —— 跟直接查表一樣)
--   - 收回 anon 的全部權限、authenticated 的寫入權限;authenticated 保留 SELECT
--
-- 使用中的讀取端都不受影響(都是登入後讀):管理員「交易全流程看板」與總覽待辦(admin RLS 看全部)、
--   供應商總覽(本來就 .eq('supplier_id', 自己),RLS 也只回自己的)。沒有任何未登入的讀取端。
--
-- 還原:supabase/rollbacks/20260928190200_order_pipeline_security_invoker.down.sql
-- 測試:supabase/tests/database/restaurant_draft_approval.test.sql(order_pipeline 那一段)
-- =====================================================================

SET LOCAL lock_timeout = '3s';

ALTER VIEW public.order_pipeline SET (security_invoker = true);

REVOKE ALL ON public.order_pipeline FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.order_pipeline FROM authenticated;
GRANT SELECT ON public.order_pipeline TO authenticated;

NOTIFY pgrst, 'reload schema';
