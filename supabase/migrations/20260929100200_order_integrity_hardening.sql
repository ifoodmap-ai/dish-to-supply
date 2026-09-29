-- =====================================================================
-- 訂單資料的完整性補強(接續 20260929100000 / 100100;2026-09-29 程式審查的發現)
--
-- 發現的問題:
--   1. 老闆/店長在任何狀態都能直接 UPDATE supplier_orders.supplier_id 與 total_amount(guard_order_update 對他們整個放行)。
--      現在派單(supplier_id)與報價(total_amount)都是事件的結果、供應商能不能操作也看 supplier_id ——
--      結果可以不留任何事件就把單改派給別家、把報價 3200 改成 1 再確認、把已收貨的單改金額(GMV 事後被改寫)。
--      餐廳直接 INSERT 時也能自己帶 supplier_id(沒經過派單,那家供應商就先看得到這張單)。
--   2. 出貨與報價紀錄可以不經事件直接寫:供應商的 supplier_insert_shipments 只檢查 supplier_id 是自己的,
--      不檢查 order_id(可以替別家的單新增出貨紀錄,餐廳收貨時會被連到);報價的 policy 是 FOR ALL
--      (trigger 寫下的報價紀錄可以被供應商事後改金額、刪掉)。
--   3. 鎖的順序:出貨時先鎖訂單(guard_order_transition)、之後新增 supplier_shipments 的外鍵檢查才對 suppliers 拿 KEY SHARE;
--      刪供應商則是先鎖 suppliers、再由 ON DELETE SET NULL 去改訂單 —— 兩邊順序相反,同時發生會死鎖。
--      派單寫 supplier_id 的外鍵檢查也是同一個問題。
--   4. actor_label(顯示「誰」)與 source(顯示「從哪個介面」)仍是前端填什麼存什麼,不可改寫的履歷裡可以留下假名字與假來源。
--
-- 做法:
--   A. guard_order_update:任何非管理員/非系統的人都不能改 supplier_id(只能由派單事件寫);
--      送出後不能改 total_amount(只能由報價事件寫)。其他規則與 20260928190100 相同(錯誤訊息不變)。
--   B. restaurant_create_own_orders:餐廳建單不能帶 supplier_id。
--   C. 拿掉 supplier_insert_shipments(出貨紀錄改由 20260929100100 的 trigger 寫);
--      報價的 supplier policy 從 FOR ALL 改成只能 INSERT(讀取另有 transaction parties read order_quotes)。
--   D. guard_order_transition:
--      - 派單(payload.supplier_id)與出貨,先對那一家供應商拿 FOR KEY SHARE,再鎖訂單 ——
--        跟「刪供應商 → 改訂單」同一個順序;出貨時若鎖完訂單發現供應商已經換了,當成畫面過期擋下。
--      - 非系統身分的 actor_label 一律改成 JWT 的 email、source 一律改成該身分的後台(restaurant/supplier/admin_portal)。
--      其餘判斷與 20260929100000 相同。
--
-- 既有流程:前端沒有任何畫面會直接改 supplier_id / total_amount、或直接寫出貨/改報價(老闆核准只寫 approved_by/approved_at);
--   restaurant_draft_approval(72 項)、transaction_tenant_rls(26 項)、order_transition_rules(172 項)在套用後照樣全過。
-- 死鎖:新增的唯一一個鎖是「派單/出貨時先對供應商列拿 KEY SHARE」,它讓鎖順序跟刪供應商一致;
--   KEY SHARE 跟一般的 UPDATE suppliers(NO KEY UPDATE)相容,不會擋管理員改供應商資料。
--   仍然存在、但與正常流程無關的已知例外:出貨的 confirmed_by 外鍵會對「寫事件的人」的 auth.users 列拿 KEY SHARE,
--   只有「刪掉那個帳號」與「那個人同時在出貨、而且他是這張單的 sent_by(舊欄位)」才可能互等。
--
-- 還原:supabase/rollbacks/20260929100200_order_integrity_hardening.down.sql(要先於 100100、100000 還原)
-- 測試:supabase/tests/database/order_integrity_hardening.test.sql
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
$$;

COMMENT ON FUNCTION public.guard_order_update() IS
  '訂單不能換店、不能直接改供應商、送出後不能直接改金額;採購員只能改草稿且不能填簽核欄位。事件同步、管理員、系統放行。';

-- ---------------------------------------------------------------------
-- B. 餐廳建單不能自己指定供應商
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "restaurant_create_own_orders" ON public.supplier_orders;
CREATE POLICY "restaurant_create_own_orders" ON public.supplier_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IN (SELECT public.current_restaurant_ids())
    AND supplier_id IS NULL
    AND (
      status = 'draft'
      OR (status = 'submitted' AND public.restaurant_role(restaurant_id) IN ('owner', 'manager'))
    )
  );

-- ---------------------------------------------------------------------
-- C. 出貨紀錄與報價紀錄不再開放供應商直接改寫
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "supplier_insert_shipments" ON public.supplier_shipments;

DROP POLICY IF EXISTS "supplier manage own quotes" ON public.order_quotes;
DROP POLICY IF EXISTS "supplier insert own quotes" ON public.order_quotes;
CREATE POLICY "supplier insert own quotes" ON public.order_quotes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
      FROM public.supplier_accounts sa
      JOIN public.supplier_orders o
        ON o.id = order_quotes.order_id AND o.supplier_id = order_quotes.supplier_id
     WHERE sa.user_id = (SELECT auth.uid()) AND sa.is_active AND sa.supplier_id = order_quotes.supplier_id
  ));

-- ---------------------------------------------------------------------
-- D. 事件寫入前的檢查(20260929100000 的版本 + 供應商先鎖 + 顯示欄位由伺服器決定)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
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
$$;

COMMENT ON FUNCTION public.guard_order_transition() IS
  '訂單事件寫入前:派單/出貨先鎖供應商再鎖訂單、actor_id=auth.uid()、非系統的 actor_label/source 由伺服器決定、身分名副其實、from_status=目前狀態、(身分,從,到) 在 order_transition_rules()、派單/報價內容檢查。';

REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_order_transition() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
