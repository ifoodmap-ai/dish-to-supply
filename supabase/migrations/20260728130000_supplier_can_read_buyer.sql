-- =====================================================================
-- 供應商看得到「跟自己下過單的餐廳」名稱
--
-- 問題:restaurants 只有 admin 與該店成員讀得到,供應商完全讀不到。
-- 結果供應商後台的收單紀錄、營運總覽、卡關訂單全部顯示「未指定餐廳」——
-- 供應商收到一張單卻不知道買家是誰,要送去哪、跟誰請款都不知道。
--
-- 範圍刻意收到最小:只有「這家餐廳確實對我下過單」才讀得到,
-- 不是讓供應商瀏覽全平台餐廳名冊。沒有交易關係就一樣讀不到。
-- =====================================================================

DROP POLICY IF EXISTS "restaurants supplier read buyers" ON public.restaurants;

CREATE POLICY "restaurants supplier read buyers" ON public.restaurants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.supplier_orders o
       WHERE o.restaurant_id = restaurants.id
         AND o.supplier_id IN (SELECT public.current_supplier_ids())
    )
  );

COMMENT ON POLICY "restaurants supplier read buyers" ON public.restaurants IS
  '供應商只讀得到對自己下過單的餐廳。沒有交易關係就看不到,不能當名冊用。';
