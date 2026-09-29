-- =====================================================================
-- Rollback:20260929110000_order_cancel_requote_rules.sql
--
-- 把轉移表、guard_order_transition、apply_order_event_details、guard_order_update、notify_order_event
-- 還原成套用前的正式庫原文(20260929100000 / 100100 / 100200 與 20260728100000 的版本),再刪掉 ledger。
-- 不動任何資料列:已經取消、退回重新報價、清空金額的單都維持原狀。
-- ⚠️ 還原後管理員又不能取消進行中的單、餐廳不能退回重新報價(前端按鈕會被資料庫擋下),報價後又能改品項。
--    要完整退版,前端請一起退回 20260929110000 之前的版本;notify v9 對舊的 trigger 內容相容,不用退。
-- 還原順序:20260929110200.down → 20260929110100.down → 這支。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- 順序反了:20260929110100 的逾時排程依賴這裡的 system confirmed→expired,110200 的收貨/爭議 RPC 依賴這裡的規則
DO $$
BEGIN
  IF to_regprocedure('public.expire_stuck_orders()') IS NOT NULL
     OR to_regprocedure('public.restaurant_receive_order(uuid,text,boolean,text,text,jsonb,integer)') IS NOT NULL THEN
    RAISE EXCEPTION '請先跑 20260929110200、20260929110100 的 .down.sql,再跑這支';
  END IF;
END;
$$;

-- 以下五支函式是 20260929110000 套用前正式庫的原文(pg_get_functiondef)
CREATE OR REPLACE FUNCTION public.order_transition_rules()
 RETURNS TABLE(actor text, from_status text, to_status text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT t.actor, t.from_status, t.to_status FROM (VALUES
    -- @transitions-begin
    -- 餐廳老闆
    ('owner', 'draft', 'submitted'),
    ('owner', 'draft', 'cancelled'),
    ('owner', 'quoted', 'confirmed'),
    ('owner', 'quoted', 'cancelled'),
    ('owner', 'delivered', 'received'),
    ('owner', 'delivered', 'discrepancy'),
    ('owner', 'received', 'reviewed'),
    ('owner', 'discrepancy', 'disputed'),
    -- 餐廳店長(同老闆)
    ('manager', 'draft', 'submitted'),
    ('manager', 'draft', 'cancelled'),
    ('manager', 'quoted', 'confirmed'),
    ('manager', 'quoted', 'cancelled'),
    ('manager', 'delivered', 'received'),
    ('manager', 'delivered', 'discrepancy'),
    ('manager', 'received', 'reviewed'),
    ('manager', 'discrepancy', 'disputed'),
    -- 餐廳採購員:不能送出(要老闆/店長簽核),其餘同老闆
    ('purchaser', 'draft', 'cancelled'),
    ('purchaser', 'quoted', 'confirmed'),
    ('purchaser', 'quoted', 'cancelled'),
    ('purchaser', 'delivered', 'received'),
    ('purchaser', 'delivered', 'discrepancy'),
    ('purchaser', 'received', 'reviewed'),
    ('purchaser', 'discrepancy', 'disputed'),
    -- 這張單的供應商:最多推到 delivered(received 只有餐廳能觸發 —— GMV 可信度的來源)
    ('supplier', 'dispatched', 'accepted'),
    ('supplier', 'dispatched', 'rejected'),
    ('supplier', 'sent', 'accepted'),
    ('supplier', 'sent', 'rejected'),
    ('supplier', 'accepted', 'quoted'),
    ('supplier', 'confirmed', 'shipped'),
    ('supplier', 'shipped', 'in_transit'),
    ('supplier', 'shipped', 'delivered'),
    ('supplier', 'in_transit', 'delivered'),
    -- 平台管理員:派單、取消、仲裁、結案
    ('admin', 'submitted', 'dispatched'),
    ('admin', 'submitted', 'cancelled'),
    ('admin', 'pending', 'dispatched'),
    ('admin', 'pending', 'cancelled'),
    ('admin', 'draft', 'dispatched'),
    ('admin', 'draft', 'cancelled'),
    ('admin', 'rejected', 'dispatched'),
    ('admin', 'rejected', 'cancelled'),
    ('admin', 'expired', 'dispatched'),
    ('admin', 'expired', 'cancelled'),
    ('admin', 'discrepancy', 'disputed'),
    ('admin', 'discrepancy', 'received'),
    ('admin', 'discrepancy', 'closed'),
    ('admin', 'disputed', 'closed'),
    ('admin', 'disputed', 'received'),
    ('admin', 'reviewed', 'closed'),
    ('admin', 'received', 'closed'),
    -- 系統(service_role、資料庫直連、排程):上面所有轉移的聯集 + 等待中的單逾時
    ('system', 'draft', 'submitted'),
    ('system', 'draft', 'cancelled'),
    ('system', 'draft', 'dispatched'),
    ('system', 'submitted', 'dispatched'),
    ('system', 'submitted', 'cancelled'),
    ('system', 'pending', 'dispatched'),
    ('system', 'pending', 'cancelled'),
    ('system', 'dispatched', 'accepted'),
    ('system', 'dispatched', 'rejected'),
    ('system', 'dispatched', 'expired'),
    ('system', 'sent', 'accepted'),
    ('system', 'sent', 'rejected'),
    ('system', 'sent', 'expired'),
    ('system', 'accepted', 'quoted'),
    ('system', 'accepted', 'expired'),
    ('system', 'quoted', 'confirmed'),
    ('system', 'quoted', 'cancelled'),
    ('system', 'quoted', 'expired'),
    ('system', 'confirmed', 'shipped'),
    ('system', 'shipped', 'in_transit'),
    ('system', 'shipped', 'delivered'),
    ('system', 'in_transit', 'delivered'),
    ('system', 'delivered', 'received'),
    ('system', 'delivered', 'discrepancy'),
    ('system', 'received', 'reviewed'),
    ('system', 'received', 'closed'),
    ('system', 'reviewed', 'closed'),
    ('system', 'discrepancy', 'disputed'),
    ('system', 'discrepancy', 'received'),
    ('system', 'discrepancy', 'closed'),
    ('system', 'disputed', 'closed'),
    ('system', 'disputed', 'received'),
    ('system', 'rejected', 'dispatched'),
    ('system', 'rejected', 'cancelled'),
    ('system', 'expired', 'dispatched'),
    ('system', 'expired', 'cancelled')
    -- @transitions-end
  ) AS t(actor, from_status, to_status)
$function$;
COMMENT ON FUNCTION public.order_transition_rules() IS '訂單狀態轉移表(身分, 從, 到)。身分:owner/manager/purchaser/supplier/admin/system。與 src/lib/orders.ts TRANSITIONS 對齊。';

CREATE OR REPLACE FUNCTION public.guard_order_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
DECLARE
  v_status        text;
  v_restaurant    uuid;
  v_supplier      uuid;
  v_uid           uuid := auth.uid();
  v_is_system     boolean;
  v_actor         text;
  v_actor_label   text;
  v_target        uuid;
  v_amount        numeric;
  v_lock_supplier uuid;
BEGIN
  -- 會用到 suppliers 外鍵的轉移(派單寫 supplier_id、出貨新增 supplier_shipments):先鎖供應商、再鎖訂單,
  -- 跟「刪供應商 → ON DELETE SET NULL 改訂單」同一個順序,兩邊不會互等
  IF NEW.to_status = 'dispatched' AND NULLIF(NEW.payload->>'supplier_id', '') IS NOT NULL THEN
    BEGIN
      v_lock_supplier := (NEW.payload->>'supplier_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_lock_supplier := NULL;  -- 格式錯誤:下面會回「找不到要派單的供應商」
    END;
  ELSIF NEW.to_status = 'shipped' THEN
    SELECT o.supplier_id INTO v_lock_supplier FROM public.supplier_orders o WHERE o.id = NEW.order_id;
  END IF;
  IF v_lock_supplier IS NOT NULL THEN
    PERFORM 1 FROM public.suppliers s WHERE s.id = v_lock_supplier FOR KEY SHARE;
  END IF;

  -- 鎖住訂單這一列(apply_order_event 稍後的 UPDATE 本來就要拿同一種鎖),同一張單的並發事件在這裡排隊
  SELECT o.status, o.restaurant_id, o.supplier_id
    INTO v_status, v_restaurant, v_supplier
    FROM public.supplier_orders o
   WHERE o.id = NEW.order_id
     FOR NO KEY UPDATE;

  -- 訂單不存在:交給外鍵去報錯
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_is_system := v_uid IS NULL AND COALESCE(auth.role(), 'service_role') = 'service_role';

  -- 執行者由伺服器決定,前端送來的 actor_id 不採信;事件時間也一樣(系統身分可以補登歷史時間)
  NEW.actor_id := v_uid;
  IF NOT v_is_system THEN
    NEW.created_at := now();
  END IF;

  -- 身分必須名副其實
  IF NEW.actor_role = 'system' THEN
    IF NOT v_is_system THEN
      RAISE EXCEPTION '只有系統排程可以用「系統」身分寫訂單事件'
        USING ERRCODE = '42501', HINT = 'actor_role_mismatch';
    END IF;
    v_actor := 'system';
  ELSIF NEW.actor_role = 'admin' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION '只有平台管理員可以用「管理員」身分操作訂單'
        USING ERRCODE = '42501', HINT = 'actor_role_mismatch';
    END IF;
    v_actor := 'admin';
  ELSIF NEW.actor_role = 'restaurant' THEN
    v_actor := CASE WHEN v_uid IS NULL THEN NULL ELSE public.restaurant_role(v_restaurant) END;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION '你不是這家餐廳的成員(或邀請還沒接受),不能操作這張訂單'
        USING ERRCODE = '42501', HINT = 'actor_role_mismatch';
    END IF;
  ELSIF NEW.actor_role = 'supplier' THEN
    IF v_uid IS NULL OR v_supplier IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.supplier_accounts a
          WHERE a.user_id = v_uid AND a.is_active AND a.supplier_id = v_supplier) THEN
      RAISE EXCEPTION '這張訂單不是派給你的供應商,不能操作'
        USING ERRCODE = '42501', HINT = 'actor_role_mismatch';
    END IF;
    v_actor := 'supplier';
  ELSE
    -- actor_role 的 CHECK 會擋,這裡只是保險
    RAISE EXCEPTION '不認得的身分:%', NEW.actor_role USING ERRCODE = '42501', HINT = 'actor_role_mismatch';
  END IF;

  -- 履歷上顯示的「誰」與「從哪個介面」也由伺服器決定(系統身分照填,給排程/串接標示來源)
  IF NOT v_is_system THEN
    NEW.actor_label := NULLIF(auth.jwt()->>'email', '');
    NEW.source := CASE v_actor
      WHEN 'supplier' THEN 'supplier_portal'
      WHEN 'admin' THEN 'admin_portal'
      ELSE 'restaurant_portal' END;
  END IF;

  -- 畫面過期:前端以為的狀態跟資料庫不一樣
  IF NEW.from_status IS NOT NULL AND NEW.from_status IS DISTINCT FROM v_status THEN
    RAISE EXCEPTION '這張訂單的狀態已經變成「%」,畫面上的資料過期了,請重新整理後再操作',
        public.order_status_label(v_status)
      USING ERRCODE = 'P0001', HINT = 'stale_order_status';
  END IF;
  NEW.from_status := v_status;

  IF NOT EXISTS (
       SELECT 1 FROM public.order_transition_rules() r
        WHERE r.actor = v_actor AND r.from_status = v_status AND r.to_status = NEW.to_status) THEN
    v_actor_label := CASE v_actor
      WHEN 'owner' THEN '餐廳老闆' WHEN 'manager' THEN '餐廳店長' WHEN 'purchaser' THEN '餐廳採購員'
      WHEN 'supplier' THEN '供應商' WHEN 'admin' THEN '平台管理員' ELSE '系統' END;
    RAISE EXCEPTION '%不能把訂單從「%」改成「%」',
        v_actor_label, public.order_status_label(v_status), public.order_status_label(NEW.to_status)
      USING ERRCODE = '42501', HINT = 'transition_not_allowed';
  END IF;

  -- 出貨:先鎖的是訂單「當時」的供應商;鎖完訂單發現已經換了(管理員剛改過),當成畫面過期
  IF NEW.to_status = 'shipped' AND v_supplier IS DISTINCT FROM v_lock_supplier THEN
    RAISE EXCEPTION '這張訂單的供應商剛剛變更,畫面上的資料過期了,請重新整理後再操作'
      USING ERRCODE = 'P0001', HINT = 'stale_order_status';
  END IF;

  -- 派單:指定的供應商必須存在(是否啟用由派單畫面篩選)
  IF NEW.to_status = 'dispatched' AND NEW.payload ? 'supplier_id' THEN
    BEGIN
      v_target := (NEW.payload->>'supplier_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_target := NULL;
    END;
    IF v_target IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = v_target) THEN
      RAISE EXCEPTION '找不到要派單的供應商' USING ERRCODE = '22023', HINT = 'invalid_supplier';
    END IF;
  END IF;

  -- 報價:一定要有大於 0 的金額;統一存成 payload.total_amount(20260929100100 會同步到訂單)
  IF NEW.to_status = 'quoted' THEN
    BEGIN
      v_amount := COALESCE(NEW.payload->>'total_amount', NEW.payload->>'amount')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_amount := NULL;
    END;
    IF v_amount IS NULL OR NOT (v_amount > 0 AND v_amount <= 99999999) THEN
      RAISE EXCEPTION '報價金額要是大於 0 的數字' USING ERRCODE = '22023', HINT = 'invalid_quote_amount';
    END IF;
    NEW.payload := NEW.payload || jsonb_build_object('total_amount', round(v_amount, 2));

    IF NULLIF(NEW.payload->>'valid_until', '') IS NOT NULL THEN
      BEGIN
        PERFORM (NEW.payload->>'valid_until')::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '報價有效日期格式不對(要是 YYYY-MM-DD)'
          USING ERRCODE = '22023', HINT = 'invalid_valid_until';
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.guard_order_transition() IS '訂單事件寫入前:派單/出貨先鎖供應商再鎖訂單、actor_id=auth.uid()、非系統的 actor_label/source 由伺服器決定、身分名副其實、from_status=目前狀態、(身分,從,到) 在 order_transition_rules()、派單/報價內容檢查。';

CREATE OR REPLACE FUNCTION public.apply_order_event_details()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
DECLARE
  v_supplier uuid;
  v_amount   numeric;
BEGIN
  IF NEW.to_status = 'dispatched' AND NULLIF(NEW.payload->>'supplier_id', '') IS NOT NULL THEN
    PERFORM set_config('ifm.status_via_event', '1', true);
    UPDATE public.supplier_orders
       SET supplier_id = (NEW.payload->>'supplier_id')::uuid,
           updated_at  = now()
     WHERE id = NEW.order_id
       AND supplier_id IS DISTINCT FROM (NEW.payload->>'supplier_id')::uuid;
    PERFORM set_config('ifm.status_via_event', '', true);

  ELSIF NEW.to_status = 'quoted' THEN
    -- 20260929100000 已經把金額驗證過、統一成 total_amount;這裡再防一次舊寫法
    v_amount := COALESCE(NEW.payload->>'total_amount', NEW.payload->>'amount')::numeric;
    PERFORM set_config('ifm.status_via_event', '1', true);
    UPDATE public.supplier_orders
       SET total_amount = v_amount,
           updated_at   = now()
     WHERE id = NEW.order_id
    RETURNING supplier_id INTO v_supplier;
    PERFORM set_config('ifm.status_via_event', '', true);

    INSERT INTO public.order_quotes (order_id, supplier_id, total_amount, note, valid_until, status)
    VALUES (NEW.order_id, v_supplier, v_amount, NEW.note,
            NULLIF(NEW.payload->>'valid_until', '')::date, 'quoted');

  ELSIF NEW.to_status = 'shipped' THEN
    INSERT INTO public.supplier_shipments (order_id, supplier_id, shipped_at, tracking_info, notes, confirmed_by)
    SELECT o.id,
           o.supplier_id,
           NEW.created_at,
           CASE WHEN jsonb_typeof(NEW.payload->'tracking') = 'object' THEN NEW.payload->'tracking' ELSE '{}'::jsonb END,
           NEW.note,
           NEW.actor_id
      FROM public.supplier_orders o
     WHERE o.id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.apply_order_event_details() IS '事件寫入後:派單寫 supplier_id、報價寫 total_amount + order_quotes、出貨新增 supplier_shipments(同一個交易)。';

CREATE OR REPLACE FUNCTION public.guard_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
BEGIN
  -- 事件流同步(apply_order_event 的狀態、apply_order_event_details 的供應商與金額)
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
    -- 供應商只能由平台派單指定;金額送出後只能由供應商報價決定(兩者都經由事件寫)
    IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
      RAISE EXCEPTION '訂單的供應商只能由平台派單指定,不能直接修改'
        USING ERRCODE = '42501',
              HINT = 'order_supplier_via_dispatch';
    END IF;
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount AND OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION '訂單金額由供應商報價決定,送出後不能直接修改'
        USING ERRCODE = '42501',
              HINT = 'order_amount_via_quote';
    END IF;
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
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    RAISE EXCEPTION '訂單的供應商只能由平台派單指定,不能直接修改'
      USING ERRCODE = '42501',
            HINT = 'order_supplier_via_dispatch';
  END IF;

  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.guard_order_update() IS '訂單不能換店、不能直接改供應商、送出後不能直接改金額;採購員只能改草稿且不能填簽核欄位。事件同步、管理員、系統放行。';

CREATE OR REPLACE FUNCTION public.notify_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'notify_function_url';
  SELECT value INTO v_key FROM public.app_config WHERE key = 'notify_service_key';

  -- 沒設定就安靜跳過 —— 不要因為通知沒接好就讓下單失敗
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- pg_net 不管 WITH SCHEMA 寫什麼,函式一律建在 net schema
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'order_id',  NEW.order_id,
                 'to_status', NEW.to_status
               ),
    timeout_milliseconds := 8000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- 通知出任何問題都不能影響訂單流程
  RAISE WARNING 'notify_order_event failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.notify_order_event() IS '訂單事件 → notify Edge Function。非同步、失敗不影響交易。設定放在 app_config。';

REVOKE ALL ON FUNCTION public.order_transition_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_order_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_order_event_details() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC, anon, authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929110000';

NOTIFY pgrst, 'reload schema';
