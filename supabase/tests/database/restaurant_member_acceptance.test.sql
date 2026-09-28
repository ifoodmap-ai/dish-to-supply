-- migration 20260928170000_restaurant_member_acceptance + 20260928170100_profiles_read_scope 的資料庫層測試
-- (邀請要對方接受才生效、restaurant_accounts 的寫入權限、老闆守門 trigger、profiles 讀取範圍)
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(58);

-- ---------------------------------------------------------------------
-- fixture
--   O  = 驗收餐廳的老闆(已接受)      M  = 採購員(已接受)
--   P  = 採購員邀請(待接受)          PO = 老闆邀請(待接受)
--   X  = 別家餐廳(R2)的老闆
--   Q1、Q2 = 「雙老闆餐廳」(R3)的兩位老闆(都已接受)—— 測「改掉其中一位」這些應該成功的路徑
-- ---------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-owner@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收老闆"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-member@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收採購"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-pending@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收受邀者"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-outsider@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收路人"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-pending-owner@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收待接受老闆"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-co-owner-1@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收雙老闆一"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'acceptance-co-owner-2@ifoodmap.invalid', '', '{"provider":"email","providers":["email"]}', '{"display_name":"驗收雙老闆二"}', now(), now());

INSERT INTO public.restaurants (id, name) VALUES
  ('b1000000-0000-4000-8000-000000000001', '驗收餐廳'),
  ('b1000000-0000-4000-8000-000000000002', '別家餐廳'),
  ('b1000000-0000-4000-8000-000000000003', '雙老闆餐廳');
INSERT INTO public.restaurant_branches (id, restaurant_id, name) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', '總店'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '別家總店'),
  ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', '雙老闆總店');
INSERT INTO public.restaurant_accounts (id, user_id, restaurant_id, branch_id, role, is_active, accepted_at) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001', 'owner', true, now()),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001', 'purchaser', true, now()),
  ('c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001',
   'b2000000-0000-4000-8000-000000000001', 'purchaser', true, NULL),
  ('c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002',
   'b2000000-0000-4000-8000-000000000002', 'owner', true, now()),
  ('c1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001',
   NULL, 'owner', true, NULL),
  ('c1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000003',
   'b2000000-0000-4000-8000-000000000003', 'owner', true, now()),
  ('c1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000003',
   'b2000000-0000-4000-8000-000000000003', 'owner', true, now());
INSERT INTO public.menu_dishes (restaurant_id, name) VALUES ('b1000000-0000-4000-8000-000000000001', '驗收菜');
INSERT INTO public.supplier_orders (restaurant_id, branch_id, status)
VALUES ('b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'draft');

-- 切換 JWT 身分(兩個設定都給,跟 PostgREST 一樣)
CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;
-- 平台管理員:JWT 的 app_metadata.role = admin(is_admin() 看這個)
CREATE FUNCTION pg_temp.act_as_admin(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'))::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;

-- ---------------------------------------------------------------------
-- 1. 結構與權限
-- ---------------------------------------------------------------------
SELECT is(
  (SELECT column_default::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurant_accounts' AND column_name = 'accepted_at'),
  NULL::text,
  'accepted_at 沒有預設值:任何寫入路徑忘了設,都是「待接受」'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.restaurant_accounts', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon 讀不到 restaurant_accounts 與 profiles'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.restaurant_accounts', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.restaurant_accounts', 'DELETE'),
  'authenticated 不能 INSERT / DELETE restaurant_accounts'
);
SELECT results_eq(
  $$ SELECT c, has_column_privilege('authenticated', 'public.restaurant_accounts', c, 'UPDATE')
       FROM unnest(ARRAY['role', 'is_active', 'branch_id', 'user_id', 'restaurant_id', 'accepted_at']) AS c $$,
  $$ VALUES ('role', true), ('is_active', true), ('branch_id', true),
            ('user_id', false), ('restaurant_id', false), ('accepted_at', false) $$,
  'authenticated 只能 UPDATE role / is_active / branch_id'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.my_pending_restaurant_invites()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.accept_restaurant_invite(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.decline_restaurant_invite(uuid)', 'EXECUTE'),
  'anon 不能呼叫三支邀請 RPC'
);
SELECT is(
  (SELECT count(*) FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('my_pending_restaurant_invites', 'accept_restaurant_invite', 'decline_restaurant_invite')
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']),
  3::bigint,
  '三支邀請 RPC 都是 SECURITY DEFINER、search_path 固定為空'
);

-- ---------------------------------------------------------------------
-- 2. 待接受的受邀者讀不到那家店的任何資料
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000003');

SELECT is((SELECT count(*) FROM public.restaurants WHERE id = 'b1000000-0000-4000-8000-000000000001'),
  0::bigint, '待接受:讀不到餐廳');
SELECT is((SELECT count(*) FROM public.restaurant_branches WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000001'),
  0::bigint, '待接受:讀不到分店');
SELECT is((SELECT count(*) FROM public.restaurant_accounts WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000001'),
  0::bigint, '待接受:讀不到成員(連自己那一列也不行)');
SELECT is((SELECT count(*) FROM public.menu_dishes WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000001'),
  0::bigint, '待接受:讀不到菜單');
SELECT is((SELECT count(*) FROM public.supplier_orders WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000001'),
  0::bigint, '待接受:讀不到訂單');
SELECT is((SELECT count(*) FROM public.profiles
            WHERE user_id IN ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')),
  0::bigint, '待接受:讀不到店裡其他人的 profile');
SELECT is(public.restaurant_role('b1000000-0000-4000-8000-000000000001'), NULL::text, '待接受:restaurant_role() 是 NULL');
SELECT is((SELECT count(*) FROM public.restaurant_member_directory('b1000000-0000-4000-8000-000000000001')),
  0::bigint, '待接受:成員名錄是空的');
SELECT results_eq(
  $$ SELECT restaurant_name, role, branch_name FROM public.my_pending_restaurant_invites() $$,
  $$ VALUES ('驗收餐廳'::text, 'purchaser'::text, '總店'::text) $$,
  '待接受的人只從 my_pending_restaurant_invites() 看到邀請內容'
);

-- ---------------------------------------------------------------------
-- 3. profiles:自己 + 同店成員(含邀請中);別家店只看到自己
-- ---------------------------------------------------------------------
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000001');
SELECT set_eq(
  $$ SELECT display_name FROM public.profiles $$,
  $$ VALUES ('驗收老闆'::text), ('驗收採購'::text), ('驗收受邀者'::text), ('驗收待接受老闆'::text) $$,
  '老闆讀得到自己與同店成員(含邀請中)的 profile'
);
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000004');
SELECT set_eq(
  $$ SELECT display_name FROM public.profiles $$,
  $$ VALUES ('驗收路人'::text) $$,
  '別家店的老闆只讀得到自己的 profile'
);
SELECT pg_temp.act_as_admin('a1000000-0000-4000-8000-000000000004');
SELECT is(
  (SELECT count(*) FROM public.profiles WHERE user_id::text LIKE 'a1000000-0000-4000-8000-%'),
  7::bigint,
  '平台管理員讀得到所有人的 profile'
);

-- ---------------------------------------------------------------------
-- 4. 老闆的寫入權限
-- ---------------------------------------------------------------------
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000001');
SELECT throws_ok(
  $$ INSERT INTO public.restaurant_accounts (user_id, restaurant_id, role, accepted_at)
     VALUES ('a1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'owner', now()) $$,
  '42501', 'permission denied for table restaurant_accounts',
  '老闆不能 INSERT 成員(替任意 user_id 加人)'
);
SELECT throws_ok(
  $$ DELETE FROM public.restaurant_accounts WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '42501', 'permission denied for table restaurant_accounts',
  '老闆不能 DELETE 成員'
);
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET user_id = 'a1000000-0000-4000-8000-000000000004'
      WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '42501', 'permission denied for table restaurant_accounts',
  '老闆改不了成員的 user_id'
);
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET restaurant_id = 'b1000000-0000-4000-8000-000000000002'
      WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '42501', 'permission denied for table restaurant_accounts',
  '老闆改不了成員的 restaurant_id'
);
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET accepted_at = now() WHERE id = 'c1000000-0000-4000-8000-000000000003' $$,
  '42501', 'permission denied for table restaurant_accounts',
  '老闆不能替受邀者押 accepted_at'
);
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'manager' WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '老闆可以改自己店員的 role'
);
SELECT is((SELECT role FROM public.restaurant_accounts WHERE id = 'c1000000-0000-4000-8000-000000000002'),
  'manager', '…而且真的改成店長了');
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'manager' WHERE id = 'c1000000-0000-4000-8000-000000000001' $$,
  '23514', '每家餐廳至少要保留一位啟用中的老闆',
  '唯一的老闆不能把自己降級(待接受的老闆邀請不算老闆)'
);
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET is_active = false WHERE id = 'c1000000-0000-4000-8000-000000000001' $$,
  '23514', '每家餐廳至少要保留一位啟用中的老闆',
  '唯一的老闆不能停用自己'
);
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'purchaser' WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000001' $$,
  '23514', '每家餐廳至少要保留一位啟用中的老闆',
  '一次改整家店的多列也擋得住'
);
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET branch_id = 'b2000000-0000-4000-8000-000000000002'
      WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '23503', '分店不屬於這家餐廳',
  '成員不能綁到別家店的分店'
);
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'purchaser' WHERE id = 'c1000000-0000-4000-8000-000000000004' $$,
  '改別家店的成員不會報錯(RLS 直接過濾成 0 列,下面複查)'
);

-- 店長(M)與待接受的老闆(PO)都不能管理成員
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000002');
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'owner' WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '店長把自己升成老闆不會報錯(RLS 過濾成 0 列,下面複查)'
);
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000005');
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'purchaser' WHERE id = 'c1000000-0000-4000-8000-000000000002' $$,
  '待接受的老闆改成員 role 不會報錯(RLS 過濾成 0 列,下面複查)'
);
SELECT isnt(
  public.create_restaurant_onboarding('驗收自己的店', NULL, NULL),
  'b1000000-0000-4000-8000-000000000001'::uuid,
  '有待接受的邀請也能建自己的店(不會被當成已經有餐廳、也不會被帶進邀請者的店)'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT id::text, role FROM public.restaurant_accounts
      WHERE id IN ('c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000004')
      ORDER BY id $$,
  $$ VALUES ('c1000000-0000-4000-8000-000000000002'::text, 'manager'::text),
            ('c1000000-0000-4000-8000-000000000004', 'owner') $$,
  '別家店的列、店長自己升級、待接受老闆的操作都沒有生效'
);

-- ---------------------------------------------------------------------
-- 4b. 有兩位老闆時:改掉其中一位可以;同一句把兩位都降掉不行
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000006');
SELECT throws_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'manager' WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000003' $$,
  '23514', '每家餐廳至少要保留一位啟用中的老闆',
  '兩位老闆在同一句裡一起被降級 → 擋下'
);
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'manager' WHERE id = 'c1000000-0000-4000-8000-000000000007' $$,
  '兩位老闆時,把另一位降成店長可以'
);
SELECT is((SELECT role FROM public.restaurant_accounts WHERE id = 'c1000000-0000-4000-8000-000000000007'),
  'manager', '…真的降成店長了');
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET role = 'owner' WHERE id = 'c1000000-0000-4000-8000-000000000007' $$,
  '再把他升回老闆'
);
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000007');
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET is_active = false WHERE id = 'c1000000-0000-4000-8000-000000000006' $$,
  '兩位老闆時,停用另一位可以'
);
SELECT lives_ok(
  $$ UPDATE public.restaurant_accounts SET is_active = true WHERE id = 'c1000000-0000-4000-8000-000000000006' $$,
  '…再把他啟用回來'
);
RESET ROLE;
SELECT lives_ok(
  $$ DELETE FROM auth.users WHERE id = 'a1000000-0000-4000-8000-000000000007' $$,
  '兩位老闆時,刪掉其中一位的 auth 帳號(cascade)不會被擋'
);
SELECT is(
  (SELECT count(*) FROM public.restaurant_accounts
    WHERE restaurant_id = 'b1000000-0000-4000-8000-000000000003' AND role = 'owner' AND is_active AND accepted_at IS NOT NULL),
  1::bigint,
  '…雙老闆餐廳剩下一位啟用中的老闆'
);

-- ---------------------------------------------------------------------
-- 5. 接受 / 拒絕只能處理自己那一筆待接受的邀請
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000004');
SELECT throws_ok(
  $$ SELECT public.accept_restaurant_invite('c1000000-0000-4000-8000-000000000003') $$,
  'P0001', 'invite not found', '別人不能替受邀者接受'
);
SELECT throws_ok(
  $$ SELECT public.decline_restaurant_invite('c1000000-0000-4000-8000-000000000003') $$,
  'P0001', 'invite not found', '別人不能替受邀者拒絕'
);
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000001');
SELECT throws_ok(
  $$ SELECT public.accept_restaurant_invite('c1000000-0000-4000-8000-000000000003') $$,
  'P0001', 'invite not found', '老闆也不能替受邀者接受'
);
SELECT throws_ok(
  $$ SELECT public.decline_restaurant_invite('c1000000-0000-4000-8000-000000000001') $$,
  'P0001', 'invite not found', 'decline 刪不掉已生效的成員資格'
);
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000003');
SELECT is(
  public.accept_restaurant_invite('c1000000-0000-4000-8000-000000000003'),
  'b1000000-0000-4000-8000-000000000001'::uuid,
  '受邀者接受自己的邀請,回傳餐廳 id'
);
SELECT is(public.restaurant_role('b1000000-0000-4000-8000-000000000001'), 'purchaser', '接受之後才是成員');
SELECT is((SELECT count(*) FROM public.restaurants WHERE id = 'b1000000-0000-4000-8000-000000000001'),
  1::bigint, '接受之後讀得到餐廳');
SELECT throws_ok(
  $$ SELECT public.accept_restaurant_invite('c1000000-0000-4000-8000-000000000003') $$,
  'P0001', 'invite not found', '已接受的邀請不能再接受一次'
);
SELECT pg_temp.act_as('a1000000-0000-4000-8000-000000000005');
SELECT lives_ok(
  $$ SELECT public.decline_restaurant_invite('c1000000-0000-4000-8000-000000000005') $$,
  '待接受的老闆拒絕自己的邀請'
);
SELECT is((SELECT count(*) FROM public.my_pending_restaurant_invites()), 0::bigint, '拒絕之後沒有待接受的邀請');
RESET ROLE;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.restaurant_accounts WHERE id = 'c1000000-0000-4000-8000-000000000005'),
  '拒絕 = 那一筆邀請被刪掉'
);

-- ---------------------------------------------------------------------
-- 6. anon
-- ---------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$ SELECT * FROM public.profiles $$,
  '42501', 'permission denied for table profiles', 'anon 讀不到 profiles'
);
SELECT throws_ok(
  $$ SELECT * FROM public.my_pending_restaurant_invites() $$,
  '42501', 'permission denied for function my_pending_restaurant_invites', 'anon 不能呼叫 my_pending_restaurant_invites'
);
RESET ROLE;

-- ---------------------------------------------------------------------
-- 7. 老闆守門 trigger 也擋 cascade(但整家餐廳刪掉時不擋)
-- ---------------------------------------------------------------------
SELECT throws_ok(
  $$ DELETE FROM auth.users WHERE id = 'a1000000-0000-4000-8000-000000000001' $$,
  '23514', '每家餐廳至少要保留一位啟用中的老闆',
  '刪掉唯一老闆的 auth 帳號(cascade)也會被擋'
);
SELECT lives_ok(
  $$ DELETE FROM public.restaurants WHERE id = 'b1000000-0000-4000-8000-000000000002' $$,
  '整家餐廳刪掉時,cascade 刪掉它的老闆不會被擋'
);
SELECT is(
  (SELECT count(*) FROM public.restaurant_accounts WHERE id = 'c1000000-0000-4000-8000-000000000004'),
  0::bigint,
  '…別家餐廳的老闆列跟著被刪掉'
);

SELECT * FROM finish();
ROLLBACK;
