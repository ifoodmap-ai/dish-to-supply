-- =====================================================================
-- 餐廳成員邀請:老闆在「分店與成員」頁新增成員
--
-- 真正的邀請(建 auth user + 寄邀請信 + 寫 restaurant_accounts)由 Edge Function
-- invite-restaurant-member 用 service role 執行。這個 migration 只新增兩支「唯讀」
-- 函式,不動任何既有的資料表、欄位、policy 或資料。
--
--   1. restaurant_member_directory(p_restaurant)
--      成員頁用來顯示「邀請中」(還沒點信裡的連結),以及讓老闆看到成員的 email。
--      auth.users 前端讀不到,只能經由 SECURITY DEFINER 函式,而且只回「自己店」的成員。
--
--   2. restaurant_invite_email_status(p_restaurant, p_email)
--      Edge Function 寄信前檢查這個 email:沒有帳號 / 已是本店成員 / 已經是別的帳號。
--      🔴 只開給 service_role —— 開給一般登入者,它就是一個「查某個 email 有沒有註冊」的探測器。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 成員名錄(給成員頁)
-- ---------------------------------------------------------------------
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
    -- 「邀請中」= 被邀請、但還沒點信裡的連結(點了 GoTrue 才會押 email_confirmed_at)
    (u.invited_at IS NOT NULL AND u.email_confirmed_at IS NULL) AS invite_pending
  FROM public.restaurant_accounts ra
  JOIN auth.users u ON u.id = ra.user_id
  WHERE ra.restaurant_id = p_restaurant
    -- 只有該店啟用中的成員(或平台管理員)查得到,其他人一律拿到空集合
    AND (public.is_admin() OR public.restaurant_role(p_restaurant) IS NOT NULL);
$$;

COMMENT ON FUNCTION public.restaurant_member_directory(uuid) IS
  '成員頁用:回傳該店成員的邀請狀態;email 只給老闆/平台管理員。非該店成員拿到空集合。';

REVOKE ALL ON FUNCTION public.restaurant_member_directory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_member_directory(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restaurant_member_directory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_member_directory(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 2. 寄邀請前的 email 檢查(只給 Edge Function)
-- ---------------------------------------------------------------------
-- 回傳 0 列 = 這個 email 沒有任何帳號,可以邀請。
-- 回傳 1 列時 status 為:
--   member_active   已經是本店啟用中的成員
--   member_inactive 曾是本店成員、目前停用(應該在列表按「啟用」,不是重新邀請)
--   other_account   已經有帳號、但不是本店成員(供應商、別家餐廳、平台管理員、註冊到一半…)
--                   → Edge Function 一律拒絕,不默默把人綁進來
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

COMMENT ON FUNCTION public.restaurant_invite_email_status(uuid, text) IS
  'invite-restaurant-member Edge Function 專用:寄邀請前檢查 email 是否已有帳號。只給 service_role。';

REVOKE ALL ON FUNCTION public.restaurant_invite_email_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_invite_email_status(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_invite_email_status(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_invite_email_status(uuid, text) TO service_role;
