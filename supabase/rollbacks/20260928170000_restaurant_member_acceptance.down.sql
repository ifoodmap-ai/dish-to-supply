-- =====================================================================
-- Rollback:20260928170000_restaurant_member_acceptance.sql
--
-- 把 restaurant_accounts 還原成套用前的樣子(policy、權限、輔助函式、欄位),並刪掉 ledger。
-- ⚠️ 還原後「有一列 = 是成員」—— 為了不讓還沒接受的邀請在還原當下直接生效,
--    **第一步**就把「邀請中」(accepted_at IS NULL)的列停用(is_active = false),不刪資料;
--    老闆之後可以在成員頁手動啟用。(放在最前面:就算不是整段一次執行,也不會有「待接受算成員」的空窗。)
-- ⚠️ 還原後,「搶先占用 email」「老闆可以任意新增/刪除成員」兩個問題會回來。
--
-- 🔴 順序(三步):
--    1) 先**單獨**跑下面的「第 0 步」UPDATE(停用所有待接受的邀請)—— 在新程式下它只是「取消邀請」,無害,可重複執行;
--       這樣退版期間舊版 notify(v4,不看 accepted_at)也不會把訂單信寄給還沒接受的人。
--    2) 把用到 accepted_at 的程式退回舊版:前端 src/lib/portal.ts、src/components/RestaurantRoute.tsx、
--       src/pages/RegisterCompletePage.tsx、src/pages/restaurant/RestaurantTeamPage.tsx、src/pages/LoginPortal.tsx
--       (+ src/lib/restaurant-invites.ts、src/components/RestaurantInvitePanel.tsx),以及 Edge Function
--       invite-restaurant-member(v3 起)與 notify(v5 起)。沒先退版就拿掉欄位的話,它們會打到不存在的欄位(PostgREST 400):
--       所有餐廳使用者會被當成沒有身分、成員頁載入失敗、邀請一律失敗、訂單信不寄給餐廳。
--    3) 再整段跑這支(兩支 rollback 都要跑的話,先跑 20260928170100_profiles_read_scope.down.sql)。
--
-- 用法:整段貼進 SQL Editor 執行(SQL Editor / Management API 會包成一個交易;psql 請加 -1)。
-- 這支檔案刻意不寫 BEGIN/COMMIT,方便用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

-- 0. 還沒接受的邀請先停用 —— 一定要在放寬輔助函式之前(不然會有一段時間把待接受算成成員)
--    (這個 UPDATE 不會觸發老闆守門 trigger:它只看原本就生效中的老闆列)
UPDATE public.restaurant_accounts
   SET is_active = false
 WHERE accepted_at IS NULL;

-- D. trigger
DROP TRIGGER IF EXISTS restaurant_accounts_keep_an_owner ON public.restaurant_accounts;
DROP TRIGGER IF EXISTS restaurant_accounts_branch_matches ON public.restaurant_accounts;
DROP FUNCTION IF EXISTS public.restaurant_accounts_keep_an_owner();
DROP FUNCTION IF EXISTS public.restaurant_accounts_branch_matches();

-- B. 受邀者 RPC
DROP FUNCTION IF EXISTS public.my_pending_restaurant_invites();
DROP FUNCTION IF EXISTS public.accept_restaurant_invite(uuid);
DROP FUNCTION IF EXISTS public.decline_restaurant_invite(uuid);

-- C. policy 與權限(還原成原本的 FOR ALL + 自己可讀)
DROP POLICY IF EXISTS "rest accounts owner update" ON public.restaurant_accounts;
DROP POLICY IF EXISTS "rest accounts self read" ON public.restaurant_accounts;

CREATE POLICY "rest accounts self read" ON public.restaurant_accounts
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR restaurant_id IN (SELECT public.current_restaurant_ids())
  );

CREATE POLICY "rest accounts owner manage" ON public.restaurant_accounts
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.restaurant_role(restaurant_id) = 'owner')
  WITH CHECK (public.is_admin() OR public.restaurant_role(restaurant_id) = 'owner');

REVOKE UPDATE (role, is_active, branch_id) ON public.restaurant_accounts FROM authenticated;
GRANT ALL ON public.restaurant_accounts TO anon;
GRANT ALL ON public.restaurant_accounts TO authenticated;

-- A. 輔助函式還原成原本的定義(不看 accepted_at)
CREATE OR REPLACE FUNCTION public.current_restaurant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.restaurant_accounts
  WHERE user_id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.restaurant_role(p_restaurant uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.restaurant_accounts
  WHERE user_id = auth.uid() AND restaurant_id = p_restaurant AND is_active
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.create_restaurant_onboarding(
  p_name text,
  p_contact_name text DEFAULT NULL::text,
  p_contact_phone text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_contact_name text := NULLIF(btrim(p_contact_name), '');
  v_contact_phone text := NULLIF(btrim(p_contact_phone), '');
  v_restaurant_id uuid;
  v_branch_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'restaurant name must contain between 2 and 100 characters'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(v_contact_name) > 80 THEN
    RAISE EXCEPTION 'contact name must not exceed 80 characters'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(v_contact_phone) > 30 THEN
    RAISE EXCEPTION 'contact phone must not exceed 30 characters'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  SELECT restaurant_id
    INTO v_restaurant_id
    FROM public.restaurant_accounts
   WHERE user_id = v_user_id
     AND is_active
   ORDER BY created_at, id
   LIMIT 1;
  IF v_restaurant_id IS NOT NULL THEN
    RETURN v_restaurant_id;
  END IF;
  INSERT INTO public.restaurants (name, contact_name, contact_phone)
  VALUES (v_name, v_contact_name, v_contact_phone)
  RETURNING id INTO v_restaurant_id;
  INSERT INTO public.restaurant_branches (restaurant_id, name)
  VALUES (v_restaurant_id, '總店')
  RETURNING id INTO v_branch_id;
  INSERT INTO public.restaurant_accounts (
    user_id,
    restaurant_id,
    branch_id,
    role,
    is_active
  )
  VALUES (
    v_user_id,
    v_restaurant_id,
    v_branch_id,
    'owner',
    true
  );
  RETURN v_restaurant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_member_directory(p_restaurant uuid)
RETURNS TABLE (
  user_id        uuid,
  email          text,
  invited_at     timestamptz,
  invite_pending boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ra.user_id,
    CASE
      WHEN public.is_admin() OR public.restaurant_role(p_restaurant) = 'owner'
      THEN u.email::text
    END AS email,
    u.invited_at,
    (u.invited_at IS NOT NULL AND u.email_confirmed_at IS NULL) AS invite_pending
  FROM public.restaurant_accounts ra
  JOIN auth.users u ON u.id = ra.user_id
  WHERE ra.restaurant_id = p_restaurant
    AND (public.is_admin() OR public.restaurant_role(p_restaurant) IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.restaurant_invite_email_status(p_restaurant uuid, p_email text)
RETURNS TABLE (
  user_id uuid,
  status  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    u.id,
    CASE
      WHEN ra.id IS NULL THEN 'other_account'
      WHEN ra.is_active  THEN 'member_active'
      ELSE 'member_inactive'
    END
  FROM auth.users u
  LEFT JOIN public.restaurant_accounts ra
         ON ra.user_id = u.id
        AND ra.restaurant_id = p_restaurant
  WHERE lower(u.email) = lower(btrim(p_email))
  ORDER BY (ra.id IS NULL), u.created_at
  LIMIT 1;
$$;

ALTER TABLE public.restaurant_accounts DROP COLUMN IF EXISTS accepted_at;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928170000';

NOTIFY pgrst, 'reload schema';
