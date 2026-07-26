-- =====================================================================
-- 餐廳端對訂單/出貨的 RLS,以及「status 只能經事件流變更」的 DB 層強制
--
-- 原本 supplier_orders / supplier_shipments 只有 admin 與 supplier 的 policy,
-- 餐廳讀不到自己的訂單(頁面全部顯示 0)。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 餐廳讀寫自己的訂單
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "restaurant_read_own_orders" ON public.supplier_orders;
CREATE POLICY "restaurant_read_own_orders" ON public.supplier_orders
  FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT public.current_restaurant_ids()));

-- 建立採購需求(只能建自己店的、且必須從 draft 或 submitted 起算)
DROP POLICY IF EXISTS "restaurant_create_own_orders" ON public.supplier_orders;
CREATE POLICY "restaurant_create_own_orders" ON public.supplier_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IN (SELECT public.current_restaurant_ids())
    AND status IN ('draft','submitted')
  );

-- 更新自己店的訂單(簽核、金額、備註)。status 由下方 trigger 保護,改不動。
DROP POLICY IF EXISTS "restaurant_update_own_orders" ON public.supplier_orders;
CREATE POLICY "restaurant_update_own_orders" ON public.supplier_orders
  FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT public.current_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT public.current_restaurant_ids()));

-- ---------------------------------------------------------------------
-- 2. 餐廳讀自己訂單的出貨紀錄 + 只能寫收貨欄位
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "restaurant_read_own_shipments" ON public.supplier_shipments;
CREATE POLICY "restaurant_read_own_shipments" ON public.supplier_shipments
  FOR SELECT TO authenticated
  USING (order_id IN (
    SELECT id FROM public.supplier_orders
     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
  ));

DROP POLICY IF EXISTS "restaurant_confirm_receipt" ON public.supplier_shipments;
CREATE POLICY "restaurant_confirm_receipt" ON public.supplier_shipments
  FOR UPDATE TO authenticated
  USING (order_id IN (
    SELECT id FROM public.supplier_orders
     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
  ))
  WITH CHECK (order_id IN (
    SELECT id FROM public.supplier_orders
     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
  ));

-- 出貨紀錄不存在時,餐廳確認收貨要能補建一筆
DROP POLICY IF EXISTS "restaurant_insert_shipment_on_receipt" ON public.supplier_shipments;
CREATE POLICY "restaurant_insert_shipment_on_receipt" ON public.supplier_shipments
  FOR INSERT TO authenticated
  WITH CHECK (order_id IN (
    SELECT id FROM public.supplier_orders
     WHERE restaurant_id IN (SELECT public.current_restaurant_ids())
  ));

-- ---------------------------------------------------------------------
-- 3. status 只能經 order_events 變更(DB 層強制)
--
--    這條規則是 GMV 可信度的技術保證:任何人(含 admin 前端、供應商前端)
--    都不能直接 UPDATE supplier_orders.status 繞過履歷。
--    唯一合法路徑 = INSERT order_events → apply_order_event() trigger。
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- 交易內旗標:告訴 guard trigger「這次 status 變更來自事件流」
  PERFORM set_config('ifm.status_via_event', '1', true);

  UPDATE public.supplier_orders
     SET status = NEW.to_status,
         current_stage_since = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.order_id;

  PERFORM set_config('ifm.status_via_event', '', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('ifm.status_via_event', true), '') <> '1' THEN
    RAISE EXCEPTION
      '訂單狀態只能透過 order_events 變更(請呼叫 recordOrderEvent),不可直接 UPDATE status'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_status ON public.supplier_orders;
CREATE TRIGGER trg_guard_order_status
BEFORE UPDATE OF status ON public.supplier_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_status();

-- ---------------------------------------------------------------------
-- 4. 既有訂單補上事件流的起始紀錄
--    (2026-07-26 之前的訂單沒有 order_events,履歷頁會是空的)
-- ---------------------------------------------------------------------
INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, note, created_at)
SELECT o.id, NULL, o.status, 'system', 'system',
       '事件流上線前的既有訂單,狀態由歷史資料回填', o.created_at
FROM public.supplier_orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_events e WHERE e.order_id = o.id);
