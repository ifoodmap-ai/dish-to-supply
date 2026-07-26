-- =====================================================================
-- 擴充三家供應商的商品目錄
--
-- 原本只有 14 項,且與餐廳菜單的食材幾乎不重疊 —— 導致:
--   · 菜單成本毛利算不出來(大量「無市價」)
--   · 比價、定價助手、價格指數沒有樣本
--   · 媒合只能配到少數品項
-- 這裡補上台灣熱炒店常用品項,並讓三家在同品項上有價差(才有比價的意義)。
-- 價格為市場合理區間的示意值,實際上線由供應商自行維護。
-- =====================================================================

INSERT INTO public.supplies (supplier_id, name, category, unit, pack_size, price, is_available)
SELECT sup.id, x.name, x.category, x.unit, x.pack_size, x.price, TRUE
FROM (VALUES
  -- 頂鮮肉品行(肉品專門,肉類價格最有競爭力)
  ('頂鮮肉品行', '牛腩',     '肉品', 'kg', '3kg/包',  368.00),
  ('頂鮮肉品行', '牛五花片', '肉品', 'kg', '1kg/盒',  452.00),
  ('頂鮮肉品行', '豬五花',   '肉品', 'kg', '3kg/包',  198.00),
  ('頂鮮肉品行', '豬絞肉',   '肉品', 'kg', '2kg/包',  165.00),
  ('頂鮮肉品行', '雞胸肉',   '肉品', 'kg', '2kg/包',  138.00),
  ('頂鮮肉品行', '去骨雞腿', '肉品', 'kg', '2kg/包',  182.00),
  ('頂鮮肉品行', '雞蛋',     '蛋品', 'kg', '18kg/箱',  78.00),
  ('頂鮮肉品行', '大豆干',   '豆製品', 'kg', '2kg/包',  72.00),

  -- 陽光蔬果批發(蔬菜專門,葉菜類最便宜)
  ('陽光蔬果批發', '高麗菜',   '蔬菜', 'kg', '10kg/箱', 32.00),
  ('陽光蔬果批發', '大白菜',   '蔬菜', 'kg', '12kg/箱', 28.00),
  ('陽光蔬果批發', '紅蘿蔔',   '蔬菜', 'kg', '10kg/箱', 34.00),
  ('陽光蔬果批發', '洋蔥',     '蔬菜', 'kg', '20kg/袋', 26.00),
  ('陽光蔬果批發', '馬鈴薯',   '蔬菜', 'kg', '20kg/袋', 38.00),
  ('陽光蔬果批發', '小黃瓜',   '蔬菜', 'kg', '10kg/箱', 45.00),
  ('陽光蔬果批發', '牛番茄',   '蔬菜', 'kg', '10kg/箱', 52.00),
  ('陽光蔬果批發', '蒜頭',     '蔬菜', 'kg', '5kg/袋',  148.00),
  ('陽光蔬果批發', '老薑',     '蔬菜', 'kg', '5kg/袋',  95.00),
  ('陽光蔬果批發', '青江菜',   '蔬菜', 'kg', '6kg/箱',  48.00),
  ('陽光蔬果批發', '空心菜',   '蔬菜', 'kg', '6kg/箱',  42.00),
  ('陽光蔬果批發', '金針菇',   '菇類', 'kg', '5kg/箱',  88.00),
  ('陽光蔬果批發', '杏鮑菇',   '菇類', 'kg', '5kg/箱', 125.00),
  ('陽光蔬果批發', '乾木耳',   '菇類', 'kg', '1kg/包', 320.00),
  ('陽光蔬果批發', '板豆腐',   '豆製品', 'kg', '直送',   45.00),

  -- 鮮綠農產供應商(綜合型,單價普遍略高但品項最齊、有海鮮)
  ('鮮綠農產供應商', '牛腩',     '肉品', 'kg', '3kg/包', 395.00),
  ('鮮綠農產供應商', '豬五花',   '肉品', 'kg', '3kg/包', 215.00),
  ('鮮綠農產供應商', '雞胸肉',   '肉品', 'kg', '2kg/包', 152.00),
  ('鮮綠農產供應商', '高麗菜',   '蔬菜', 'kg', '10kg/箱', 38.00),
  ('鮮綠農產供應商', '紅蘿蔔',   '蔬菜', 'kg', '10kg/箱', 39.00),
  ('鮮綠農產供應商', '蒜頭',     '蔬菜', 'kg', '5kg/袋', 165.00),
  ('鮮綠農產供應商', '老薑',     '蔬菜', 'kg', '5kg/袋', 108.00),
  ('鮮綠農產供應商', '小黃瓜',   '蔬菜', 'kg', '10kg/箱', 49.00),
  ('鮮綠農產供應商', '文蛤',     '海鮮', 'kg', '3kg/袋', 168.00),
  ('鮮綠農產供應商', '白蝦',     '海鮮', 'kg', '2kg/盒', 385.00),
  ('鮮綠農產供應商', '台灣鯛魚片','海鮮', 'kg', '1kg/包', 225.00),
  ('鮮綠農產供應商', '透抽',     '海鮮', 'kg', '2kg/盒', 340.00),
  ('鮮綠農產供應商', '雞蛋',     '蛋品', 'kg', '18kg/箱', 85.00),
  ('鮮綠農產供應商', '板豆腐',   '豆製品', 'kg', '直送',   52.00),
  ('鮮綠農產供應商', '蓬萊白米', '米麵', 'kg', '30kg/包', 42.00)
) AS x(supplier, name, category, unit, pack_size, price)
JOIN public.suppliers sup ON sup.name = x.supplier
WHERE NOT EXISTS (
  SELECT 1 FROM public.supplies s WHERE s.supplier_id = sup.id AND s.name = x.name
);

-- 新品項灌進 price_history,並對到食材主檔
INSERT INTO public.price_history
  (ingredient_id, supply_id, supplier_id, raw_name, price, unit, normalized_price, region, captured_at)
SELECT m.ingredient_id, s.id, s.supplier_id, s.name, s.price, s.unit,
       s.price / COALESCE((
         SELECT uc.factor FROM public.unit_conversions uc
          WHERE uc.from_unit = s.unit
            AND (uc.ingredient_id = m.ingredient_id OR uc.ingredient_id IS NULL)
          ORDER BY uc.ingredient_id NULLS LAST LIMIT 1), 1),
       (SELECT sup.service_areas[1] FROM public.suppliers sup WHERE sup.id = s.supplier_id),
       now()
FROM public.supplies s
LEFT JOIN LATERAL (
  SELECT i.id AS ingredient_id FROM public.ingredients i
   WHERE s.name LIKE '%' || i.canonical_name || '%'
   ORDER BY length(i.canonical_name) DESC LIMIT 1
) m ON TRUE
WHERE s.price IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.price_history ph WHERE ph.supply_id = s.id);

UPDATE public.price_history ph SET ingredient_id = al.ingredient_id
  FROM public.ingredient_aliases al
 WHERE ph.ingredient_id IS NULL AND ph.raw_name LIKE '%' || al.alias || '%';

-- 菜單食材對應到主檔(含別名),讓成本計算對得上
UPDATE public.menu_dish_ingredients mi SET ingredient_id = i.id
  FROM public.ingredients i
 WHERE mi.ingredient_id IS NULL AND mi.raw_name = i.canonical_name;

UPDATE public.menu_dish_ingredients mi SET ingredient_id = al.ingredient_id
  FROM public.ingredient_aliases al
 WHERE mi.ingredient_id IS NULL AND mi.raw_name = al.alias;

-- 造 60 天的歷史價格軌跡(價格指數、漲價預警、趨勢圖需要時間序列)
-- 用穩定的偽隨機(以 supply_id 與天數推導)產生 ±12% 波動,葉菜類波動加大。
INSERT INTO public.price_history
  (ingredient_id, supply_id, supplier_id, raw_name, price, unit, normalized_price, region, captured_at)
SELECT
  ph.ingredient_id, ph.supply_id, ph.supplier_id, ph.raw_name,
  ROUND((ph.price * factor)::numeric, 2),
  ph.unit,
  ROUND((ph.normalized_price * factor)::numeric, 4),
  ph.region,
  now() - (d || ' days')::interval
FROM public.price_history ph
CROSS JOIN generate_series(7, 60, 7) AS d
CROSS JOIN LATERAL (
  SELECT 1 + (
    -- 以 supply_id 的雜湊當種子,確保同一品項的軌跡是平滑且可重現的
    sin((('x' || substr(md5(ph.supply_id::text), 1, 8))::bit(32)::int % 100) / 15.0 + d / 9.0)
    * CASE WHEN ph.raw_name ~ '菜|蔥|薑|菇' THEN 0.18 ELSE 0.07 END
  ) AS factor
) f
WHERE ph.captured_at > now() - interval '1 day'
  AND NOT EXISTS (
    SELECT 1 FROM public.price_history p2
     WHERE p2.supply_id = ph.supply_id
       AND p2.captured_at < now() - interval '1 day'
  );
