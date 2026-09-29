-- migration 20260929110200_order_receipt_dispute_rpc 的資料庫層測試
-- (確認收貨/回報異常、申請爭議改成一次交易:事件先寫,畫面過期或任何一步失敗就整筆回滾,不留子表資料;
--  照呼叫者權限跑:不是這家店的成員寫不進去;admin_delete_order 先鎖訂單、照常刪乾淨)
--
-- 整段包在 BEGIN … ROLLBACK:fixture 與事件都不會留下來,pg_net 的通知佇列也跟著回滾(不會寄信)。
-- 「兩個人同時按」要兩條連線,單一交易測不到:這裡用「前一個人已經處理完、後一個人拿舊畫面送出」模擬後到的那一方;
-- 真正的並發另外在本機替身與正式庫(測試單)用兩個並行交易實測(見交付說明)。
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(39);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a3100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rpc-owner@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rpc-manager@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rpc-purchaser@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rpc-supplier@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rpc-admin@example.com', '', '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rpc-outsider@example.com', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
INSERT INTO public.restaurants (id, name) VALUES
  ('a3200000-0000-4000-8000-000000000001', 'RPC 驗收餐廳'),
  ('a3200000-0000-4000-8000-000000000002', 'RPC 驗收別家餐廳');
INSERT INTO public.restaurant_accounts (user_id, restaurant_id, role, is_active, accepted_at) VALUES
  ('a3100000-0000-4000-8000-000000000001', 'a3200000-0000-4000-8000-000000000001', 'owner', true, now()),
  ('a3100000-0000-4000-8000-000000000002', 'a3200000-0000-4000-8000-000000000001', 'manager', true, now()),
  ('a3100000-0000-4000-8000-000000000003', 'a3200000-0000-4000-8000-000000000001', 'purchaser', true, now()),
  ('a3100000-0000-4000-8000-000000000007', 'a3200000-0000-4000-8000-000000000002', 'owner', true, now());
INSERT INTO public.suppliers (id, name) VALUES ('a3400000-0000-4000-8000-000000000001', 'RPC 驗收供應商');
INSERT INTO public.supplier_accounts (user_id, supplier_id) VALUES
  ('a3100000-0000-4000-8000-000000000005', 'a3400000-0000-4000-8000-000000000001');

-- r* = 待收貨(r1、r2、r4、r5、r6 有出貨紀錄,r3 沒有);s* = 收貨有差異(申請爭議用)
INSERT INTO public.supplier_orders (id, restaurant_id, supplier_id, status, total_amount) VALUES
  ('a3600000-0000-4000-8000-0000000000a1', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'delivered', 1000),
  ('a3600000-0000-4000-8000-0000000000a2', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'delivered', 1000),
  ('a3600000-0000-4000-8000-0000000000a3', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'delivered', 1000),
  ('a3600000-0000-4000-8000-0000000000a4', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'delivered', 1000),
  ('a3600000-0000-4000-8000-0000000000a5', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'delivered', 1000),
  ('a3600000-0000-4000-8000-0000000000a6', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'delivered', 1000),
  ('a3600000-0000-4000-8000-0000000000b1', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'discrepancy', 1000),
  ('a3600000-0000-4000-8000-0000000000b2', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'discrepancy', 1000),
  ('a3600000-0000-4000-8000-0000000000b3', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'discrepancy', 1000),
  ('a3600000-0000-4000-8000-0000000000b4', 'a3200000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001', 'discrepancy', 1000);
INSERT INTO public.supplier_shipments (id, order_id, supplier_id, shipped_at) VALUES
  ('a3700000-0000-4000-8000-0000000000a1', 'a3600000-0000-4000-8000-0000000000a1', 'a3400000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('a3700000-0000-4000-8000-0000000000a2', 'a3600000-0000-4000-8000-0000000000a2', 'a3400000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('a3700000-0000-4000-8000-0000000000a4', 'a3600000-0000-4000-8000-0000000000a4', 'a3400000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('a3700000-0000-4000-8000-0000000000a5', 'a3600000-0000-4000-8000-0000000000a5', 'a3400000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('a3700000-0000-4000-8000-0000000000a6', 'a3600000-0000-4000-8000-0000000000a6', 'a3400000-0000-4000-8000-000000000001', now() - interval '1 day');

-- ---------------------------------------------------------------------
-- 0. 權限
-- ---------------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.restaurant_receive_order(uuid,text,boolean,text,text,jsonb,integer)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.restaurant_open_dispute(uuid,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.restaurant_receive_order(uuid,text,boolean,text,text,jsonb,integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.restaurant_open_dispute(uuid,text,text,text)', 'EXECUTE'),
  '登入者可以呼叫兩支 RPC,anon 不行'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.restaurant_receive_order(uuid,text,boolean,text,text,jsonb,integer)'::regprocedure)
  AND NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.restaurant_open_dispute(uuid,text,text,text)'::regprocedure),
  '兩支 RPC 都是 SECURITY INVOKER(照呼叫者權限跑,RLS 與 guard 照常)'
);
-- 鎖順序只能用兩條連線驗(見交付說明的並發測試);這裡守住原始碼:鎖訂單那一行一定要在,而且在第一個 DELETE 之前
SELECT ok(
  (SELECT position(d.lock_stmt IN d.src) > 0
          AND position(d.lock_stmt IN d.src) < position('DELETE FROM public.order_reviews' IN d.src)
     FROM (SELECT pg_get_functiondef('public.admin_delete_order(uuid,text)'::regprocedure) AS src,
                  'FROM public.supplier_orders WHERE id = p_order_id FOR UPDATE' AS lock_stmt) d),
  'admin_delete_order 先鎖訂單(FOR UPDATE)、再刪子表'
);

-- ---------------------------------------------------------------------
-- 1. 確認收貨
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000003","role":"authenticated","email":"rpc-purchaser@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a1', 'delivered', false, NULL, NULL, '[]', 2)$$,
  '採購員確認收貨(沒照片、沒差異)'
);
RESET ROLE;
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a3600000-0000-4000-8000-0000000000a1'), 'received', '訂單變成待評價(received)');
SELECT is(
  (SELECT receive_status || ' | ' || received_by::text FROM public.supplier_shipments WHERE id = 'a3700000-0000-4000-8000-0000000000a1'),
  'ok | a3100000-0000-4000-8000-000000000003', '出貨紀錄回填收貨(ok、收貨人是採購員)'
);
SELECT is((SELECT count(*)::int FROM public.delivery_receipts WHERE order_id = 'a3600000-0000-4000-8000-0000000000a1'), 0, '沒照片、沒差異就不留送貨單(跟原本一樣)');
SELECT is(
  (SELECT payload->>'shipment_id' FROM public.order_events WHERE order_id = 'a3600000-0000-4000-8000-0000000000a1' AND to_status = 'received'),
  'a3700000-0000-4000-8000-0000000000a1', '事件內容記著出貨紀錄 id'
);

-- 回報收貨異常(有照片、有差異)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated","email":"rpc-owner@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a2', 'delivered', true, '少兩顆', 'data:image/jpeg;base64,AAAA',
      '[{"name":"高麗菜","expected":"10","received":"8","unit":"顆","note":null}]', 2)$$,
  '老闆回報收貨異常'
);
RESET ROLE;
SELECT is((SELECT status FROM public.supplier_orders WHERE id = 'a3600000-0000-4000-8000-0000000000a2'), 'discrepancy', '訂單變成收貨有差異');
SELECT is(
  (SELECT has_discrepancy::text || ' | ' || jsonb_array_length(discrepancies)::text || ' | ' || shipment_id::text || ' | ' || uploaded_by::text || ' | ' || (image_url IS NOT NULL)::text
     FROM public.delivery_receipts WHERE order_id = 'a3600000-0000-4000-8000-0000000000a2'),
  'true | 1 | a3700000-0000-4000-8000-0000000000a2 | a3100000-0000-4000-8000-000000000001 | true',
  '留一筆送貨單(有差異、差異明細、連到出貨紀錄、上傳者是老闆、有照片)'
);
SELECT is(
  (SELECT e.payload->>'receipt_id' FROM public.order_events e WHERE e.order_id = 'a3600000-0000-4000-8000-0000000000a2' AND e.to_status = 'discrepancy'),
  (SELECT r.id::text FROM public.delivery_receipts r WHERE r.order_id = 'a3600000-0000-4000-8000-0000000000a2'),
  '事件內容的 receipt_id 就是那筆送貨單'
);
SELECT is((SELECT receive_status FROM public.supplier_shipments WHERE id = 'a3700000-0000-4000-8000-0000000000a2'), 'discrepancy', '出貨紀錄的收貨狀態是 discrepancy');

-- 沒有出貨紀錄的單也能收貨
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000002","role":"authenticated","email":"rpc-manager@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a3', 'delivered', false)$$,
  '沒有出貨紀錄的單,店長也能確認收貨'
);
RESET ROLE;
SELECT is(
  (SELECT status || ' | ' || coalesce(e.payload->>'shipment_id', 'null') FROM public.supplier_orders o JOIN public.order_events e ON e.order_id = o.id AND e.to_status = 'received'
    WHERE o.id = 'a3600000-0000-4000-8000-0000000000a3'),
  'received | null', '收貨成功,事件裡沒有出貨紀錄 id'
);

-- ---------------------------------------------------------------------
-- 2. 後到的人(畫面過期):整筆被擋,子表一筆都沒留
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
-- a4:老闆先按「回報異常」(留下送貨單),採購員拿舊畫面按「確認收貨」
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated","email":"rpc-owner@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a4', 'delivered', true, '破了一箱', NULL, '[{"name":"雞蛋","expected":"10","received":"9"}]', 1)$$,
  '老闆先回報異常'
);
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000003","role":"authenticated","email":"rpc-purchaser@example.com"}', true);
SELECT throws_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a4', 'delivered', false, NULL, 'data:image/jpeg;base64,BBBB', '[]', 1)$$,
  'P0001', '這張訂單的狀態已經變成「收貨有差異」,畫面上的資料過期了,請重新整理後再操作',
  '採購員拿舊畫面確認收貨(還附了照片):畫面過期'
);
-- a5:採購員先確認收貨,老闆拿舊畫面回報異常(附照片與差異)
SELECT lives_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a5', 'delivered', false, NULL, NULL, '[]', 1)$$,
  '採購員先確認收貨'
);
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated","email":"rpc-owner@example.com"}', true);
SELECT throws_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a5', 'delivered', true, '少一箱', 'data:image/jpeg;base64,CCCC', '[{"name":"雞蛋","expected":"10","received":"9"}]', 1)$$,
  'P0001', '這張訂單的狀態已經變成「待評價」,畫面上的資料過期了,請重新整理後再操作',
  '老闆拿舊畫面回報異常:畫面過期'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.delivery_receipts WHERE order_id = 'a3600000-0000-4000-8000-0000000000a4'),
  1, 'a4 只有老闆那一筆送貨單(採購員的照片沒留下來)'
);
SELECT is(
  (SELECT receive_status || ' | ' || received_by::text FROM public.supplier_shipments WHERE id = 'a3700000-0000-4000-8000-0000000000a4'),
  'discrepancy | a3100000-0000-4000-8000-000000000001', 'a4 的出貨紀錄維持老闆回報的 discrepancy(沒被改成 ok)'
);
SELECT is(
  (SELECT count(*)::int FROM public.delivery_receipts WHERE order_id = 'a3600000-0000-4000-8000-0000000000a5'),
  0, 'a5 沒有任何送貨單(老闆那次連照片帶差異整筆回滾)'
);
SELECT is(
  (SELECT receive_status || ' | ' || received_by::text FROM public.supplier_shipments WHERE id = 'a3700000-0000-4000-8000-0000000000a5'),
  'ok | a3100000-0000-4000-8000-000000000003', 'a5 的出貨紀錄維持採購員的 ok'
);
SELECT is(
  (SELECT string_agg(to_status, ',') FROM public.order_events WHERE order_id IN ('a3600000-0000-4000-8000-0000000000a4', 'a3600000-0000-4000-8000-0000000000a5')),
  'discrepancy,received', '兩張單各只有先到的那一筆事件'
);

-- ---------------------------------------------------------------------
-- 3. 不是這家店的成員:寫不進去,什麼都不留
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000005","role":"authenticated","email":"rpc-supplier@example.com"}', true);
SELECT throws_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a6', 'delivered', false)$$,
  '42501', '你不是這家餐廳的成員(或邀請還沒接受),不能操作這張訂單',
  '供應商不能替餐廳確認收貨'
);
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000007","role":"authenticated","email":"rpc-outsider@example.com"}', true);
SELECT throws_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a6', 'delivered', true, 'x', 'data:image/jpeg;base64,DDDD', '[]', 1)$$,
  '42501', '你不是這家餐廳的成員(或邀請還沒接受),不能操作這張訂單',
  '別家餐廳的老闆不能回報這家的收貨'
);
RESET ROLE;
SELECT is(
  (SELECT o.status || ' | ' || (SELECT count(*) FROM public.delivery_receipts r WHERE r.order_id = o.id)::text || ' | ' ||
          coalesce((SELECT s.receive_status FROM public.supplier_shipments s WHERE s.order_id = o.id), 'NULL')
     FROM public.supplier_orders o WHERE o.id = 'a3600000-0000-4000-8000-0000000000a6'),
  'delivered | 0 | NULL', 'a6 原封不動(還是待收貨、沒有送貨單、出貨紀錄沒被回填)'
);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  $$SELECT public.restaurant_receive_order('a3600000-0000-4000-8000-0000000000a6', 'delivered', false)$$,
  '42501', NULL,
  '未登入不能呼叫'
);
RESET ROLE;

-- ---------------------------------------------------------------------
-- 4. 申請爭議處理
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated","email":"rpc-owner@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_open_dispute('a3600000-0000-4000-8000-0000000000b1', 'discrepancy', 'shortage', '少了兩箱,供應商不回應')$$,
  '老闆申請爭議'
);
RESET ROLE;
SELECT is(
  (SELECT o.status || ' | ' || d.kind || ' | ' || d.status || ' | ' || d.opened_role || ' | ' || d.opened_by::text || ' | ' || d.detail
     FROM public.supplier_orders o JOIN public.disputes d ON d.order_id = o.id WHERE o.id = 'a3600000-0000-4000-8000-0000000000b1'),
  'disputed | shortage | open | restaurant | a3100000-0000-4000-8000-000000000001 | 少了兩箱,供應商不回應',
  '訂單變成爭議中,爭議案件(類型、開案人、說明)一起寫進去'
);
SELECT is(
  (SELECT e.payload->>'dispute_id' FROM public.order_events e WHERE e.order_id = 'a3600000-0000-4000-8000-0000000000b1' AND e.to_status = 'disputed'),
  (SELECT d.id::text FROM public.disputes d WHERE d.order_id = 'a3600000-0000-4000-8000-0000000000b1'),
  '事件內容的 dispute_id 就是那筆爭議案件'
);
-- 後到的人:畫面過期,不留第二筆爭議案件
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000002","role":"authenticated","email":"rpc-manager@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_open_dispute('a3600000-0000-4000-8000-0000000000b2', 'discrepancy', 'quality', '菜是爛的')$$,
  '店長先申請爭議'
);
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated","email":"rpc-owner@example.com"}', true);
SELECT throws_ok(
  $$SELECT public.restaurant_open_dispute('a3600000-0000-4000-8000-0000000000b2', 'discrepancy', 'shortage', '我也要申請')$$,
  'P0001', '這張訂單的狀態已經變成「爭議中」,畫面上的資料過期了,請重新整理後再操作',
  '老闆拿舊畫面再申請一次:畫面過期'
);
-- 爭議類型不合法:事件一起回滾
SELECT throws_ok(
  $$SELECT public.restaurant_open_dispute('a3600000-0000-4000-8000-0000000000b3', 'discrepancy', 'bogus', '亂填的類型')$$,
  '23514', NULL,
  '爭議類型不合法被 CHECK 擋下'
);
SELECT set_config('request.jwt.claims', '{"sub":"a3100000-0000-4000-8000-000000000003","role":"authenticated","email":"rpc-purchaser@example.com"}', true);
SELECT lives_ok(
  $$SELECT public.restaurant_open_dispute('a3600000-0000-4000-8000-0000000000b4', 'discrepancy', 'late', NULL)$$,
  '採購員也能申請爭議(說明可不填,跟原本一樣)'
);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.disputes WHERE order_id = 'a3600000-0000-4000-8000-0000000000b2'), 1, 'b2 只有一筆爭議案件');
SELECT is(
  (SELECT o.status || ' | ' || (SELECT count(*) FROM public.order_events e WHERE e.order_id = o.id)::text || ' | ' ||
          (SELECT count(*) FROM public.disputes d WHERE d.order_id = o.id)::text
     FROM public.supplier_orders o WHERE o.id = 'a3600000-0000-4000-8000-0000000000b3'),
  'discrepancy | 0 | 0', '類型不合法:狀態沒變、沒有事件、沒有爭議案件(整筆回滾)'
);

-- ---------------------------------------------------------------------
-- 5. admin_delete_order 照常刪乾淨
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a3100000-0000-4000-8000-000000000006","role":"authenticated","app_metadata":{"role":"admin"}}', true);
SELECT is(public.admin_delete_order('a3600000-0000-4000-8000-0000000000a2', '測試清理'), true, '管理員刪單成功');
RESET ROLE;
SELECT is(
  (SELECT (SELECT count(*) FROM public.supplier_orders WHERE id = 'a3600000-0000-4000-8000-0000000000a2')
        + (SELECT count(*) FROM public.order_events WHERE order_id = 'a3600000-0000-4000-8000-0000000000a2')
        + (SELECT count(*) FROM public.delivery_receipts WHERE order_id = 'a3600000-0000-4000-8000-0000000000a2')
        + (SELECT count(*) FROM public.supplier_shipments WHERE order_id = 'a3600000-0000-4000-8000-0000000000a2'))::int,
  0, '訂單、事件、送貨單、出貨紀錄全部刪掉'
);

SELECT * FROM finish();
ROLLBACK;
