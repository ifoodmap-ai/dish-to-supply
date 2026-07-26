-- =====================================================================
-- 三端後台地基:餐廳端資料表 + 訂單全生命週期事件流 + 資料主檔
-- 對應 docs/PORTALS_PLAN.md 第 1、4、5 節
--
-- 這個 migration 是後面所有頁面的契約。設計原則:
--   1. 訂單狀態機定死,每次變更 append 一筆 order_events(只寫不改)
--   2. received 只能由餐廳端觸發 —— 這是 GMV 可信度的來源
--   3. 食材主檔建立規格標準化的基礎(1 箱 = 10 台斤 = 6 公斤)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 餐廳端
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.restaurants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  tax_id       TEXT,                       -- 統一編號
  cuisine_type TEXT,                       -- 火鍋/日式/早餐/中式…
  seats        INT,
  address      TEXT,
  city         TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_line TEXT,
  monthly_revenue_band TEXT,               -- 用於同儕比較,非精確值
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_branches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  address        TEXT,
  receiving_hours TEXT,                    -- 收貨時段,如「09:00-11:00」
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES public.restaurant_branches(id) ON DELETE SET NULL,
  -- owner 老闆(全部) / manager 店長(採購收貨簽核,看得到成本) / purchaser 採購員(只能建需求,看不到成本)
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','manager','purchaser')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, restaurant_id)
);

-- 餐廳的菜色與售價(接既有 dishes / dish_supplies,這裡放餐廳自己的售價與份數)
CREATE TABLE IF NOT EXISTS public.menu_dishes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sell_price    NUMERIC(10,2),
  servings      INT NOT NULL DEFAULT 1,
  category      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  source_analysis_id UUID,                 -- 從哪次 AI 菜單分析來的
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 每道菜的食材組成(成本計算的基礎)
CREATE TABLE IF NOT EXISTS public.menu_dish_ingredients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_dish_id   UUID NOT NULL REFERENCES public.menu_dishes(id) ON DELETE CASCADE,
  ingredient_id  UUID,                     -- 對到 ingredients 主檔(可為 null,尚未對上)
  raw_name       TEXT NOT NULL,            -- AI 辨識出的原始名稱
  quantity       NUMERIC(12,3),
  unit           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_accounts_user ON public.restaurant_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_branches_rest ON public.restaurant_branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_dishes_rest ON public.menu_dishes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_dish_ing_dish ON public.menu_dish_ingredients(menu_dish_id);

-- ---------------------------------------------------------------------
-- 1b. 共用 helper(需在餐廳端資料表之後建立)
-- ---------------------------------------------------------------------

-- 目前使用者所屬的餐廳(可多間)
CREATE OR REPLACE FUNCTION public.current_restaurant_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT restaurant_id FROM public.restaurant_accounts
  WHERE user_id = auth.uid() AND is_active
$$;

-- 目前使用者在某餐廳的角色
CREATE OR REPLACE FUNCTION public.restaurant_role(p_restaurant UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.restaurant_accounts
  WHERE user_id = auth.uid() AND restaurant_id = p_restaurant AND is_active
  LIMIT 1
$$;

-- 目前使用者所屬的供應商
CREATE OR REPLACE FUNCTION public.current_supplier_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT supplier_id FROM public.supplier_accounts
  WHERE user_id = auth.uid() AND is_active
$$;


-- ---------------------------------------------------------------------
-- 2. 訂單全生命週期
-- ---------------------------------------------------------------------

-- 2.1 supplier_orders 擴充成完整狀態機
ALTER TABLE public.supplier_orders
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id     UUID REFERENCES public.restaurant_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by    UUID,          -- 建立需求的人(採購員)
  ADD COLUMN IF NOT EXISTS approved_by   UUID,          -- 簽核的人(店長)
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS current_stage_since TIMESTAMPTZ NOT NULL DEFAULT now();

-- 舊的 status CHECK(若存在)換成完整狀態機
ALTER TABLE public.supplier_orders DROP CONSTRAINT IF EXISTS supplier_orders_status_check;
ALTER TABLE public.supplier_orders ADD CONSTRAINT supplier_orders_status_check
  CHECK (status IN (
    'draft','submitted','dispatched','accepted','quoted','confirmed',
    'shipped','in_transit','delivered','received','reviewed','closed',
    -- 異常分支
    'rejected','discrepancy','disputed','cancelled','expired',
    -- 相容既有資料
    'pending','sent','completed'
  ));

CREATE INDEX IF NOT EXISTS idx_supplier_orders_restaurant ON public.supplier_orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status_since ON public.supplier_orders(status, current_stage_since);

-- 2.2 事件流 —— 只 append,不 update、不 delete
CREATE TABLE IF NOT EXISTS public.order_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID,                        -- 系統事件為 null
  actor_role  TEXT NOT NULL CHECK (actor_role IN ('restaurant','supplier','admin','system')),
  actor_label TEXT,                        -- 顯示用:「採購員 小陳」
  source      TEXT NOT NULL CHECK (source IN
                ('restaurant_portal','supplier_portal','admin_portal','line_bot','api','cron','system')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_order_events_created ON public.order_events(created_at DESC);

-- 事件寫入時同步更新訂單狀態與停留起算時間(狀態機的單一入口)
CREATE OR REPLACE FUNCTION public.apply_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.supplier_orders
     SET status = NEW.to_status,
         current_stage_since = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_order_event ON public.order_events;
CREATE TRIGGER trg_apply_order_event
AFTER INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.apply_order_event();

-- 事件不可竄改
CREATE OR REPLACE FUNCTION public.reject_order_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_order_events_immutable ON public.order_events;
CREATE TRIGGER trg_order_events_immutable
BEFORE UPDATE OR DELETE ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.reject_order_event_mutation();

-- 2.3 出貨/收貨
ALTER TABLE public.supplier_shipments
  ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by    UUID,
  ADD COLUMN IF NOT EXISTS receive_status TEXT
      CHECK (receive_status IS NULL OR receive_status IN ('ok','discrepancy'));

-- 送貨單拍照對帳
CREATE TABLE IF NOT EXISTS public.delivery_receipts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  shipment_id  UUID REFERENCES public.supplier_shipments(id) ON DELETE SET NULL,
  image_url    TEXT,
  ai_parsed    JSONB,                      -- AI 解析出的品項/數量/單價
  discrepancies JSONB,                     -- 與訂單的差異明細
  has_discrepancy BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4 交易評價(必須確有收貨才能評)
CREATE TABLE IF NOT EXISTS public.order_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  supplier_id   UUID,
  rating_overall  INT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_ontime   INT CHECK (rating_ontime BETWEEN 1 AND 5),
  rating_quality  INT CHECK (rating_quality BETWEEN 1 AND 5),
  rating_accuracy INT CHECK (rating_accuracy BETWEEN 1 AND 5),
  comment       TEXT,
  reviewer_id   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

-- 2.5 平台 NPS
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  audience    TEXT NOT NULL CHECK (audience IN ('restaurant','supplier')),
  score       INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  reason      TEXT,
  context     TEXT,                        -- 觸發情境,如「第 2 次收貨後」
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.6 爭議
CREATE TABLE IF NOT EXISTS public.disputes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('shortage','late','quality','wrong_item','other')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  opened_by   UUID,
  opened_role TEXT CHECK (opened_role IN ('restaurant','supplier','admin','system')),
  detail      TEXT,
  resolution  TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order ON public.disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes(status);

-- ---------------------------------------------------------------------
-- 3. 資料主檔(規格標準化引擎)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ingredients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,     -- 標準名稱:高麗菜
  category       TEXT,                     -- 蔬菜/肉品/海鮮/乾貨/調味
  base_unit      TEXT NOT NULL DEFAULT 'kg',
  season_months  INT[],                    -- 產季月份,支撐當季建議
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ingredient_aliases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  alias         TEXT NOT NULL,             -- 甘藍 / 捲心菜 / 高麗菜心
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alias)
);

-- 單位換算:1 箱 = 10 台斤;1 台斤 = 0.6 公斤
CREATE TABLE IF NOT EXISTS public.unit_conversions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,  -- null = 通用換算
  from_unit     TEXT NOT NULL,
  to_unit       TEXT NOT NULL,
  factor        NUMERIC(14,6) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ingredient_id, from_unit, to_unit)
);

CREATE TABLE IF NOT EXISTS public.ingredient_substitutes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id  UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  substitute_id  UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  similarity     NUMERIC(3,2) NOT NULL DEFAULT 0.7 CHECK (similarity BETWEEN 0 AND 1),
  note           TEXT,                     -- 口味影響說明
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ingredient_id, substitute_id),
  CHECK (ingredient_id <> substitute_id)
);

-- 價格快照(價格指數 + 漲價預警的資料源)
CREATE TABLE IF NOT EXISTS public.price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE SET NULL,
  supply_id     UUID,
  supplier_id   UUID,
  raw_name      TEXT NOT NULL,
  price         NUMERIC(12,2) NOT NULL,
  unit          TEXT,
  normalized_price NUMERIC(12,4),          -- 換算成 base_unit 後的單價,比價用
  region        TEXT,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_ing_time ON public.price_history(ingredient_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_alias ON public.ingredient_aliases(alias);

-- ---------------------------------------------------------------------
-- 4. 供應商成長工具
-- ---------------------------------------------------------------------

-- 商機推播:這些餐廳在找你有的品項,但沒問到你
CREATE TABLE IF NOT EXISTS public.supplier_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  analysis_id   UUID,
  matched_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  score         INT,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','viewed','contacted','won','lost','dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_leads_supplier ON public.supplier_leads(supplier_id, status);

-- 履約指標(定期彙總,雙邊都看得到)
CREATE TABLE IF NOT EXISTS public.supplier_metrics (
  supplier_id       UUID PRIMARY KEY,
  orders_total      INT NOT NULL DEFAULT 0,
  ontime_rate       NUMERIC(5,2),
  shortage_rate     NUMERIC(5,2),
  avg_reply_minutes INT,
  avg_rating        NUMERIC(3,2),
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. 平台
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT NOT NULL,
  model        TEXT,
  prompt_tokens     INT,
  completion_tokens INT,
  latency_ms   INT,
  ok           BOOLEAN NOT NULL DEFAULT TRUE,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON public.ai_usage(created_at DESC);

-- ---------------------------------------------------------------------
-- 6. 投資人頁區塊 3 → 4(加入餐廳端系統)
-- ---------------------------------------------------------------------

ALTER TABLE public.roadmap_features DROP CONSTRAINT IF EXISTS roadmap_features_block_check;
ALTER TABLE public.roadmap_features ADD CONSTRAINT roadmap_features_block_check
  CHECK (block IN ('ai_matching','restaurant_portal','procurement','supplier_portal'));

-- 「買家採購入口」本來就是餐廳端的功能,歸位
UPDATE public.roadmap_features
   SET block = 'restaurant_portal'
 WHERE title = '買家採購入口';

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------

ALTER TABLE public.restaurants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_branches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_dishes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_dish_ingredients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_aliases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_substitutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage               ENABLE ROW LEVEL SECURITY;

-- 7.1 餐廳:成員看自己的店,admin 全看
DROP POLICY IF EXISTS "restaurants member read" ON public.restaurants;
CREATE POLICY "restaurants member read" ON public.restaurants FOR SELECT TO authenticated
  USING (public.is_admin() OR id IN (SELECT public.current_restaurant_ids()));

DROP POLICY IF EXISTS "restaurants owner write" ON public.restaurants;
CREATE POLICY "restaurants owner write" ON public.restaurants FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.restaurant_role(id) IN ('owner','manager'))
  WITH CHECK (public.is_admin() OR public.restaurant_role(id) IN ('owner','manager'));

DROP POLICY IF EXISTS "restaurants admin all" ON public.restaurants;
CREATE POLICY "restaurants admin all" ON public.restaurants FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "branches member" ON public.restaurant_branches;
CREATE POLICY "branches member" ON public.restaurant_branches FOR ALL TO authenticated
  USING (public.is_admin() OR restaurant_id IN (SELECT public.current_restaurant_ids()))
  WITH CHECK (public.is_admin() OR public.restaurant_role(restaurant_id) IN ('owner','manager'));

DROP POLICY IF EXISTS "rest accounts self read" ON public.restaurant_accounts;
CREATE POLICY "rest accounts self read" ON public.restaurant_accounts FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid() OR restaurant_id IN (SELECT public.current_restaurant_ids()));

DROP POLICY IF EXISTS "rest accounts owner manage" ON public.restaurant_accounts;
CREATE POLICY "rest accounts owner manage" ON public.restaurant_accounts FOR ALL TO authenticated
  USING (public.is_admin() OR public.restaurant_role(restaurant_id) = 'owner')
  WITH CHECK (public.is_admin() OR public.restaurant_role(restaurant_id) = 'owner');

-- 7.2 菜單:店內成員可讀寫(採購員在前端隱藏成本,不是靠 RLS)
DROP POLICY IF EXISTS "menu dishes member" ON public.menu_dishes;
CREATE POLICY "menu dishes member" ON public.menu_dishes FOR ALL TO authenticated
  USING (public.is_admin() OR restaurant_id IN (SELECT public.current_restaurant_ids()))
  WITH CHECK (public.is_admin() OR restaurant_id IN (SELECT public.current_restaurant_ids()));

DROP POLICY IF EXISTS "menu dish ing member" ON public.menu_dish_ingredients;
CREATE POLICY "menu dish ing member" ON public.menu_dish_ingredients FOR ALL TO authenticated
  USING (public.is_admin() OR menu_dish_id IN (
    SELECT id FROM public.menu_dishes WHERE restaurant_id IN (SELECT public.current_restaurant_ids())))
  WITH CHECK (public.is_admin() OR menu_dish_id IN (
    SELECT id FROM public.menu_dishes WHERE restaurant_id IN (SELECT public.current_restaurant_ids())));

-- 7.3 事件流:當事雙方可讀,admin 全讀;只能 INSERT(不可改刪,trigger 再擋一層)
DROP POLICY IF EXISTS "order events read" ON public.order_events;
CREATE POLICY "order events read" ON public.order_events FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR order_id IN (SELECT id FROM public.supplier_orders
                     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
                        OR supplier_id   IN (SELECT public.current_supplier_ids()))
  );

DROP POLICY IF EXISTS "order events insert" ON public.order_events;
CREATE POLICY "order events insert" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR order_id IN (SELECT id FROM public.supplier_orders
                     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
                        OR supplier_id   IN (SELECT public.current_supplier_ids()))
  );

-- 7.4 收貨:餐廳端才能上傳送貨單
DROP POLICY IF EXISTS "receipts party" ON public.delivery_receipts;
CREATE POLICY "receipts party" ON public.delivery_receipts FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR order_id IN (SELECT id FROM public.supplier_orders
                     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
                        OR supplier_id   IN (SELECT public.current_supplier_ids()))
  )
  WITH CHECK (
    public.is_admin()
    OR order_id IN (SELECT id FROM public.supplier_orders
                     WHERE restaurant_id IN (SELECT public.current_restaurant_ids()))
  );

-- 7.5 評價:必須是自己店的訂單、且已收貨
DROP POLICY IF EXISTS "order reviews read" ON public.order_reviews;
CREATE POLICY "order reviews read" ON public.order_reviews FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "order reviews insert" ON public.order_reviews;
CREATE POLICY "order reviews insert" ON public.order_reviews FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR order_id IN (
      SELECT id FROM public.supplier_orders
       WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
         AND status IN ('received','reviewed','closed','discrepancy','disputed')
    )
  );

DROP POLICY IF EXISTS "order reviews admin" ON public.order_reviews;
CREATE POLICY "order reviews admin" ON public.order_reviews FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.6 NPS:自己寫、admin 讀
DROP POLICY IF EXISTS "nps insert own" ON public.nps_responses;
CREATE POLICY "nps insert own" ON public.nps_responses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "nps admin read" ON public.nps_responses;
CREATE POLICY "nps admin read" ON public.nps_responses FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

-- 7.7 爭議:當事雙方 + admin
DROP POLICY IF EXISTS "disputes party" ON public.disputes;
CREATE POLICY "disputes party" ON public.disputes FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR order_id IN (SELECT id FROM public.supplier_orders
                     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
                        OR supplier_id   IN (SELECT public.current_supplier_ids()))
  )
  WITH CHECK (
    public.is_admin()
    OR order_id IN (SELECT id FROM public.supplier_orders
                     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
                        OR supplier_id   IN (SELECT public.current_supplier_ids()))
  );

-- 7.8 資料主檔:公開唯讀(價格指數/替代建議要用),admin 維護
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ingredients','ingredient_aliases','unit_conversions',
                           'ingredient_substitutes','price_history']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' public read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
                   t || ' public read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' admin write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
                   t || ' admin write', t);
  END LOOP;
END $$;

-- 7.9 供應商成長工具:只看自己的
DROP POLICY IF EXISTS "leads own" ON public.supplier_leads;
CREATE POLICY "leads own" ON public.supplier_leads FOR ALL TO authenticated
  USING (public.is_admin() OR supplier_id IN (SELECT public.current_supplier_ids()))
  WITH CHECK (public.is_admin() OR supplier_id IN (SELECT public.current_supplier_ids()));

DROP POLICY IF EXISTS "metrics read" ON public.supplier_metrics;
CREATE POLICY "metrics read" ON public.supplier_metrics FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "metrics admin write" ON public.supplier_metrics;
CREATE POLICY "metrics admin write" ON public.supplier_metrics FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7.10 AI 用量:只有 admin
DROP POLICY IF EXISTS "ai usage admin" ON public.ai_usage;
CREATE POLICY "ai usage admin" ON public.ai_usage FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. 便利檢視:卡關預警(admin 首頁待辦與 /admin/pipeline 用)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW public.order_pipeline AS
SELECT
  o.id,
  o.status,
  o.restaurant_id,
  o.supplier_id,
  o.total_amount,
  o.current_stage_since,
  EXTRACT(EPOCH FROM (now() - o.current_stage_since)) / 3600 AS hours_in_stage,
  CASE o.status
    WHEN 'dispatched' THEN 24
    WHEN 'accepted'   THEN 24
    WHEN 'quoted'     THEN 48
    WHEN 'shipped'    THEN 48
    WHEN 'delivered'  THEN 72
    WHEN 'received'   THEN 168
    ELSE NULL
  END AS sla_hours,
  o.created_at
FROM public.supplier_orders o
WHERE o.status NOT IN ('closed','cancelled','rejected');

COMMENT ON VIEW public.order_pipeline IS
  '進行中訂單 + 各階段停留時數與 SLA 門檻(超過即為卡關)';
