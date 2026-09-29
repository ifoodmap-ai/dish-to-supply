-- =====================================================================
-- Rollback:20260929110100_expire_stuck_orders.sql
--
-- 取消每日逾時排程、拿掉 expire_stuck_orders() 與 order_expiry_rules(),再刪掉 ledger。
-- pg_cron 是這支 migration 啟用的:取消排程後如果 cron.job 裡已經沒有任何排程,就一併停用(DROP EXTENSION);
-- 還有別的排程就保留 extension,只拿掉這一支。
-- 不動任何資料列:已經被標成逾時的單維持 expired(管理員仍可改派或取消)。
-- 還原順序:20260929110200.down → 這支 → 20260929110000.down。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('public.restaurant_receive_order(uuid,text,boolean,text,text,jsonb,integer)') IS NOT NULL THEN
    RAISE EXCEPTION '請先跑 20260929110200_order_receipt_dispute_rpc.down.sql,再跑這支';
  END IF;

  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ifoodmap-expire-stuck-orders') THEN
      PERFORM cron.unschedule('ifoodmap-expire-stuck-orders');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job) THEN
      DROP EXTENSION pg_cron;
    END IF;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.expire_stuck_orders();
DROP FUNCTION IF EXISTS public.order_expiry_rules();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929110100';

NOTIFY pgrst, 'reload schema';
