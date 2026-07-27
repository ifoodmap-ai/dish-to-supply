-- =====================================================================
-- 收斂匿名可讀範圍(2026-07-27 上線前安全稽核發現)
--
-- 稽核方式:用 anon key 逐張表打 PostgREST,看實際讀得到什麼。
-- 發現兩張表對未登入者完全開放,但沒有任何公開頁需要它們:
--
--   order_reviews  匿名可讀全部欄位,含 restaurant_id / reviewer_id
--                  → 任何人都能對照出「哪家餐廳跟哪家供應商買」,
--                    這是競爭情報,不該外流。評分與評語本身是公開的沒錯,
--                    但買方身分不是。
--
--   price_history  匿名可讀 459 筆逐項歷史報價(含 supplier_id)
--                  → 競爭對手可以整包抓走每家供應商 60 天的完整報價軌跡。
--                    只有登入後的餐廳頁(成本分析、菜色實驗室)需要它。
--
-- 確認過沒有任何公開頁會壞:
--   PriceIndexPage  → suppliers + supplies(這兩張是刻意公開的價格指數來源)
--   SupplierDetail  → suppliers + supplies + supplier_reviews(舊的商店評價表)
--   SuppliersPage   → suppliers
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. order_reviews:改成「當事雙方 + admin」才讀得到
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "order reviews read" ON public.order_reviews;

CREATE POLICY "order reviews read parties" ON public.order_reviews
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    -- 買方:自己店的評價
    OR restaurant_id IN (SELECT public.current_restaurant_ids())
    -- 賣方:別人給自己的評價(供應商後台「我的評價」要看)
    OR supplier_id IN (SELECT public.current_supplier_ids())
  );

-- ---------------------------------------------------------------------
-- 2. price_history:改成登入後才讀得到
--
--    註:supplies 與 suppliers 仍維持公開 —— 那是「食材價格指數」這個
--    產品刻意對外發布的資料資產,不是外洩。
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "price_history public read" ON public.price_history;

CREATE POLICY "price_history authenticated read" ON public.price_history
  FOR SELECT TO authenticated USING (true);
