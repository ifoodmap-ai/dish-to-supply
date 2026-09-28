-- =====================================================================
-- 餐廳新增成員:原子化的頻率限制(給 invite-restaurant-member Edge Function 用)
--
-- 為什麼不能在 Edge Function 裡「先數再做」:同時送出多個請求時,每個請求數到的
-- 都是同一個數字,全部過關 —— 有人自助註冊一家空殼餐廳,就能一口氣把全專案每小時
-- 100 封的 Auth 寄信額度吃光(所有人的忘記密碼信跟著寄不出去),也能不限次數地
-- 拿「這個 Email 已經有帳號」的回應去探測誰有註冊。
--
-- 做法:同一家店的申請用 advisory lock 排隊,在同一個交易裡「數 + 記一筆」。
-- 每一次通過授權與格式檢查的嘗試都算(包含最後回 409 的),所以探測也一起被限速。
--
-- 只新增一張表與一支函式,不動任何既有的表、欄位、policy 或資料。
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_invite_attempts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_invite_attempts_rest_time
  ON public.restaurant_invite_attempts (restaurant_id, created_at DESC);

COMMENT ON TABLE public.restaurant_invite_attempts IS
  '新增成員的嘗試紀錄(只給頻率限制用,不含個資)。只有 service_role / claim_restaurant_invite_slot() 碰得到。';

-- 開 RLS、不給任何 policy、收回 anon / authenticated 權限:前端完全碰不到
ALTER TABLE public.restaurant_invite_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_invite_attempts FROM PUBLIC;
REVOKE ALL ON public.restaurant_invite_attempts FROM anon;
REVOKE ALL ON public.restaurant_invite_attempts FROM authenticated;

-- 回傳 true = 拿到名額(已記一筆);false = 這一小時已達上限
CREATE OR REPLACE FUNCTION public.claim_restaurant_invite_slot(
  p_restaurant uuid,
  p_limit integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- 同一家店的請求在這裡排隊,計數與寫入在同一把鎖、同一個交易裡完成
  PERFORM pg_advisory_xact_lock(hashtextextended('restaurant_invite:' || p_restaurant::text, 0));

  -- 順手清掉這家店一天前的紀錄,表不會無限長大
  DELETE FROM public.restaurant_invite_attempts
   WHERE restaurant_id = p_restaurant
     AND created_at < now() - interval '1 day';

  SELECT count(*) INTO v_count
    FROM public.restaurant_invite_attempts
   WHERE restaurant_id = p_restaurant
     AND created_at > now() - interval '1 hour';

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.restaurant_invite_attempts (restaurant_id) VALUES (p_restaurant);
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.claim_restaurant_invite_slot(uuid, integer) IS
  'invite-restaurant-member 專用:原子化地佔一個「新增成員」名額(每店每小時上限)。只給 service_role。';

REVOKE ALL ON FUNCTION public.claim_restaurant_invite_slot(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_restaurant_invite_slot(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_restaurant_invite_slot(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_invite_slot(uuid, integer) TO service_role;
