BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(22);

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
), (
  '10000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'restaurant-atomicity-test@ifoodmap.invalid',
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

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('缺少身分餐廳', NULL, NULL) $$,
  '42501',
  'authentication required',
  'authenticated role without a JWT subject is rejected'
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
      AND branch_id = (
        SELECT id
        FROM public.restaurant_branches
        WHERE restaurant_id = (SELECT restaurant_id FROM onboarding_result)
          AND name = '總店'
      )
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

SELECT dblink_connect(
  'onboarding_setup',
  format(
    'host=%s port=%s dbname=%I user=postgres password=postgres',
    inet_server_addr(),
    current_setting('port'),
    current_database()
  )
);
SELECT dblink_exec(
  'onboarding_setup',
  $cleanup$
    WITH deleted_restaurants AS (
      DELETE FROM public.restaurants
      WHERE id IN (
        SELECT restaurant_id
        FROM public.restaurant_accounts
        WHERE user_id = '10000000-0000-0000-0000-000000000003'::uuid
      )
      RETURNING id
    )
    DELETE FROM auth.users
    WHERE id = '10000000-0000-0000-0000-000000000003'::uuid
  $cleanup$
);
SELECT dblink_exec(
  'onboarding_setup',
  $fixture$
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
      '10000000-0000-0000-0000-000000000003'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      'restaurant-concurrency-test@ifoodmap.invalid',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  $fixture$
);

CREATE TEMP TABLE concurrent_restaurant_count_before AS
SELECT count(*) AS restaurant_count
FROM public.restaurants;
CREATE TEMP TABLE concurrent_results (
  session_name text PRIMARY KEY,
  restaurant_id uuid NOT NULL
);

SELECT dblink_connect(
  'onboarding_concurrent_one',
  format(
    'host=%s port=%s dbname=%I user=postgres password=postgres',
    inet_server_addr(),
    current_setting('port'),
    current_database()
  )
);
SELECT dblink_connect(
  'onboarding_concurrent_two',
  format(
    'host=%s port=%s dbname=%I user=postgres password=postgres',
    inet_server_addr(),
    current_setting('port'),
    current_database()
  )
);
SELECT dblink_exec(
  'onboarding_concurrent_one',
  'SET ROLE authenticated'
);
SELECT dblink_exec(
  'onboarding_concurrent_two',
  'SET ROLE authenticated'
);
SELECT dblink_exec(
  'onboarding_concurrent_one',
  $$ SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003' $$
);
SELECT dblink_exec(
  'onboarding_concurrent_two',
  $$ SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003' $$
);
SELECT dblink_send_query(
  'onboarding_concurrent_one',
  $query$
    WITH created AS MATERIALIZED (
      SELECT public.create_restaurant_onboarding(
        '並發測試餐廳',
        NULL,
        NULL
      ) AS restaurant_id
    ),
    waited AS MATERIALIZED (
      SELECT pg_sleep(1) FROM created
    )
    SELECT restaurant_id
    FROM created
    CROSS JOIN waited
  $query$
);
SELECT dblink_send_query(
  'onboarding_concurrent_two',
  $query$
    WITH created AS MATERIALIZED (
      SELECT public.create_restaurant_onboarding(
        '並發測試餐廳',
        NULL,
        NULL
      ) AS restaurant_id
    ),
    waited AS MATERIALIZED (
      SELECT pg_sleep(1) FROM created
    )
    SELECT restaurant_id
    FROM created
    CROSS JOIN waited
  $query$
);

INSERT INTO concurrent_results
SELECT
  'one',
  restaurant_id
FROM dblink_get_result('onboarding_concurrent_one')
  AS result(restaurant_id uuid);
INSERT INTO concurrent_results
SELECT
  'two',
  restaurant_id
FROM dblink_get_result('onboarding_concurrent_two')
  AS result(restaurant_id uuid);

SELECT is(
  (SELECT restaurant_id FROM concurrent_results WHERE session_name = 'one'),
  (SELECT restaurant_id FROM concurrent_results WHERE session_name = 'two'),
  'simultaneous first-time calls return the same restaurant id'
);
SELECT is(
  (SELECT count(*) FROM public.restaurants),
  (SELECT restaurant_count + 1 FROM concurrent_restaurant_count_before),
  'simultaneous first-time calls create exactly one restaurant'
);
SELECT is(
  (SELECT count(*) FROM public.restaurant_accounts
   WHERE user_id = '10000000-0000-0000-0000-000000000003'::uuid),
  1::bigint,
  'simultaneous first-time calls create exactly one account'
);

SELECT dblink_disconnect('onboarding_concurrent_one');
SELECT dblink_disconnect('onboarding_concurrent_two');
SELECT dblink_exec(
  'onboarding_setup',
  $cleanup$
    DELETE FROM public.restaurants
    WHERE id IN (
      SELECT restaurant_id
      FROM public.restaurant_accounts
      WHERE user_id = '10000000-0000-0000-0000-000000000003'::uuid
    )
  $cleanup$
);
SELECT dblink_exec(
  'onboarding_setup',
  $cleanup$
    DELETE FROM auth.users
    WHERE id = '10000000-0000-0000-0000-000000000003'::uuid
  $cleanup$
);
SELECT dblink_disconnect('onboarding_setup');

CREATE TEMP TABLE atomicity_counts_before AS
SELECT
  (SELECT count(*) FROM public.restaurants) AS restaurants,
  (SELECT count(*) FROM public.restaurant_branches) AS branches,
  (SELECT count(*) FROM public.restaurant_accounts) AS accounts;

CREATE FUNCTION pg_temp.fail_restaurant_account_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'test-only restaurant account failure'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER test_fail_restaurant_account_insert
BEFORE INSERT ON public.restaurant_accounts
FOR EACH ROW
EXECUTE FUNCTION pg_temp.fail_restaurant_account_insert();

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT throws_ok(
  $$ SELECT public.create_restaurant_onboarding('原子性測試餐廳', NULL, NULL) $$,
  'P0001',
  'test-only restaurant account failure',
  'late account failure is surfaced by onboarding'
);
RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.restaurants),
  (SELECT restaurants FROM atomicity_counts_before),
  'late account failure rolls back the restaurant'
);
SELECT is(
  (SELECT count(*) FROM public.restaurant_branches),
  (SELECT branches FROM atomicity_counts_before),
  'late account failure rolls back the default branch'
);
SELECT is(
  (SELECT count(*) FROM public.restaurant_accounts),
  (SELECT accounts FROM atomicity_counts_before),
  'late account failure does not create an account'
);

DROP TRIGGER test_fail_restaurant_account_insert
  ON public.restaurant_accounts;

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
