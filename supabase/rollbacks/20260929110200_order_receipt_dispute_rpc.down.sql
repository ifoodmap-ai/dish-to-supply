-- =====================================================================
-- Rollback:20260929110200_order_receipt_dispute_rpc.sql
--
-- 拿掉 restaurant_receive_order / restaurant_open_dispute 兩支 RPC,admin_delete_order 還原成
-- 20260728110000 的版本(先刪子表、最後才碰訂單),再刪掉 ledger。不動任何資料列。
-- ⚠️ 前端(ReceiveOrderDialog、餐廳訂單頁的爭議申請)呼叫這兩支 RPC:還原前要先把前端退回舊版,
--    不然收貨與申請爭議會失敗(PostgREST 回 404 找不到函式)。
-- 還原順序:這支 → 20260929110100.down → 20260929110000.down。
--
-- 用法:整段執行,全部在同一個交易裡(Management API 本來就是一個交易;psql 請加 --single-transaction)。
-- 可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

SET LOCAL lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.restaurant_receive_order(uuid, text, boolean, text, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.restaurant_open_dispute(uuid, text, text, text);

-- admin_delete_order:20260929110200 套用前正式庫的原文(pg_get_functiondef)
CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '只有平台管理員可以刪除訂單' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.supplier_orders WHERE id = p_order_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN FALSE;
  END IF;

  PERFORM set_config('ifm.deleting_order', '1', true);

  DELETE FROM public.order_reviews      WHERE order_id = p_order_id;
  DELETE FROM public.delivery_receipts  WHERE order_id = p_order_id;
  DELETE FROM public.disputes           WHERE order_id = p_order_id;
  DELETE FROM public.supplier_shipments WHERE order_id = p_order_id;
  DELETE FROM public.order_events       WHERE order_id = p_order_id;
  DELETE FROM public.supplier_orders    WHERE id = p_order_id;

  PERFORM set_config('ifm.deleting_order', '', true);

  RAISE NOTICE '訂單 % 已由管理員刪除。原因:%', p_order_id, COALESCE(p_reason, '(未填)');
  RETURN TRUE;
END;
$function$;
COMMENT ON FUNCTION public.admin_delete_order(uuid, text) IS '管理員刪除整張訂單(含事件流)。append-only 護欄只對這個路徑放行,直接 DELETE 仍被擋。';

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929110200';

NOTIFY pgrst, 'reload schema';
