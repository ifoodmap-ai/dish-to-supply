-- =====================================================================
-- Rollback:20260929100200_order_integrity_hardening.sql
--
-- 把四件事還原成套用前的樣子,再刪掉 ledger;不動任何資料列:
--   A. guard_order_update → 20260928190100 的版本(老闆/店長又可以直接改 supplier_id / total_amount)
--   B. restaurant_create_own_orders → 20260928190000 的版本(建單可以帶 supplier_id)
--   C. 重建 supplier_insert_shipments(正式庫原本的定義,repo 裡沒有對應 migration);
--      報價的 supplier policy 改回 FOR ALL 的 "supplier manage own quotes"(20260727044345 的定義)
--   D. guard_order_transition → 20260929100000 的版本(不先鎖供應商、actor_label/source 回到前端填)
-- ⚠️ 還原後就回到審查發現的那幾個缺口(見 migration 檔頭);前端不用跟著退版。
-- 還原順序:先跑這支,再跑 20260929100100、20260929100000 的 .down.sql。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- A. 20260928190100 的 guard_order_update(原文照抄)
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

COMMENT ON FUNCTION public.guard_order_update() IS
  '訂單不能換店;採購員只能改草稿且不能填簽核欄位。狀態同步、管理員、系統、該店老闆/店長放行。';

-- B. 20260928190000 的 restaurant_create_own_orders
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

-- C. 出貨與報價的 supplier policy(正式庫 2026-09-29 套用前的 pg_policies 原樣)
DROP POLICY IF EXISTS "supplier_insert_shipments" ON public.supplier_shipments;
CREATE POLICY "supplier_insert_shipments" ON public.supplier_shipments
  FOR INSERT TO authenticated
  WITH CHECK (supplier_id IN (
    SELECT supplier_accounts.supplier_id FROM public.supplier_accounts
     WHERE supplier_accounts.user_id = auth.uid() AND supplier_accounts.is_active = true
  ));

DROP POLICY IF EXISTS "supplier insert own quotes" ON public.order_quotes;
DROP POLICY IF EXISTS "supplier manage own quotes" ON public.order_quotes;
CREATE POLICY "supplier manage own quotes" ON public.order_quotes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
      FROM public.supplier_accounts sa
      JOIN public.supplier_orders o
        ON o.id = order_quotes.order_id AND o.supplier_id = order_quotes.supplier_id
     WHERE sa.user_id = (SELECT auth.uid()) AND sa.is_active AND sa.supplier_id = order_quotes.supplier_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1
      FROM public.supplier_accounts sa
      JOIN public.supplier_orders o
        ON o.id = order_quotes.order_id AND o.supplier_id = order_quotes.supplier_id
     WHERE sa.user_id = (SELECT auth.uid()) AND sa.is_active AND sa.supplier_id = order_quotes.supplier_id
  ));

-- D. 20260929100000 的 guard_order_transition(原文照抄)
CREATE OR REPLACE FUNCTION public.guard_order_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_status      text;
  v_restaurant  uuid;
  v_supplier    uuid;
  v_uid         uuid := auth.uid();
  v_is_system   boolean;
  v_actor       text;
  v_actor_label text;
  v_target      uuid;
  v_amount      numeric;
BEGIN
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
$$;

COMMENT ON FUNCTION public.guard_order_transition() IS
  '訂單事件寫入前:鎖訂單列、actor_id=auth.uid()、身分名副其實、from_status=目前狀態、(身分,從,到) 在 order_transition_rules()、派單/報價內容檢查。';

REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_order_transition() FROM PUBLIC, anon, authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929100200';

NOTIFY pgrst, 'reload schema';
