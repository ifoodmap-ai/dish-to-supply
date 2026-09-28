-- =====================================================================
-- 採購員建的採購單,一定要經過這家店的老闆或店長簽核才能送出
-- (業主 2026-09-28 拍板,後台精簡方案 QUESTIONS Q8-A)
--
-- 發現的問題:
--   「智慧採購」頁只讓老闆/店長送出草稿,但「訂單與收貨」頁的「送出訂單」沒有角色檢查,
--   資料庫也不擋 —— order_events 的 INSERT policy 只檢查「訂單是不是你這家店的」,
--   所以採購員自己寫一筆 draft→submitted 事件就繞過簽核了。
--   supplier_orders 的 INSERT policy 也允許直接建一張 status='submitted' 的單(連事件都不必寫)。
--
-- 做法(最小改動:不動狀態機、不改 apply_order_event、不加任何鎖):
--   1. order_events 加一支 BEFORE INSERT trigger。「送出類」事件的寫入者必須是
--      這家店已接受、啟用中的老闆或店長(public.restaurant_role),或平台管理員、系統。
--      「送出類」=
--        a. 目標狀態是 submitted(不論從哪個狀態來 —— 含「先取消再復活」cancelled→submitted)
--        b. 把 draft / cancelled 的單推到 draft、cancelled 以外的狀態
--           (擋「跳關」:例如 draft→dispatched;事件的 from_status 是前端填的,不可信,
--            一律以 supplier_orders 目前的 status 為準)
--   2. supplier_orders 的 INSERT policy:直接建 submitted 的單同樣只限老闆/店長;
--      其他人只能建 draft(前端本來就一律先建 draft 再寫事件)。
--
-- 不受影響的既有流程:
--   - 老闆/店長:送出、核准、退回草稿,以及所有後續動作
--   - 採購員:建草稿、取消草稿、確認報價、收貨、回報異常、評價、申請爭議(都不是送出類)
--   - 供應商:接單/拒單/報價/出貨/送達(目標都不是 submitted,也不是從 draft/cancelled 出發)
--   - 平台管理員(is_admin)與系統(沒有登入者的 service_role、資料庫直連、排程):完全不檢查
--
-- 死鎖:trigger 只做唯讀查詢(supplier_orders 以主鍵查一列、restaurant_role 查
--   restaurant_accounts),不取任何列鎖;事件寫入原本的鎖(外鍵檢查的 KEY SHARE、
--   apply_order_event 的 NO KEY UPDATE)與順序完全不變,不會多出新的等待或循環。
--
-- 還原:supabase/rollbacks/20260928190000_restaurant_draft_approval.down.sql
-- 測試:supabase/tests/database/restaurant_draft_approval.test.sql(pgTAP,包在 BEGIN … ROLLBACK)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.guard_order_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status        text;
  v_restaurant_id uuid;
BEGIN
  -- 唯讀,不加鎖(見檔頭「死鎖」)
  SELECT o.status, o.restaurant_id
    INTO v_status, v_restaurant_id
    FROM public.supplier_orders o
   WHERE o.id = NEW.order_id;

  -- 訂單不存在:交給外鍵去報錯
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- 不是送出類事件就放行
  IF NEW.to_status IS DISTINCT FROM 'submitted'
     AND NOT (v_status IN ('draft', 'cancelled') AND NEW.to_status NOT IN ('draft', 'cancelled')) THEN
    RETURN NEW;
  END IF;

  -- 平台管理員;系統身分(沒有登入者:service_role、資料庫直連、排程 —— anon 不算)
  IF public.is_admin()
     OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon') THEN
    RETURN NEW;
  END IF;

  -- 這家店已接受、啟用中的老闆或店長
  IF public.restaurant_role(v_restaurant_id) IN ('owner', 'manager') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '採購單要由這家餐廳的老闆或店長簽核後才能送出'
    USING ERRCODE = '42501',
          HINT = 'needs_owner_or_manager_approval';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_order_submission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_order_submission() FROM anon;
REVOKE ALL ON FUNCTION public.guard_order_submission() FROM authenticated;

COMMENT ON FUNCTION public.guard_order_submission() IS
  '送出類訂單事件(→submitted,或把 draft/cancelled 推往其他狀態)只限該店老闆/店長、平台管理員或系統。';

DROP TRIGGER IF EXISTS trg_guard_order_submission ON public.order_events;
CREATE TRIGGER trg_guard_order_submission
BEFORE INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.guard_order_submission();

-- 直接建單:只有老闆/店長可以跳過草稿直接建 submitted
DROP POLICY IF EXISTS "restaurant_create_own_orders" ON public.supplier_orders;
CREATE POLICY "restaurant_create_own_orders" ON public.supplier_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IN (SELECT public.current_restaurant_ids())
    AND (
      status = 'draft'
      OR (status = 'submitted' AND public.restaurant_role(restaurant_id) IN ('owner', 'manager'))
    )
  );

NOTIFY pgrst, 'reload schema';
