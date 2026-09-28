-- =====================================================================
-- Rollback:20260928190100_restaurant_order_update_guard.sql
--
-- 拿掉 supplier_orders 的 trg_guard_order_update(訂單不能換店、採購員只能改草稿),
-- 並把 guard_order_submission 還原成 20260928190000 的版本(下面整段照抄 190000),再刪掉 ledger。
-- ⚠️ 還原後又回到:成員可以把訂單的 restaurant_id 改成自己所屬的別家店、採購員可以改已送出的單的內容。
-- 要連 190000 一起退:先跑這支,再跑 20260928190000_restaurant_draft_approval.down.sql。
-- 不動任何資料列。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS trg_guard_order_update ON public.supplier_orders;
DROP FUNCTION IF EXISTS public.guard_order_update();

-- 20260928190000 的原版(系統身分用排除法、沒有 row_security、訊息只有一種)
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

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928190100';

NOTIFY pgrst, 'reload schema';
