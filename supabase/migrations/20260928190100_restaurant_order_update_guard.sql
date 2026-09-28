-- =====================================================================
-- 簽核補強:採購員不能用「改訂單內容」繞過老闆/店長簽核(接續 20260928190000)
--
-- 審查發現的繞過(20260928190000 只管事件,沒管 UPDATE):
--   1. 跨店搬單:restaurant_update_own_orders 允許成員把 restaurant_id 改成自己所屬的任何一家店。
--      同時是 A 店採購員、B 店老闆的人(先自助開一家 B 店、再接受 A 店的邀請就做得到),
--      可以在 B 店直接建 submitted 的單再改成 A 店,或把 A 店的草稿搬去 B 店送出再搬回來 ——
--      A 店多出一張沒經過 A 店老闆/店長簽核的送出單。
--   2. 核准後改內容:老闆核准後,採購員還能改品項、金額、供應商;也能在草稿上自己填 approved_by。
--
-- 做法(一樣不加任何鎖,只做唯讀查詢):
--   A. supplier_orders 加一支 BEFORE UPDATE trigger(guard_order_update):
--      - 狀態同步(apply_order_event 設的交易內旗標 ifm.status_via_event)、平台管理員、系統身分:放行
--      - 其他任何人都不能改 restaurant_id(不能把訂單搬到別家店)
--      - 該店已接受、啟用中的老闆/店長:放行
--      - 其他人(採購員):只能改還是 draft 的單,而且不能動 approved_by / approved_at
--   B. guard_order_submission(20260928190000)補三點,判斷規則不變:
--      - 系統身分改成白名單:沒有登入者,且 JWT role 是 service_role 或根本沒有 JWT
--        (原本是「不是 anon 就算」,帶 authenticated 卻沒有 sub 的 JWT 會被當成系統)
--      - SET row_security = off:萬一函式擁有者被換成受 RLS 限制的角色,查詢會報錯而不是查不到就放行
--      - 對「已取消的單」做其他動作時,改回「這張訂單已經取消」的訊息(原本一律說要簽核,會誤導)
--
-- 既有流程:老闆/店長核准(寫 approved_by/approved_at)、所有狀態同步、管理員與系統的更新都不受影響;
--   前端沒有任何採購員更新訂單的畫面(只有老闆/店長的核准會 UPDATE supplier_orders)。
--   restaurants / restaurant_branches 被刪時,外鍵把 restaurant_id / branch_id 設成 NULL 也算一次 UPDATE:
--   刪餐廳只有管理員/系統做得到(放行);前端沒有刪分店的功能,老闆/店長直接打 API 刪也放行,
--   只有採購員刪「被已送出的單用到的分店」會被擋。
--
-- 死鎖:兩支 trigger 都只做唯讀查詢(restaurant_role 查 restaurant_accounts;guard_order_submission
--   以主鍵查一列 supplier_orders),不取任何列鎖,既有的鎖與順序不變。
--   套用時的 DDL 鎖(CREATE TRIGGER 在 supplier_orders 上)用 lock_timeout 限制等待,拿不到就整批失敗重來。
--
-- 還原:supabase/rollbacks/20260928190100_restaurant_order_update_guard.down.sql
--       (要連 190000 一起退:先跑 190100.down,再跑 190000.down)
-- 測試:supabase/tests/database/restaurant_draft_approval.test.sql
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- A. 訂單內容的更新
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  -- 事件流同步狀態(apply_order_event):只改 status / current_stage_since / updated_at
  IF COALESCE(current_setting('ifm.status_via_event', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  -- 平台管理員;系統身分(沒有登入者,且 JWT role 是 service_role 或沒有 JWT)
  IF public.is_admin()
     OR (auth.uid() IS NULL AND COALESCE(auth.role(), 'service_role') = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- 不能把訂單搬到別家店(簽核權是看訂單屬於哪家店)
  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION '訂單不能改到別家餐廳'
      USING ERRCODE = '42501',
            HINT = 'order_restaurant_immutable';
  END IF;

  -- 這家店已接受、啟用中的老闆或店長
  IF public.restaurant_role(OLD.restaurant_id) IN ('owner', 'manager') THEN
    RETURN NEW;
  END IF;

  -- 其他人(採購員):只能改還沒送出的草稿,而且簽核欄位只能由老闆/店長填
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '採購單送出後只有老闆或店長可以修改'
      USING ERRCODE = '42501',
            HINT = 'needs_owner_or_manager_approval';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION '簽核欄位只能由老闆或店長填寫'
      USING ERRCODE = '42501',
            HINT = 'needs_owner_or_manager_approval';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_order_update() FROM anon;
REVOKE ALL ON FUNCTION public.guard_order_update() FROM authenticated;

COMMENT ON FUNCTION public.guard_order_update() IS
  '訂單不能換店;採購員只能改草稿且不能填簽核欄位。狀態同步、管理員、系統、該店老闆/店長放行。';

DROP TRIGGER IF EXISTS trg_guard_order_update ON public.supplier_orders;
CREATE TRIGGER trg_guard_order_update
BEFORE UPDATE ON public.supplier_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();

-- ---------------------------------------------------------------------
-- B. 送出類事件的守門(規則同 20260928190000,只改上面說的三點)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_status        text;
  v_restaurant_id uuid;
BEGIN
  -- 唯讀,不加鎖
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

  -- 平台管理員;系統身分(沒有登入者,且 JWT role 是 service_role 或沒有 JWT)
  IF public.is_admin()
     OR (auth.uid() IS NULL AND COALESCE(auth.role(), 'service_role') = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- 這家店已接受、啟用中的老闆或店長
  IF public.restaurant_role(v_restaurant_id) IN ('owner', 'manager') THEN
    RETURN NEW;
  END IF;

  -- 對已取消的單做送出以外的動作(多半是停在舊畫面):說清楚是單已取消
  IF v_status = 'cancelled' AND NEW.to_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION '這張訂單已經取消,不能再進行其他動作(請重新整理頁面)'
      USING ERRCODE = '42501',
            HINT = 'order_cancelled';
  END IF;

  RAISE EXCEPTION '採購單要由這家餐廳的老闆或店長簽核後才能送出'
    USING ERRCODE = '42501',
          HINT = 'needs_owner_or_manager_approval';
END;
$$;

NOTIFY pgrst, 'reload schema';
