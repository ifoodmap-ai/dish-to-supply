-- migration 20260929100200_order_integrity_hardening 的資料庫層測試
-- (供應商與金額只能經由派單/報價事件寫、餐廳建單不能帶供應商、出貨/報價紀錄不能繞過事件改寫、
--  履歷上的「誰」與「從哪裡」由伺服器決定;既有的合法更新照常)
--
-- 整段包在 BEGIN … ROLLBACK:fixture 與事件都不會留下來,pg_net 的通知佇列也跟著回滾(不會寄信)。
-- 帳號一律 @example.com。每個探針都先 SET LOCAL ROLE + set_config('request.jwt.claims', …, true)。
-- 死鎖(派單/出貨先鎖供應商再鎖訂單)要兩條連線,單一交易測不到 —— 另外在本機替身用兩個並發交易實測(見交付說明)。
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(37);

-- ---------------------------------------------------------------------
-- fixture:R1 = O 老闆、M 店長、P 採購員;S1 = SU;S2 = SU2;AD = 管理員
-- ---------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('b1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hardening-owner@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hardening-manager@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hardening-purchaser@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hardening-supplier@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hardening-admin@example.com', '', '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hardening-supplier2@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.restaurants (id, name) VALUES ('b2000000-0000-4000-8000-000000000001', '補強驗收餐廳');
INSERT INTO public.restaurant_accounts (id, user_id, restaurant_id, role, is_active, accepted_at) VALUES
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'owner',     true, now()),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'manager',   true, now()),
  ('b3000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'purchaser', true, now());
INSERT INTO public.suppliers (id, name) VALUES
  ('b4000000-0000-4000-8000-000000000001', '補強驗收供應商'),
  ('b4000000-0000-4000-8000-000000000002', '補強驗收別家供應商');
INSERT INTO public.supplier_accounts (id, user_id, supplier_id) VALUES
  ('b5000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000008', 'b4000000-0000-4000-8000-000000000002');

INSERT INTO public.supplier_orders (id, restaurant_id, supplier_id, status, total_amount) VALUES
  ('b6000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'dispatched', NULL),
  ('b6000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'quoted', 3200),
  ('b6000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'received', 3200),
  ('b6000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', NULL, 'draft', NULL),
  ('b6000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001', NULL, 'submitted', NULL),
  ('b6000000-0000-4000-8000-000000000006', 'b2000000-0000-4000-8000-000000000001', NULL, 'submitted', NULL),
  ('b6000000-0000-4000-8000-000000000007', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'accepted', NULL),
  ('b6000000-0000-4000-8000-000000000008', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'confirmed', 900),
  ('b6000000-0000-4000-8000-000000000009', 'b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000002', 'dispatched', NULL);

-- ---------------------------------------------------------------------
-- 0. migration 本身
-- ---------------------------------------------------------------------
SELECT ok(
  pg_get_functiondef('public.guard_order_update()'::regprocedure) LIKE '%order_supplier_via_dispatch%'
  AND pg_get_functiondef('public.guard_order_update()'::regprocedure) LIKE '%order_amount_via_quote%',
  'guard_order_update 擋直接改供應商與金額'
);
SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""', 'row_security=off'] FROM pg_proc WHERE oid = to_regprocedure('public.guard_order_update()'))
  AND (SELECT prosecdef AND proconfig @> ARRAY['search_path=""', 'row_security=off'] FROM pg_proc WHERE oid = to_regprocedure('public.guard_order_transition()')),
  '兩支 guard 仍是 SECURITY DEFINER、search_path 為空、row_security=off'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_shipments' AND policyname = 'supplier_insert_shipments'),
  0, '供應商直接新增出貨紀錄的 policy 已拿掉'
);
SELECT is(
  (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_quotes' AND policyname LIKE 'supplier%'),
  'supplier insert own quotes:INSERT', '供應商對報價只剩 INSERT(不能改、不能刪)'
);
SELECT ok(
  (SELECT with_check LIKE '%supplier_id IS NULL%' FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_orders' AND policyname = 'restaurant_create_own_orders'),
  '餐廳建單的 policy 要求 supplier_id 是空的'
);

-- ---------------------------------------------------------------------
-- 1. 老闆/店長/採購員不能直接改供應商與金額;既有的合法更新照常
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated","email":"hardening-owner@example.com"}', true);
SELECT throws_ok(
  $$UPDATE public.supplier_orders SET supplier_id = 'b4000000-0000-4000-8000-000000000002' WHERE id = 'b6000000-0000-4000-8000-000000000001'$$,
  '42501', '訂單的供應商只能由平台派單指定,不能直接修改',
  '老闆不能不經派單就把單改給別家供應商'
);
SELECT throws_ok(
  $$UPDATE public.supplier_orders SET total_amount = 1 WHERE id = 'b6000000-0000-4000-8000-000000000002'$$,
  '42501', '訂單金額由供應商報價決定,送出後不能直接修改',
  '老闆不能在確認前把報價 3200 改成 1'
);
SELECT lives_ok(
  $$UPDATE public.supplier_orders SET total_amount = 500 WHERE id = 'b6000000-0000-4000-8000-000000000004'$$,
  '草稿還沒送出:老闆改金額可以'
);
SELECT lives_ok(
  $$UPDATE public.supplier_orders SET notes = '改成下午送' WHERE id = 'b6000000-0000-4000-8000-000000000005'$$,
  '老闆改已送出單的備註仍然可以'
);
SELECT lives_ok(
  $$UPDATE public.supplier_orders SET approved_by = 'b1000000-0000-4000-8000-000000000001', approved_at = now()
     WHERE id = 'b6000000-0000-4000-8000-000000000004' AND status = 'draft'$$,
  '老闆核准草稿(前端「核准並送出」的第一步)仍然可以'
);
SELECT throws_ok(
  $$INSERT INTO public.supplier_orders (restaurant_id, supplier_id, status) VALUES
    ('b2000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'draft')$$,
  '42501', 'new row violates row-level security policy for table "supplier_orders"',
  '餐廳建單不能自己帶供應商(供應商只能由派單指定)'
);
SELECT lives_ok(
  $$INSERT INTO public.supplier_orders (id, restaurant_id, status) VALUES
    ('b6000000-0000-4000-8000-000000000031', 'b2000000-0000-4000-8000-000000000001', 'draft')$$,
  '餐廳建草稿(不帶供應商)仍然可以'
);
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated","email":"hardening-manager@example.com"}', true);
SELECT throws_ok(
  $$UPDATE public.supplier_orders SET supplier_id = 'b4000000-0000-4000-8000-000000000002', total_amount = 1
     WHERE id = 'b6000000-0000-4000-8000-000000000003'$$,
  '42501', '訂單的供應商只能由平台派單指定,不能直接修改',
  '店長不能事後改已收貨單的供應商與金額(GMV 不能被改寫)'
);
SELECT throws_ok(
  $$UPDATE public.supplier_orders SET total_amount = 1 WHERE id = 'b6000000-0000-4000-8000-000000000003'$$,
  '42501', '訂單金額由供應商報價決定,送出後不能直接修改',
  '店長不能事後改已收貨單的金額'
);
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","email":"hardening-purchaser@example.com"}', true);
SELECT throws_ok(
  $$UPDATE public.supplier_orders SET supplier_id = 'b4000000-0000-4000-8000-000000000001' WHERE id = 'b6000000-0000-4000-8000-000000000031'$$,
  '42501', '訂單的供應商只能由平台派單指定,不能直接修改',
  '採購員在草稿上也不能指定供應商'
);
SELECT lives_ok(
  $$UPDATE public.supplier_orders SET notes = '採購員補充' WHERE id = 'b6000000-0000-4000-8000-000000000031'$$,
  '採購員改自己草稿的內容仍然可以'
);
SELECT throws_ok(
  $$UPDATE public.supplier_orders SET total_amount = 1, supplier_id = 'b4000000-0000-4000-8000-000000000002' WHERE id = 'b6000000-0000-4000-8000-000000000005'$$,
  '42501', '採購單送出後只有老闆或店長可以修改',
  '採購員改已送出的單:照舊是簽核規則的訊息'
);

-- 管理員、系統:照常可以改(代客處理)
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated","email":"hardening-admin@example.com","app_metadata":{"role":"admin"}}', true);
SELECT lives_ok(
  $$UPDATE public.supplier_orders SET total_amount = 3000, supplier_id = 'b4000000-0000-4000-8000-000000000001' WHERE id = 'b6000000-0000-4000-8000-000000000006'$$,
  '管理員直接改供應商與金額不受影響'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok(
  $$UPDATE public.supplier_orders SET total_amount = 2999 WHERE id = 'b6000000-0000-4000-8000-000000000006'$$,
  '系統身分直接改金額不受影響'
);

-- 事件路徑照常寫得進供應商與金額
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000006","role":"authenticated","email":"hardening-admin@example.com","app_metadata":{"role":"admin"}}', true);
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, payload)
    VALUES ('b6000000-0000-4000-8000-000000000005', 'submitted', 'dispatched', 'admin', 'admin_portal', '{"supplier_id":"b4000000-0000-4000-8000-000000000001"}')$$,
  '派單事件照常把供應商寫到訂單上'
);
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated","email":"hardening-supplier@example.com"}', true);
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, payload)
    VALUES ('b6000000-0000-4000-8000-000000000007', 'accepted', 'quoted', 'supplier', 'supplier_portal', '{"total_amount":1880}')$$,
  '報價事件照常把金額寫到訂單上'
);
RESET ROLE;
SELECT is((SELECT supplier_id FROM public.supplier_orders WHERE id = 'b6000000-0000-4000-8000-000000000005'),
  'b4000000-0000-4000-8000-000000000001'::uuid, '派單後 supplier_id 已寫入');
SELECT is((SELECT total_amount FROM public.supplier_orders WHERE id = 'b6000000-0000-4000-8000-000000000007'),
  1880::numeric, '報價後 total_amount 已寫入');
SELECT is((SELECT supplier_id FROM public.supplier_orders WHERE id = 'b6000000-0000-4000-8000-000000000001'),
  'b4000000-0000-4000-8000-000000000001'::uuid, '老闆改派被擋:供應商沒變');
SELECT is((SELECT total_amount FROM public.supplier_orders WHERE id = 'b6000000-0000-4000-8000-000000000002'),
  3200::numeric, '老闆改金額被擋:金額沒變');

-- ---------------------------------------------------------------------
-- 2. 出貨與報價紀錄不能繞過事件直接改寫
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000008","role":"authenticated","email":"hardening-supplier2@example.com"}', true);
SELECT throws_ok(
  $$INSERT INTO public.supplier_shipments (order_id, supplier_id, confirmed_by)
    VALUES ('b6000000-0000-4000-8000-000000000008', 'b4000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001')$$,
  '42501', 'new row violates row-level security policy for table "supplier_shipments"',
  '供應商 S2 不能替 S1 的單新增出貨紀錄'
);
SELECT throws_ok(
  $$INSERT INTO public.supplier_shipments (order_id, supplier_id)
    VALUES ('b6000000-0000-4000-8000-000000000009', 'b4000000-0000-4000-8000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "supplier_shipments"',
  '供應商連自己的單也不能直接新增出貨紀錄(只能經由「出貨」事件)'
);
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000005","role":"authenticated","email":"hardening-supplier@example.com"}', true);
-- 供應商試著改、刪 trigger 留下的報價紀錄(RLS 沒有 UPDATE/DELETE policy:不報錯,但一列都動不到)
UPDATE public.order_quotes SET total_amount = 99999 WHERE order_id = 'b6000000-0000-4000-8000-000000000007';
DELETE FROM public.order_quotes WHERE order_id = 'b6000000-0000-4000-8000-000000000007';
SELECT is(
  (SELECT count(*)::int FROM public.order_quotes WHERE order_id = 'b6000000-0000-4000-8000-000000000007' AND total_amount = 1880),
  1, '供應商改不動也刪不掉報價紀錄,而且仍然讀得到自己的報價'
);
SELECT lives_ok(
  $$INSERT INTO public.order_quotes (order_id, supplier_id, total_amount)
    VALUES ('b6000000-0000-4000-8000-000000000007', 'b4000000-0000-4000-8000-000000000001', 1900)$$,
  '供應商對派給自己的單新增報價紀錄仍然可以(transaction_tenant_rls 的既有規則)'
);
SELECT throws_ok(
  $$INSERT INTO public.order_quotes (order_id, supplier_id, total_amount)
    VALUES ('b6000000-0000-4000-8000-000000000009', 'b4000000-0000-4000-8000-000000000001', 1)$$,
  '42501', 'new row violates row-level security policy for table "order_quotes"',
  '供應商不能把報價掛到別家的單上'
);
-- 出貨事件仍然會自己留出貨紀錄
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, payload)
    VALUES ('b6000000-0000-4000-8000-000000000008', 'confirmed', 'shipped', 'supplier', 'supplier_portal', '{"tracking":{"carrier":"自有車隊"}}')$$,
  '出貨事件照常(先鎖供應商、再鎖訂單)'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.supplier_shipments WHERE order_id = 'b6000000-0000-4000-8000-000000000008'
      AND supplier_id = 'b4000000-0000-4000-8000-000000000001' AND confirmed_by = 'b1000000-0000-4000-8000-000000000005'),
  1, '出貨事件寫下一筆出貨紀錄'
);

-- ---------------------------------------------------------------------
-- 3. 履歷上的「誰」與「從哪裡」由伺服器決定
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000008","role":"authenticated","email":"hardening-supplier2@example.com"}', true);
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, actor_label, source)
    VALUES ('b6000000-0000-4000-8000-000000000009', 'dispatched', 'accepted', 'supplier', '平台管理員 王小明', 'cron')$$,
  '供應商寫事件時偽造 actor_label 與 source:寫得進去,但兩個值都被伺服器改掉'
);
RESET ROLE;
SELECT is(
  (SELECT actor_label || ' | ' || source FROM public.order_events WHERE order_id = 'b6000000-0000-4000-8000-000000000009'),
  'hardening-supplier2@example.com | supplier_portal', '存的是 JWT 的 email 與供應商後台'
);
SELECT is(
  (SELECT string_agg(e.source, ',' ORDER BY e.source) FROM public.order_events e
    WHERE e.order_id IN ('b6000000-0000-4000-8000-000000000005', 'b6000000-0000-4000-8000-000000000007')),
  'admin_portal,supplier_portal', '管理員、供應商的事件來源各是自己的後台'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, actor_label, source)
    VALUES ('b6000000-0000-4000-8000-000000000001', 'dispatched', 'expired', 'system', '逾時排程', 'cron')$$,
  '系統身分(排程)寫事件'
);
RESET ROLE;
SELECT is(
  (SELECT actor_label || ' | ' || source FROM public.order_events WHERE order_id = 'b6000000-0000-4000-8000-000000000001'),
  '逾時排程 | cron', '系統身分的 actor_label 與 source 照填'
);

SELECT * FROM finish();
ROLLBACK;
