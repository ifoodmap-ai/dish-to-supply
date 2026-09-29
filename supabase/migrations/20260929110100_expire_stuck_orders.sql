-- =====================================================================
-- 每天自動把「超過時限、沒人動」的單標成逾時(expired),由系統寫事件
-- (業主 2026-09-29 拍板 F5:管理員可取消 + 自動標逾時;逾時的單出現在看板異常欄,讓管理員改派)
--
-- 規則:
--   - 會逾時的狀態與時限 = src/lib/orders.ts 的 ORDER_STATUS[status].slaHours(isStuck 用的同一組數字):
--       待接單 dispatched 24h、舊資料 sent 24h、待報價 accepted 24h、待餐廳確認 quoted 48h、待出貨 confirmed 48h
--     src/lib/orders.test.ts 會解析下面 @expiry-begin … @expiry-end 那一段,跟 ORDER_STATUS 逐條比對。
--   - 貨已經在路上或之後的狀態(已出貨、運送中、待收貨、待評價…)不會自動逾時,只能由管理員處理;
--     待派發 submitted / 舊資料 pending 是平台自己的待辦(看板「待派發」欄),也不自動逾時。
--   - 「沒人動」= current_stage_since(最後一次狀態變更)早於現在減時限 —— 跟 isStuck 的判斷一樣。
--   - 寫事件的身分是系統(actor_role = system、source = cron、actor_id = NULL),走 guard_order_transition 同一套檢查;
--     note 寫明在哪一關停了多久、時限多少。notify 沒有 expired 的通知規則,不寄信。
--
-- 排程:pg_cron(每天 03:00 台北時間 = 19:00 UTC)。選 pg_cron 而不是外部排程(GitHub Actions / Vercel cron)的理由:
--   - 正式庫的 shared_preload_libraries 已經載入 pg_cron 1.6.4,只差 CREATE EXTENSION,不用重啟、不用加任何服務
--   - 在資料庫裡跑:不需要把 service_role key 放到外部(GitHub secrets / Vercel env),也不經過網路
--   - 排程以資料庫擁有者身分跑、沒有 JWT —— guard_order_transition 本來就把這種身分當成「系統」
--   - 每次執行都記在 cron.job_run_details;逾時的單在 order_events 有系統事件可查
--
-- 死鎖:排程一次處理多張單,但每張都用 FOR NO KEY UPDATE SKIP LOCKED —— 有人正在處理的單直接跳過(下一輪再看),
--   排程自己從不等鎖,所以不會跟使用者的操作互等。鎖到之後重新確認狀態與時限才寫事件;
--   每張單各自一個子交易,一張失敗不影響其他張(失敗的列在回傳的 failed)。
--
-- 還原:supabase/rollbacks/20260929110100_expire_stuck_orders.down.sql(要先還原 110200)
-- 測試:supabase/tests/database/order_expiry.test.sql
-- =====================================================================

SET LOCAL lock_timeout = '3s';

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------
-- 1. 會逾時的狀態與時限(唯一來源;前端 ORDER_STATUS.slaHours 由 vitest 對照這一段)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_expiry_rules()
RETURNS TABLE (status text, sla_hours integer)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT t.status, t.sla_hours FROM (VALUES
    -- @expiry-begin
    ('dispatched', 24),
    ('sent', 24),
    ('accepted', 24),
    ('quoted', 48),
    ('confirmed', 48)
    -- @expiry-end
  ) AS t(status, sla_hours)
$$;

COMMENT ON FUNCTION public.order_expiry_rules() IS
  '每日逾時排程:哪些狀態、停留超過幾小時會被標成 expired。與 src/lib/orders.ts ORDER_STATUS.slaHours 對齊;出貨之後的狀態不在內。';

-- ---------------------------------------------------------------------
-- 2. 逾時檢查(排程呼叫)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stuck_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  r              record;
  v_status       text;
  v_since        timestamptz;
  v_sla          integer;
  v_expired      uuid[] := '{}';
  v_skipped      integer := 0;
  v_failed       jsonb := '[]'::jsonb;
BEGIN
  -- 只給系統身分跑(排程、service_role、資料庫直連);就算登入的使用者拿到執行權也不行
  IF auth.uid() IS NOT NULL OR COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION '只有系統排程可以執行逾時檢查' USING ERRCODE = '42501', HINT = 'system_only';
  END IF;

  FOR r IN
    SELECT o.id
      FROM public.supplier_orders o
      JOIN public.order_expiry_rules() e ON e.status = o.status
     WHERE o.current_stage_since < now() - make_interval(hours => e.sla_hours)
     ORDER BY o.current_stage_since, o.id
  LOOP
    -- 有人正在處理這張單就先跳過,不等鎖(下一輪再看)
    SELECT o.status, o.current_stage_since
      INTO v_status, v_since
      FROM public.supplier_orders o
     WHERE o.id = r.id
       FOR NO KEY UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- 鎖到之後重新確認:狀態還在會逾時的清單裡,而且仍然超過時限
    SELECT e.sla_hours INTO v_sla FROM public.order_expiry_rules() e WHERE e.status = v_status;
    IF v_sla IS NULL OR v_since >= now() - make_interval(hours => v_sla) THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, actor_label, source, note, payload)
      VALUES (
        r.id, v_status, 'expired', 'system', '逾時排程', 'cron',
        format('在「%s」停留超過 %s 小時沒有人處理,系統標為逾時', public.order_status_label(v_status), v_sla),
        jsonb_build_object(
          'sla_hours', v_sla,
          'stage_since', v_since,
          'hours_in_stage', round((extract(epoch FROM now() - v_since) / 3600)::numeric, 1)
        )
      );
      v_expired := v_expired || r.id;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || jsonb_build_object('order_id', r.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', cardinality(v_expired),
    'expired_ids', to_jsonb(v_expired),
    'skipped_locked', v_skipped,
    'failed', v_failed,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.expire_stuck_orders() IS
  '每日排程:把 order_expiry_rules() 裡超過時限、沒人動的單標成 expired(系統事件)。正在被處理的單 SKIP LOCKED 跳過。只給系統身分執行。';

REVOKE ALL ON FUNCTION public.order_expiry_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stuck_orders() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 排程:每天 19:00 UTC(台北 03:00)。同名排程已存在時 cron.schedule 會直接更新
-- ---------------------------------------------------------------------
SELECT cron.schedule(
  'ifoodmap-expire-stuck-orders',
  '0 19 * * *',
  $cron$SELECT public.expire_stuck_orders();$cron$
);

NOTIFY pgrst, 'reload schema';
