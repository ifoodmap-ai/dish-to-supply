-- =====================================================================
-- profiles 不再公開:未登入讀不到,登入者只讀得到自己、同店成員、(平台管理員)全部
--
-- 為什麼(2026-09-28):原本的「Profiles are viewable by everyone」是 USING (true),
-- anon 也有 SELECT —— 不用登入就能拿到全部 user_id 與姓名(display_name 預設還是
-- email 的 @ 前面那段)。搭配「老闆可以替任意 user_id 新增成員」,攻擊者就拿得到別人的 user_id。
--
-- app 裡實際讀 profiles 的只有一處:餐廳「分店與成員」頁(RestaurantTeamPage)
-- 用成員的 user_id 查 display_name。供應商、管理員、公開頁、形象站、Edge Function 都沒有讀它;
-- 新帳號的 profile 由 handle_new_user()(SECURITY DEFINER trigger)建立,不受影響。
--
-- 「同店成員」= 我已生效、啟用中的那些店裡的所有成員(含邀請中的人,成員頁要顯示他們的名字)。
-- 待接受的受邀者不是成員,讀不到那家店任何人的資料。
--
-- 對應 rollback:supabase/rollbacks/20260928170100_profiles_read_scope.down.sql
-- =====================================================================

-- 我是成員的店裡,所有成員的 user_id(RLS 用;SECURITY DEFINER 才讀得到別人的列)
CREATE OR REPLACE FUNCTION public.restaurant_teammate_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ra.user_id
    FROM public.restaurant_accounts ra
   WHERE ra.restaurant_id IN (SELECT public.current_restaurant_ids());
$$;

COMMENT ON FUNCTION public.restaurant_teammate_user_ids() IS
  'profiles RLS 用:目前登入者已生效、啟用中的餐廳裡所有成員(含邀請中)的 user_id。';

REVOKE ALL ON FUNCTION public.restaurant_teammate_user_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_teammate_user_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.restaurant_teammate_user_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_teammate_user_ids() TO service_role;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "profiles read self teammates admin" ON public.profiles;

CREATE POLICY "profiles read self teammates admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR user_id IN (SELECT public.restaurant_teammate_user_ids())
  );

-- anon 什麼都沒有;authenticated 只留 app 用得到的 SELECT / INSERT / UPDATE
-- (INSERT / UPDATE 仍受原本「只能動自己那一列」的 policy 限制)
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
