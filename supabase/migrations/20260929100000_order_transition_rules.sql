-- =====================================================================
-- 訂單狀態轉移表:伺服器端檢查「誰可以把訂單從哪個狀態改成哪個狀態」
-- (業主 2026-09-29 拍板後台精簡 Q1-A / Q2-A:供應商與管理員的訂單動作正式接上狀態機)
--
-- 發現的問題:
--   order_events 的 INSERT policy 只檢查「訂單是不是你這家店的/派給你的」,不檢查轉移本身。
--   所以任何當事人都能寫任意一筆事件:供應商可以自己寫 delivered→received(GMV 只認餐廳收貨)、
--   採購員可以 submitted→received、任何人可以跳關或把已結案的單改回進行中;
--   actor_id / actor_role / created_at 也是前端填什麼就存什麼(可以冒用別人、竄改時間)。
--   20260928190000 的 guard_order_submission 只管「送出類」事件。
--
-- 做法:order_events 加一支 BEFORE INSERT trigger(trg_guard_order_transition):
--   1. 以主鍵鎖住訂單那一列(FOR NO KEY UPDATE),讀「目前」狀態 —— 事件的 from_status 是前端填的,不可信
--   2. actor_id 一律改成 auth.uid();非系統身分的 created_at 一律改成 now()
--   3. 身分(actor_role)必須名副其實:
--        restaurant = 這家店已接受、啟用中的成員(老闆/店長/採購員,依 restaurant_role() 分開查表)
--        supplier   = 這張單的供應商的啟用中帳號
--        admin      = is_admin()
--        system     = 沒有登入者,且 JWT role 是 service_role 或沒有 JWT(與 guard_order_update 同一個判斷)
--   4. 前端有填 from_status 就必須等於目前狀態(畫面過期時擋下來,請使用者重新整理),再改寫成目前狀態
--   5. (身分, 目前狀態, 目標狀態) 必須在 order_transition_rules() 裡
--   6. 事件內容:派單的 payload.supplier_id 必須是存在的供應商;報價必須帶大於 0 的金額
--      (payload.total_amount,相容舊寫法 payload.amount),有效日期要是合法日期
--   另加一支 AFTER INSERT … FOR EACH STATEMENT trigger:同一個 INSERT 裡同一張單只能有一筆事件
--   (一次寫多筆時,後面幾筆的 BEFORE 檢查看到的還是「第一筆套用前」的狀態,會繞過逐步檢查)。
--
-- 轉移表 = src/lib/orders.ts 的 TRANSITIONS(前端按鈕的依據)逐條對齊,src/lib/orders.test.ts 會解析本檔比對;
--   只多了兩件事:採購員不能 draft→submitted(20260928190000 的簽核規則),
--   系統 = 所有角色的轉移聯集 + 等待中的單逾時(dispatched/sent/accepted/quoted → expired,給之後的排程用)。
--
-- 與 guard_order_submission 共存:同一個時機的 trigger 依名稱字母序執行,
--   trg_guard_order_submission('s')先於 trg_guard_order_transition('t'),所以送出類事件被拒時的訊息不變
--   (supabase/tests/database/restaurant_draft_approval.test.sql 72 項不用改);本 trigger 再做完整檢查。
--
-- 死鎖:唯一新增的鎖是 BEFORE 階段對訂單列拿 FOR NO KEY UPDATE —— 這跟 apply_order_event 本來就會對同一列做的
--   UPDATE 是同一種鎖,只是提早拿(以前是 AFTER 階段才拿)。事件寫入原本的鎖:外鍵檢查的 KEY SHARE(相容於
--   NO KEY UPDATE)→ apply_order_event 的 NO KEY UPDATE(已持有)。同一張單的兩筆並發事件改成在 BEFORE 就排隊,
--   後到的等前一筆 commit 後重新讀到新狀態再判斷(以前是兩筆都照舊狀態通過、UPDATE 時才排隊)。
--   一次只鎖一張單。⚠️ 更正(2026-09-29 審查):100100 的派單/出貨會在持有訂單鎖之後對 suppliers 拿 KEY SHARE,
--   跟「刪供應商 → ON DELETE SET NULL 改訂單」順序相反,同時發生會死鎖 —— 20260929100200 改成先鎖供應商再鎖訂單。
--
-- 還原:supabase/rollbacks/20260929100000_order_transition_rules.down.sql(要先還原 20260929100100)
-- 測試:supabase/tests/database/order_transition_rules.test.sql(pgTAP,包在 BEGIN … ROLLBACK)
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- 1. 轉移表(唯一來源;前端 TRANSITIONS 由 vitest 對照這一段)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_transition_rules()
RETURNS TABLE (actor text, from_status text, to_status text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION public.order_transition_rules() IS
  '訂單狀態轉移表(身分, 從, 到)。身分:owner/manager/purchaser/supplier/admin/system。與 src/lib/orders.ts TRANSITIONS 對齊。';

CREATE OR REPLACE FUNCTION public.order_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN '草稿'         WHEN 'submitted' THEN '待派發'     WHEN 'dispatched' THEN '待接單'
    WHEN 'accepted' THEN '待報價'    WHEN 'quoted' THEN '待確認'        WHEN 'confirmed' THEN '待出貨'
    WHEN 'shipped' THEN '已出貨'     WHEN 'in_transit' THEN '運送中'    WHEN 'delivered' THEN '待收貨'
    WHEN 'received' THEN '待評價'    WHEN 'reviewed' THEN '已評價'      WHEN 'closed' THEN '已結案'
    WHEN 'rejected' THEN '供應商拒單' WHEN 'discrepancy' THEN '收貨有差異' WHEN 'disputed' THEN '爭議中'
    WHEN 'cancelled' THEN '已取消'   WHEN 'expired' THEN '逾時未回應'
    WHEN 'pending' THEN '待處理'     WHEN 'sent' THEN '已派發'          WHEN 'completed' THEN '已完成'
    ELSE COALESCE(p_status, '(無)')
  END
$$;

-- ---------------------------------------------------------------------
-- 2. 事件寫入前的檢查
-- ---------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS trg_guard_order_transition ON public.order_events;
CREATE TRIGGER trg_guard_order_transition
BEFORE INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.guard_order_transition();

-- ---------------------------------------------------------------------
-- 3. 同一個 INSERT 裡,同一張單只能有一筆事件
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_events_one_per_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM new_events GROUP BY order_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION '同一張訂單一次只能寫一筆事件,請一步一步來'
      USING ERRCODE = 'P0001', HINT = 'one_event_per_order';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_events_one_per_order ON public.order_events;
CREATE TRIGGER trg_order_events_one_per_order
AFTER INSERT ON public.order_events
REFERENCING NEW TABLE AS new_events
FOR EACH STATEMENT EXECUTE FUNCTION public.order_events_one_per_order();

-- ---------------------------------------------------------------------
-- 4. 權限:這幾支都是內部用,不開給 API
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.order_transition_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_status_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_order_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_events_one_per_order() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
