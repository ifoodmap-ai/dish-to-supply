-- migration 20260929110100_expire_stuck_orders 的資料庫層測試
-- (每日逾時排程:超過時限、沒人動的單標成 expired,由系統寫事件;出貨之後的狀態不逾時;
--  只有系統身分能執行;逾時的單出現在看板(order_pipeline),管理員可以改派)
--
-- 整段包在 BEGIN … ROLLBACK:fixture 與事件都不會留下來,pg_net 的通知佇列也跟著回滾(不會寄信)。
-- 注意:expire_stuck_orders() 在這個交易裡也會看到正式庫其他的單 —— 斷言只看本檔自建的單(交易結束一起回滾)。
-- 「有人正在處理的單要跳過(SKIP LOCKED)」要兩條連線,單一交易測不到,另外在本機替身並發實測(見交付說明);
-- 「鎖到之後重新確認時限」用一支只在這個交易裡的測試 trigger 模擬(第 4 段)。
BEGIN;
-- 第 4 段會 CREATE TRIGGER(鎖住 order_events 到交易結束):等不到鎖就放棄,不讓正式庫的訂單寫入排在後面
SET LOCAL lock_timeout = '3s';

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(27);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a2100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'expiry-owner@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2100000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'expiry-admin@example.com', '', '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now());
INSERT INTO public.restaurants (id, name) VALUES ('a2200000-0000-4000-8000-000000000001', '逾時驗收餐廳');
INSERT INTO public.restaurant_accounts (user_id, restaurant_id, role, is_active, accepted_at) VALUES
  ('a2100000-0000-4000-8000-000000000001', 'a2200000-0000-4000-8000-000000000001', 'owner', true, now());
INSERT INTO public.suppliers (id, name, is_active) VALUES
  ('a2400000-0000-4000-8000-000000000001', '逾時驗收供應商', false),
  ('a2400000-0000-4000-8000-000000000002', '逾時驗收改派供應商', false);

-- x* = 超過時限、應該逾時;n* = 不該動(沒超過時限、或出貨之後的狀態、或平台自己的待辦)
INSERT INTO public.supplier_orders (id, restaurant_id, supplier_id, status, total_amount, current_stage_since) VALUES
  ('a2600000-0000-4000-8000-0000000000a1', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'dispatched', NULL, now() - interval '25 hours'),
  ('a2600000-0000-4000-8000-0000000000a2', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'sent',       NULL, now() - interval '25 hours'),
  ('a2600000-0000-4000-8000-0000000000a3', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'accepted',   NULL, now() - interval '25 hours'),
  ('a2600000-0000-4000-8000-0000000000a4', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'quoted',     2000, now() - interval '49 hours'),
  ('a2600000-0000-4000-8000-0000000000a5', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'confirmed',  2000, now() - interval '49 hours'),
  ('a2600000-0000-4000-8000-0000000000b1', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'dispatched', NULL, now() - interval '23 hours'),
  ('a2600000-0000-4000-8000-0000000000b2', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'quoted',     2000, now() - interval '47 hours'),
  ('a2600000-0000-4000-8000-0000000000b3', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'shipped',    2000, now() - interval '500 hours'),
  ('a2600000-0000-4000-8000-0000000000b4', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'in_transit', 2000, now() - interval '500 hours'),
  ('a2600000-0000-4000-8000-0000000000b5', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'delivered',  2000, now() - interval '500 hours'),
  ('a2600000-0000-4000-8000-0000000000b6', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'received',   2000, now() - interval '500 hours'),
  ('a2600000-0000-4000-8000-0000000000b7', 'a2200000-0000-4000-8000-000000000001', NULL,                                   'submitted',  NULL, now() - interval '500 hours'),
  ('a2600000-0000-4000-8000-0000000000b8', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'discrepancy', 2000, now() - interval '500 hours'),
  ('a2600000-0000-4000-8000-0000000000b9', 'a2200000-0000-4000-8000-000000000001', NULL,                                   'draft',      NULL, now() - interval '500 hours');

-- ---------------------------------------------------------------------
-- 0. migration 本身
-- ---------------------------------------------------------------------
SELECT is(
  (SELECT string_agg(status || ':' || sla_hours, ',' ORDER BY status) FROM public.order_expiry_rules()),
  'accepted:24,confirmed:48,dispatched:24,quoted:48,sent:24',
  '會逾時的狀態與時限(= ORDER_STATUS.slaHours)'
);
SELECT is(
  (SELECT count(*)::int FROM public.order_expiry_rules() e
    WHERE NOT EXISTS (SELECT 1 FROM public.order_transition_rules() r WHERE r.actor = 'system' AND r.from_status = e.status AND r.to_status = 'expired')),
  0, '每一種會逾時的狀態,轉移表都允許系統 → expired'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.expire_stuck_orders()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.expire_stuck_orders()', 'EXECUTE'),
  'anon / authenticated 不能呼叫逾時檢查'
);
SELECT is(
  (SELECT schedule || ' | ' || command FROM cron.job WHERE jobname = 'ifoodmap-expire-stuck-orders'),
  '0 19 * * * | SELECT public.expire_stuck_orders();', '每天 19:00 UTC(台北 03:00)排程逾時檢查'
);

-- ---------------------------------------------------------------------
-- 1. 只有系統身分能執行
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a2100000-0000-4000-8000-000000000006","role":"authenticated","app_metadata":{"role":"admin"}}', true);
SELECT throws_ok(
  $$SELECT public.expire_stuck_orders()$$,
  '42501', NULL,
  '管理員(登入的使用者)不能直接呼叫逾時檢查'
);
RESET ROLE;
-- 在 postgres 身分下帶著登入者的 JWT(模擬被別的 SECURITY DEFINER 函式代呼叫)也不算系統
SELECT set_config('request.jwt.claims', '{"sub":"a2100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.expire_stuck_orders()$$,
  '42501', '只有系統排程可以執行逾時檢查',
  '帶著使用者 JWT 呼叫會被擋(排程沒有 JWT)'
);

-- ---------------------------------------------------------------------
-- 2. 排程執行(系統身分:沒有 JWT,跟 pg_cron 一樣)
-- ---------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
CREATE TEMP TABLE _run ON COMMIT DROP AS SELECT public.expire_stuck_orders() AS r;
SELECT ok(
  (SELECT (r->'expired_ids') @> '["a2600000-0000-4000-8000-0000000000a1","a2600000-0000-4000-8000-0000000000a2","a2600000-0000-4000-8000-0000000000a3","a2600000-0000-4000-8000-0000000000a4","a2600000-0000-4000-8000-0000000000a5"]'::jsonb FROM _run),
  '回傳的 expired_ids 包含 5 張超過時限的測試單'
);
SELECT ok(
  (SELECT NOT ((r->'expired_ids') ?| ARRAY['a2600000-0000-4000-8000-0000000000b1','a2600000-0000-4000-8000-0000000000b2','a2600000-0000-4000-8000-0000000000b3',
                                           'a2600000-0000-4000-8000-0000000000b4','a2600000-0000-4000-8000-0000000000b5','a2600000-0000-4000-8000-0000000000b6',
                                           'a2600000-0000-4000-8000-0000000000b7','a2600000-0000-4000-8000-0000000000b8','a2600000-0000-4000-8000-0000000000b9']) FROM _run),
  '回傳的 expired_ids 不含任何不該逾時的測試單'
);
SELECT is(
  (SELECT count(*)::int FROM public.supplier_orders WHERE id::text LIKE 'a2600000-0000-4000-8000-0000000000a_' AND status = 'expired'),
  5, '待接單(24h)、舊資料 sent(24h)、待報價(24h)、待餐廳確認(48h)、待出貨(48h)超過時限都變成 expired'
);
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b1'), 'dispatched', '待接單 23 小時(沒超過 24h)不動');
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b2'), 'quoted', '待確認 47 小時(沒超過 48h)不動');
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b3'), 'shipped', '已出貨再久也不自動逾時(只能由管理員處理)');
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b4'), 'in_transit', '運送中再久也不自動逾時');
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b5'), 'delivered', '待收貨不自動逾時');
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b6'), 'received', '待評價(已成交)不動');
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000b7'), 'submitted', '待派發(平台自己的待辦)不自動逾時');
SELECT is(
  (SELECT string_agg(status, ',' ORDER BY id) FROM public.supplier_orders WHERE id IN ('a2600000-0000-4000-8000-0000000000b8', 'a2600000-0000-4000-8000-0000000000b9')),
  'discrepancy,draft', '收貨有差異、草稿不動'
);
SELECT is(
  (SELECT count(*)::int FROM public.order_events e
    WHERE e.order_id::text LIKE 'a2600000-0000-4000-8000-0000000000a_'
      AND e.to_status = 'expired' AND e.actor_role = 'system' AND e.actor_id IS NULL
      AND e.source = 'cron' AND e.actor_label = '逾時排程' AND (e.payload->>'sla_hours') IS NOT NULL),
  5, '每張逾時的單各一筆系統事件(actor_id NULL、source cron、payload 帶時限)'
);
SELECT is(
  (SELECT from_status || ' | ' || note FROM public.order_events WHERE order_id = 'a2600000-0000-4000-8000-0000000000a4' AND to_status = 'expired'),
  'quoted | 在「待確認」停留超過 48 小時沒有人處理,系統標為逾時', '事件的 from_status 是原本的狀態,note 寫明停在哪一關、時限多少'
);
SELECT is(
  (SELECT count(*)::int FROM public.order_events WHERE order_id::text LIKE 'a2600000-0000-4000-8000-0000000000b_'),
  0, '不該逾時的單一筆事件都沒有'
);

-- 再跑一次:已經逾時的單不會重複寫事件
SELECT lives_ok($$SELECT public.expire_stuck_orders()$$, '排程重跑');
SELECT is(
  (SELECT count(*)::int FROM public.order_events WHERE order_id::text LIKE 'a2600000-0000-4000-8000-0000000000a_' AND to_status = 'expired'),
  5, '重跑不會重複標逾時'
);

-- ---------------------------------------------------------------------
-- 3. 逾時的單出現在看板,管理員可以改派
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a2100000-0000-4000-8000-000000000006","role":"authenticated","app_metadata":{"role":"admin"}}', true);
SELECT is(
  (SELECT count(*)::int FROM public.order_pipeline WHERE id::text LIKE 'a2600000-0000-4000-8000-0000000000a_' AND status = 'expired'),
  5, '逾時的單在 order_pipeline(看板)裡看得到'
);
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, payload)
    VALUES ('a2600000-0000-4000-8000-0000000000a4', 'expired', 'dispatched', 'admin', 'admin_portal', '{"supplier_id":"a2400000-0000-4000-8000-000000000002"}')$$,
  '管理員把逾時的單改派給別家'
);
RESET ROLE;
SELECT is(
  (SELECT status || ' | ' || supplier_id::text || ' | ' || coalesce(total_amount::text, 'NULL') FROM public.supplier_orders WHERE id = 'a2600000-0000-4000-8000-0000000000a4'),
  'dispatched | a2400000-0000-4000-8000-000000000002 | NULL', '改派後是待接單、換了供應商、前一家的報價金額清空'
);

-- ---------------------------------------------------------------------
-- 4. 鎖到之後重新確認時限:排程撈出清單之後、輪到它之前有人動過的單,不會被標逾時
--    測試用 trigger(只存在這個交易裡,ROLLBACK 一起消失):標 c1 逾時的那一刻,把 c2 的停留起點改成現在,
--    模擬「清單撈出來之後,有人剛處理過 c2」。c1 比 c2 早,排程一定先處理 c1。
-- ---------------------------------------------------------------------
INSERT INTO public.supplier_orders (id, restaurant_id, supplier_id, status, current_stage_since) VALUES
  ('a2600000-0000-4000-8000-0000000000c1', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'dispatched', now() - interval '40 hours'),
  ('a2600000-0000-4000-8000-0000000000c2', 'a2200000-0000-4000-8000-000000000001', 'a2400000-0000-4000-8000-000000000001', 'dispatched', now() - interval '39 hours');
CREATE FUNCTION public.zz_test_touch_c2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.supplier_orders SET current_stage_since = now() WHERE id = 'a2600000-0000-4000-8000-0000000000c2';
  RETURN NULL;
END $$;
CREATE TRIGGER zz_test_touch_c2 AFTER INSERT ON public.order_events FOR EACH ROW
  WHEN (NEW.order_id = 'a2600000-0000-4000-8000-0000000000c1' AND NEW.to_status = 'expired')
  EXECUTE FUNCTION public.zz_test_touch_c2();
SELECT set_config('request.jwt.claims', '', true);
SELECT lives_ok($$SELECT public.expire_stuck_orders()$$, '排程再跑一次(清單裡有 c1、c2)');
SELECT is(
  (SELECT string_agg(status, ',' ORDER BY id) FROM public.supplier_orders
    WHERE id IN ('a2600000-0000-4000-8000-0000000000c1', 'a2600000-0000-4000-8000-0000000000c2')),
  'expired,dispatched', '鎖到之後會重新確認時限:清單撈出來之後才被動過的單(停留起點變成現在)不會被標逾時'
);

SELECT * FROM finish();
ROLLBACK;
