-- =====================================================================
-- 訂單事件的附帶資料:派單、報價、出貨跟狀態在同一個交易裡一起寫(接續 20260929100000)
--
-- 發現的問題(後台精簡 Q1-A / Q2-A 接線時):
--   - 派單要把 supplier_id 寫到訂單上;分兩次呼叫(先改供應商、再寫事件)時中間失敗,
--     訂單會變成「還沒派發、但供應商已經看得到」。
--   - 報價金額要寫到 supplier_orders.total_amount(餐廳確認報價、通知信都讀這欄),但供應商對
--     supplier_orders 沒有 UPDATE 權限(guard_order_update 只放行老闆/店長/管理員/系統),
--     舊的報價頁只寫旁邊的 order_quotes,訂單狀態與金額都不會變。
--   - 出貨紀錄(supplier_shipments)要跟「已出貨」同時成立,不然會有已出貨卻查不到出貨資料的單。
--
-- 做法:order_events 加一支 AFTER INSERT trigger(trg_apply_order_event_details),
--   名稱排在 trg_apply_order_event 之後、trg_notify_order_event 之前(同時機依字母序執行):
--   - dispatched 且 payload 有 supplier_id → supplier_orders.supplier_id
--   - quoted → supplier_orders.total_amount = payload.total_amount(20260929100000 已驗證並統一成這個 key),
--              並留一筆 order_quotes(金額、備註=事件備註、payload.valid_until)
--   - shipped → 新增一筆 supplier_shipments(物流資訊 = payload.tracking,備註 = 事件備註,confirmed_by = 寫事件的人)
--   改訂單欄位時沿用 apply_order_event 的交易內旗標 ifm.status_via_event(guard_order_update 看到它就放行)。
--   送達(delivered)刻意不回寫 supplier_shipments.delivered_at:那是「更新既有子表列」,會跟
--   admin_delete_order(先刪子表、最後才鎖訂單)形成相反的鎖順序;送達時間以 delivered 事件為準。
--
-- 死鎖:只更新已被 20260929100000 鎖住的那一張訂單列,子表一律是「新增」(不等別人的列鎖);
--   新增時的外鍵檢查對 supplier_orders / suppliers / auth.users 拿 KEY SHARE(與一般 UPDATE 相容,但與 DELETE 互斥)。
--   ⚠️ 更正(2026-09-29 審查):出貨/派單的 suppliers KEY SHARE 是在持有訂單鎖之後才拿,跟刪供應商的順序相反 ——
--   20260929100200 讓 guard_order_transition 先鎖供應商再鎖訂單。
--
-- 還原:supabase/rollbacks/20260929100100_order_event_side_effects.down.sql
-- 測試:supabase/tests/database/order_transition_rules.test.sql
-- =====================================================================

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.apply_order_event_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
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
$$;

COMMENT ON FUNCTION public.apply_order_event_details() IS
  '事件寫入後:派單寫 supplier_id、報價寫 total_amount + order_quotes、出貨新增 supplier_shipments(同一個交易)。';

REVOKE ALL ON FUNCTION public.apply_order_event_details() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_apply_order_event_details ON public.order_events;
CREATE TRIGGER trg_apply_order_event_details
AFTER INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.apply_order_event_details();

NOTIFY pgrst, 'reload schema';
