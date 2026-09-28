-- =====================================================================
-- Rollback:20260928170100_profiles_read_scope.sql
--
-- 把 profiles 還原成套用前的樣子:任何人(含未登入)都能讀全部、anon / authenticated 有全部權限。
-- ⚠️ 還原後,未登入就能讀到所有 user_id 與姓名的問題會回來。
--
-- 用法:整段執行,全部在同一個交易裡。可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

DROP POLICY IF EXISTS "profiles read self teammates admin" ON public.profiles;
DROP FUNCTION IF EXISTS public.restaurant_teammate_user_ids();

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT
  USING (true);

GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928170100';

NOTIFY pgrst, 'reload schema';
