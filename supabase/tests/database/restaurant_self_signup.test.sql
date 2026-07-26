BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

CREATE TEMP TABLE jwt_state AS
SELECT
  current_setting('request.jwt.claims', true) AS claims,
  current_setting('request.jwt.claim.sub', true) AS subject;

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'restaurant-onboarding-test@ifoodmap.invalid',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

SELECT is(
  has_function_privilege(
    'anon',
    'public.create_restaurant_onboarding(text,text,text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot execute restaurant onboarding'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('匿名餐廳', NULL, NULL) $$,
  '42501',
  'permission denied for function create_restaurant_onboarding',
  'anonymous invocation is denied'
);
RESET ROLE;

CREATE TEMP TABLE restaurant_count_before AS
SELECT count(*) AS restaurant_count
FROM public.restaurants;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

CREATE TEMP TABLE onboarding_result (restaurant_id uuid);
INSERT INTO onboarding_result
SELECT public.create_restaurant_onboarding(
  '  測試餐廳  ',
  '  王小明  ',
  '  02-2345-6789  '
);

RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.restaurants),
  (SELECT restaurant_count + 1 FROM restaurant_count_before),
  'authenticated caller creates exactly one restaurant'
);

CREATE TEMP TABLE restaurant_count_after_first AS
SELECT count(*) AS restaurant_count
FROM public.restaurants;

SELECT is(
  (SELECT name FROM public.restaurants
   WHERE id = (SELECT restaurant_id FROM onboarding_result)),
  '測試餐廳',
  'restaurant name is trimmed before storage'
);

SELECT is(
  (SELECT count(*) FROM public.restaurant_branches
   WHERE restaurant_id = (SELECT restaurant_id FROM onboarding_result)
     AND name = '總店'),
  1::bigint,
  'onboarding creates one default branch named 總店'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.restaurant_accounts
    WHERE restaurant_id = (SELECT restaurant_id FROM onboarding_result)
      AND user_id = '10000000-0000-0000-0000-000000000001'::uuid
      AND role = 'owner'
      AND is_active
  ),
  'caller becomes the active restaurant owner'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

CREATE TEMP TABLE repeated_result (restaurant_id uuid);
INSERT INTO repeated_result
SELECT public.create_restaurant_onboarding(
  '另一間餐廳',
  '另一位聯絡人',
  '0912-345-678'
);

RESET ROLE;

SELECT is(
  (SELECT restaurant_id FROM repeated_result),
  (SELECT restaurant_id FROM onboarding_result),
  'repeated onboarding returns the existing restaurant id'
);

SELECT is(
  (SELECT count(*) FROM public.restaurants),
  (SELECT restaurant_count FROM restaurant_count_after_first),
  'repeated onboarding does not duplicate the restaurant'
);

SELECT is(
  (SELECT count(*) FROM public.restaurant_branches
   WHERE restaurant_id = (SELECT restaurant_id FROM onboarding_result)),
  1::bigint,
  'repeated onboarding does not duplicate the default branch'
);

SELECT is(
  (SELECT count(*) FROM public.restaurant_accounts
   WHERE user_id = '10000000-0000-0000-0000-000000000001'::uuid
     AND is_active),
  1::bigint,
  'repeated onboarding does not duplicate the restaurant account'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('', NULL, NULL) $$,
  '22023',
  'restaurant name must contain between 2 and 100 characters',
  'empty restaurant name is rejected'
);

SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('一', NULL, NULL) $$,
  '22023',
  'restaurant name must contain between 2 and 100 characters',
  'too-short restaurant name is rejected'
);

SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('合法餐廳', repeat('1', 81), NULL) $$,
  '22023',
  'contact name must not exceed 80 characters',
  'overlong contact name is rejected'
);

SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('合法餐廳', NULL, repeat('1', 31)) $$,
  '22023',
  'contact phone must not exceed 30 characters',
  'overlong phone is rejected'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  COALESCE((SELECT claims FROM jwt_state), ''),
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  COALESCE((SELECT subject FROM jwt_state), ''),
  true
);

SELECT * FROM finish();
ROLLBACK;
