-- =====================================================================
-- Rollback:20260929100000_order_transition_rules.sql
--
-- 拿掉訂單事件的轉移表檢查(trg_guard_order_transition)與「一個 INSERT 一張單只能一筆事件」
-- (trg_order_events_one_per_order),以及它們用的函式,再刪掉 ledger。
-- 不動任何資料列:已經寫進去的事件都維持原狀(事件表本來就只能新增)。
--
-- ⚠️ 還原後資料庫回到 20260928190100 的狀態:只剩 guard_order_submission 管「送出類」事件,
--    其他轉移(例如供應商自己寫 delivered→received)只靠前端按鈕擋;actor_id 也會回到「前端填什麼就存什麼」。
--    前端不用跟著退版(資料庫只是變寬鬆)。
--
-- 若 20260929100100 已套用,要先跑 20260929100100_order_event_side_effects.down.sql 再跑這支。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- 順序反了:20260929100100 的報價同步依賴這支把金額驗證、統一成 payload.total_amount
DO $$
BEGIN
  IF to_regprocedure('public.apply_order_event_details()') IS NOT NULL THEN
    RAISE EXCEPTION '請先跑 20260929100100_order_event_side_effects.down.sql,再跑這支';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_events_one_per_order ON public.order_events;
DROP TRIGGER IF EXISTS trg_guard_order_transition ON public.order_events;
DROP FUNCTION IF EXISTS public.order_events_one_per_order();
DROP FUNCTION IF EXISTS public.guard_order_transition();
DROP FUNCTION IF EXISTS public.order_status_label(text);
DROP FUNCTION IF EXISTS public.order_transition_rules();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929100000';

NOTIFY pgrst, 'reload schema';
