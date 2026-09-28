-- =====================================================================
-- 餐廳成員改成「邀請 → 對方接受才生效」,並收緊 restaurant_accounts 的寫入權限
--
-- 為什麼(2026-09-28 檢查 invite-restaurant-member 時發現):
--   1. 搶先占用 email:邀請一建立,成員資格就立刻生效。任何人都能自助註冊成老闆,
--      再邀請一個還沒註冊的 email;對方日後用這個 email 登入,會直接落進邀請者的店。
--   2. 「rest accounts owner manage」是 FOR ALL:老闆可以直接打 API 替任意 user_id
--      新增成員、硬刪成員,或把最後一位老闆降級/停用,讓整家店沒有老闆。
--
-- 做法:
--   A. restaurant_accounts.accepted_at:NULL = 待接受。預設值就是 NULL ——
--      任何寫入路徑忘了設,結果都是「不生效」而不是「直接生效」。既有資料一律回填成已生效。
--      「是成員」= is_active AND accepted_at IS NOT NULL。current_restaurant_ids()、
--      restaurant_role() 改成這個判斷,所以掛在這兩支輔助函式上的 RLS(訂單、菜單、
--      分店、餐廳…)全部自動不把待接受算進去。
--   B. 受邀者用三支 RPC 處理自己的邀請(SECURITY DEFINER、search_path 固定為空、
--      只碰 auth.uid() 自己那一筆待接受的列):
--        my_pending_restaurant_invites() / accept_restaurant_invite(id) / decline_restaurant_invite(id)
--   C. 權限:
--      - anon 對這張表什麼都沒有;authenticated 只剩 SELECT 與
--        UPDATE (role, is_active, branch_id) —— 欄位層級 GRANT,改不了 user_id /
--        restaurant_id / accepted_at(老闆不能替別人「接受」邀請)。
--      - 沒有 INSERT / DELETE:新增只走 create_restaurant_onboarding()(自助註冊,
--        SECURITY DEFINER)或 Edge Function(service role);移除成員請用「停用」。
--      - UPDATE 的 policy 只給該店「已接受、啟用中」的老闆與平台管理員。
--      - 待接受的受邀者連自己那一列都讀不到(邀請內容只從 my_pending_restaurant_invites() 拿)。
--   D. trigger:
--      - 任何 UPDATE / DELETE 做完之後,只要某家(還存在的)店沒有「已接受、啟用中的老闆」
--        就整筆拒絕。AFTER ROW:多列一次改也看得到最終狀態;先鎖住餐廳那一列,
--        兩個人同時各降一位老闆也不會一起過。整家餐廳被刪(cascade)不擋。
--      - branch_id 必須是同一家店的分店。
--
-- 對應 rollback:supabase/rollbacks/20260928170000_restaurant_member_acceptance.down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. 邀請狀態
-- ---------------------------------------------------------------------
ALTER TABLE public.restaurant_accounts
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- 既有資料一律視為已生效(套用當下線上沒有任何「邀請中」的列)
UPDATE public.restaurant_accounts
   SET accepted_at = created_at
 WHERE accepted_at IS NULL;

COMMENT ON COLUMN public.restaurant_accounts.accepted_at IS
  '受邀者按「接受」的時間。NULL = 待接受:不是成員,RLS 與所有輔助函式都不算。自助註冊建店時直接押 now()。';

-- 「是成員」的判斷:已接受 + 啟用中
CREATE OR REPLACE FUNCTION public.current_restaurant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.restaurant_accounts
  WHERE user_id = auth.uid() AND is_active AND accepted_at IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.restaurant_role(p_restaurant uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.restaurant_accounts
  WHERE user_id = auth.uid() AND restaurant_id = p_restaurant AND is_active AND accepted_at IS NOT NULL
  LIMIT 1
$$;

-- 自助註冊:只把「已生效」的成員資格當成「已經有餐廳」;自己建的店直接押 accepted_at。
-- (有待接受的邀請也照樣能建自己的店 —— 邀請不會搶走註冊流程。)
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
     AND accepted_at IS NOT NULL
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
    is_active,
    accepted_at
  )
  VALUES (
    v_user_id,
    v_restaurant_id,
    v_branch_id,
    'owner',
    true,
    now()
  );
  RETURN v_restaurant_id;
END;
$$;

-- 成員頁:「邀請中」改成「還沒按接受」(簽名不變,前端照舊呼叫)
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
    -- email 只給該店老闆與平台管理員;店長、採購員拿到 null
    CASE
      WHEN public.is_admin() OR public.restaurant_role(p_restaurant) = 'owner'
      THEN u.email::text
    END AS email,
    u.invited_at,
    -- 「邀請中」= 還沒按「接受」(不論有沒有點過邀請信)
    (ra.accepted_at IS NULL) AS invite_pending
  FROM public.restaurant_accounts ra
  JOIN auth.users u ON u.id = ra.user_id
  WHERE ra.restaurant_id = p_restaurant
    -- 只有該店已生效、啟用中的成員(或平台管理員)查得到,其他人(含待接受的受邀者)拿到空集合
    AND (public.is_admin() OR public.restaurant_role(p_restaurant) IS NOT NULL);
$$;

-- Edge Function 寄信前的檢查:多一種 member_pending(已邀請、還沒接受)
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
      WHEN ra.id IS NULL             THEN 'other_account'
      WHEN NOT ra.is_active          THEN 'member_inactive'
      WHEN ra.accepted_at IS NULL    THEN 'member_pending'
      ELSE 'member_active'
    END
  FROM auth.users u
  LEFT JOIN public.restaurant_accounts ra
         ON ra.user_id = u.id
        AND ra.restaurant_id = p_restaurant
  WHERE lower(u.email) = lower(btrim(p_email))
  ORDER BY (ra.id IS NULL), u.created_at
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- B. 受邀者自己的三支 RPC
-- ---------------------------------------------------------------------
-- 我有哪些待接受的邀請(只回顯示需要的欄位;餐廳已停用或邀請被停用的不列)
CREATE OR REPLACE FUNCTION public.my_pending_restaurant_invites()
RETURNS TABLE (
  invite_id       uuid,
  restaurant_name text,
  role            text,
  branch_name     text,
  invited_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ra.id, r.name, ra.role, b.name, ra.created_at
    FROM public.restaurant_accounts ra
    JOIN public.restaurants r ON r.id = ra.restaurant_id
    LEFT JOIN public.restaurant_branches b ON b.id = ra.branch_id
   WHERE ra.user_id = auth.uid()
     AND ra.accepted_at IS NULL
     AND ra.is_active
     AND r.is_active
   ORDER BY ra.created_at, ra.id;
$$;

-- 接受:只能是自己的、待接受、啟用中、餐廳也啟用中的那一筆。回傳餐廳 id。
CREATE OR REPLACE FUNCTION public.accept_restaurant_invite(p_invite uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_restaurant uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.restaurant_accounts ra
     SET accepted_at = now()
   WHERE ra.id = p_invite
     AND ra.user_id = v_uid
     AND ra.accepted_at IS NULL
     AND ra.is_active
     AND EXISTS (
       SELECT 1 FROM public.restaurants r
        WHERE r.id = ra.restaurant_id AND r.is_active
     )
  RETURNING ra.restaurant_id INTO v_restaurant;

  IF v_restaurant IS NULL THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0001', HINT = 'invite_not_found';
  END IF;
  RETURN v_restaurant;
END;
$$;

-- 拒絕:刪掉自己那一筆待接受的邀請(已接受的成員資格不能用這支刪)
CREATE OR REPLACE FUNCTION public.decline_restaurant_invite(p_invite uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.restaurant_accounts ra
   WHERE ra.id = p_invite
     AND ra.user_id = v_uid
     AND ra.accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0001', HINT = 'invite_not_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.my_pending_restaurant_invites() IS
  '受邀者用:列出自己待接受的餐廳邀請(餐廳名、角色、分店)。';
COMMENT ON FUNCTION public.accept_restaurant_invite(uuid) IS
  '受邀者用:接受自己的一筆待接受邀請,成為該店成員。回傳餐廳 id。';
COMMENT ON FUNCTION public.decline_restaurant_invite(uuid) IS
  '受邀者用:拒絕(刪除)自己的一筆待接受邀請。';

REVOKE ALL ON FUNCTION public.my_pending_restaurant_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_pending_restaurant_invites() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_pending_restaurant_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pending_restaurant_invites() TO service_role;

REVOKE ALL ON FUNCTION public.accept_restaurant_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_restaurant_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_restaurant_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_restaurant_invite(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.decline_restaurant_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_restaurant_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_restaurant_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_restaurant_invite(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- C. RLS 與欄位層級權限
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "rest accounts owner manage" ON public.restaurant_accounts;
DROP POLICY IF EXISTS "rest accounts self read" ON public.restaurant_accounts;

-- 讀:平台管理員 / 自己「已接受」的列 / 自己是成員的店的所有列(含邀請中的人,成員頁要顯示)
CREATE POLICY "rest accounts self read" ON public.restaurant_accounts
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (user_id = auth.uid() AND accepted_at IS NOT NULL)
    OR restaurant_id IN (SELECT public.current_restaurant_ids())
  );

-- 改:只有該店已生效的老闆(與平台管理員);能改哪些欄位由下面的欄位 GRANT 決定
CREATE POLICY "rest accounts owner update" ON public.restaurant_accounts
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.restaurant_role(restaurant_id) = 'owner')
  WITH CHECK (public.is_admin() OR public.restaurant_role(restaurant_id) = 'owner');

-- (PG17 的 ALL 也包含 MAINTAIN,一起收掉)
REVOKE ALL ON public.restaurant_accounts FROM anon;
REVOKE ALL ON public.restaurant_accounts FROM authenticated;
GRANT SELECT ON public.restaurant_accounts TO authenticated;
GRANT UPDATE (role, is_active, branch_id) ON public.restaurant_accounts TO authenticated;

-- ---------------------------------------------------------------------
-- D. trigger
-- ---------------------------------------------------------------------
-- 每家(還存在的)店都要留一位「已接受、啟用中」的老闆
CREATE OR REPLACE FUNCTION public.restaurant_accounts_keep_an_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 鎖住餐廳那一列:同一家店的「降級/停用/刪除老闆」排隊檢查,併發也不會一起過。
  -- 餐廳本身已被刪掉(cascade)就不用管。
  PERFORM 1 FROM public.restaurants r WHERE r.id = OLD.restaurant_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.restaurant_accounts ra
     WHERE ra.restaurant_id = OLD.restaurant_id
       AND ra.role = 'owner'
       AND ra.is_active
       AND ra.accepted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '每家餐廳至少要保留一位啟用中的老闆'
      USING ERRCODE = '23514',
            DETAIL = format('restaurant_id=%s', OLD.restaurant_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_accounts_keep_an_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_accounts_keep_an_owner() FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_accounts_keep_an_owner() FROM authenticated;

DROP TRIGGER IF EXISTS restaurant_accounts_keep_an_owner ON public.restaurant_accounts;
CREATE TRIGGER restaurant_accounts_keep_an_owner
  AFTER UPDATE OR DELETE ON public.restaurant_accounts
  FOR EACH ROW
  -- 只有「原本是生效中的老闆」的列被改或被刪,才可能讓店裡沒有老闆
  WHEN (OLD.role = 'owner' AND OLD.is_active AND OLD.accepted_at IS NOT NULL)
  EXECUTE FUNCTION public.restaurant_accounts_keep_an_owner();

-- 成員綁的分店必須是同一家店的
CREATE OR REPLACE FUNCTION public.restaurant_accounts_branch_matches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.restaurant_branches b
     WHERE b.id = NEW.branch_id
       AND b.restaurant_id = NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION '分店不屬於這家餐廳' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_accounts_branch_matches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_accounts_branch_matches() FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_accounts_branch_matches() FROM authenticated;

DROP TRIGGER IF EXISTS restaurant_accounts_branch_matches ON public.restaurant_accounts;
CREATE TRIGGER restaurant_accounts_branch_matches
  BEFORE INSERT OR UPDATE OF branch_id, restaurant_id ON public.restaurant_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.restaurant_accounts_branch_matches();

NOTIFY pgrst, 'reload schema';
