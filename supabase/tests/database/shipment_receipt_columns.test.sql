-- migration 20260929100300_shipment_receipt_columns 的資料庫層測試
-- (出貨紀錄由供應商的「出貨」事件寫;餐廳只能回填收貨三欄、不能新增出貨紀錄;事件 trigger 不受影響)
--
-- 整段包在 BEGIN … ROLLBACK:fixture 與事件都不會留下來,pg_net 的通知佇列也跟著回滾(不會寄信)。
-- 帳號一律 @example.com。每個探針都先 SET LOCAL ROLE + set_config('request.jwt.claims', …, true)。
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a7000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'shipcol-owner@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a7000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'shipcol-purchaser@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a7000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'shipcol-supplier@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a7000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'shipcol-admin@example.com', '', '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now());
INSERT INTO public.restaurants (id, name) VALUES ('a7200000-0000-4000-8000-000000000001', '出貨欄位驗收餐廳');
INSERT INTO public.restaurant_accounts (user_id, restaurant_id, role, is_active, accepted_at) VALUES
  ('a7000000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 'owner', true, now()),
  ('a7000000-0000-4000-8000-000000000003', 'a7200000-0000-4000-8000-000000000001', 'purchaser', true, now());
INSERT INTO public.suppliers (id, name) VALUES
  ('a7400000-0000-4000-8000-000000000001', '出貨欄位驗收供應商'),
  ('a7400000-0000-4000-8000-000000000002', '出貨欄位驗收別家供應商');
INSERT INTO public.supplier_accounts (user_id, supplier_id) VALUES
  ('a7000000-0000-4000-8000-000000000005', 'a7400000-0000-4000-8000-000000000001');
INSERT INTO public.supplier_orders (id, restaurant_id, supplier_id, status, total_amount) VALUES
  ('a7600000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'confirmed', 900);

-- 0. 權限本身
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.supplier_shipments', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.supplier_shipments', 'UPDATE'),
  'anon / authenticated 沒有表層級的 UPDATE'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.supplier_shipments', 'received_at', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.supplier_shipments', 'received_by', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.supplier_shipments', 'receive_status', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.supplier_shipments', 'shipped_at', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.supplier_shipments', 'supplier_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.supplier_shipments', 'tracking_info', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.supplier_shipments', 'confirmed_by', 'UPDATE'),
  'authenticated 只能改收貨三欄(received_at / received_by / receive_status)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_shipments' AND cmd = 'INSERT'),
  0, '出貨紀錄沒有任何開給一般登入者的 INSERT policy(只有管理員的 FOR ALL)'
);

-- 1. 出貨事件照常寫出貨紀錄(trigger 用擁有者身分,不受欄位權限影響)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated","email":"shipcol-supplier@example.com"}', true);
SELECT lives_ok(
  $$INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, payload)
    VALUES ('a7600000-0000-4000-8000-000000000001', 'confirmed', 'shipped', 'supplier', 'supplier_portal', '{"tracking":{"carrier":"自有車隊","tracking_number":"S-1"}}')$$,
  '供應商出貨事件照常'
);
SELECT is(
  (SELECT count(*)::int FROM public.supplier_shipments WHERE order_id = 'a7600000-0000-4000-8000-000000000001'),
  1, '出貨事件留下一筆出貨紀錄(供應商讀得到)'
);

-- 2. 餐廳:只能回填收貨三欄
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000003","role":"authenticated","email":"shipcol-purchaser@example.com"}', true);
SELECT lives_ok(
  $$UPDATE public.supplier_shipments
       SET received_at = now(), received_by = 'a7000000-0000-4000-8000-000000000003', receive_status = 'ok'
     WHERE order_id = 'a7600000-0000-4000-8000-000000000001'$$,
  '採購員回填收貨三欄(收貨對話框的寫法)仍然可以'
);
SELECT throws_ok(
  $$UPDATE public.supplier_shipments SET shipped_at = '2020-01-01' WHERE order_id = 'a7600000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table supplier_shipments',
  '採購員不能改出貨時間'
);
SELECT throws_ok(
  $$UPDATE public.supplier_shipments SET supplier_id = 'a7400000-0000-4000-8000-000000000002', tracking_info = '{"carrier":"假的"}'
     WHERE order_id = 'a7600000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table supplier_shipments',
  '採購員不能改供應商與物流'
);
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated","email":"shipcol-owner@example.com"}', true);
SELECT throws_ok(
  $$UPDATE public.supplier_shipments SET confirmed_by = 'a7000000-0000-4000-8000-000000000001' WHERE order_id = 'a7600000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table supplier_shipments',
  '老闆不能改確認人'
);
SELECT throws_ok(
  $$INSERT INTO public.supplier_shipments (order_id, supplier_id, confirmed_by, shipped_at)
    VALUES ('a7600000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', '2020-01-01')$$,
  '42501', 'new row violates row-level security policy for table "supplier_shipments"',
  '老闆不能自己新增一筆(掛別家供應商的)出貨紀錄'
);

-- 3. 供應商:也不能直接改出貨紀錄(沒有 UPDATE policy,0 列)
SELECT set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000005","role":"authenticated","email":"shipcol-supplier@example.com"}', true);
UPDATE public.supplier_shipments SET received_at = '2020-01-01' WHERE order_id = 'a7600000-0000-4000-8000-000000000001';

-- 4. 管理員:收貨三欄照樣能改(其他欄位經由 API 也改不了)
SELECT set_config('request.jwt.claims',
  '{"sub":"a7000000-0000-4000-8000-000000000006","role":"authenticated","email":"shipcol-admin@example.com","app_metadata":{"role":"admin"}}', true);
SELECT lives_ok(
  $$UPDATE public.supplier_shipments SET receive_status = 'discrepancy' WHERE order_id = 'a7600000-0000-4000-8000-000000000001'$$,
  '管理員改收貨狀態可以'
);
SELECT throws_ok(
  $$UPDATE public.supplier_shipments SET tracking_info = '{}' WHERE order_id = 'a7600000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table supplier_shipments',
  '管理員經由 API 也不能改物流資訊(要改請用資料庫擁有者身分)'
);

-- 5. 結果
RESET ROLE;
SELECT is(
  (SELECT shipped_at > now() - interval '1 hour' AND supplier_id = 'a7400000-0000-4000-8000-000000000001'
          AND tracking_info = '{"carrier":"自有車隊","tracking_number":"S-1"}'::jsonb
          AND confirmed_by = 'a7000000-0000-4000-8000-000000000005'
     FROM public.supplier_shipments WHERE order_id = 'a7600000-0000-4000-8000-000000000001'),
  true, '出貨事件寫下的出貨時間、供應商、物流、確認人都沒被改掉'
);
SELECT is(
  (SELECT received_by::text || ' | ' || receive_status || ' | ' || (received_at > now() - interval '1 hour')::text
     FROM public.supplier_shipments WHERE order_id = 'a7600000-0000-4000-8000-000000000001'),
  'a7000000-0000-4000-8000-000000000003 | discrepancy | true', '收貨三欄是採購員回填、管理員改過的值(供應商那次改動沒生效)'
);

SELECT * FROM finish();
ROLLBACK;
