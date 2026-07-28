-- =====================================================================
-- 管理員刪除訂單的正式路徑
--
-- 發現的問題:order_events 的 append-only 護欄讓「刪除訂單」完全不可能 ——
-- 刪 supplier_orders 會 CASCADE 到 order_events,撞上 reject_order_event_mutation
-- 而整筆 rollback。連 admin 都清不掉誤建的訂單或測試資料。
--
-- 但護欄本身不能拿掉:「不能事後改寫歷史來美化 GMV」是平台可信度的基礎。
--
-- 解法跟 status 護欄同一招 —— 交易內旗標。只有走這個 SECURITY DEFINER 函式
-- 才會設旗標,護欄才放行;任何人直接 DELETE order_events 一樣被擋。
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reject_order_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- 走 admin_delete_order() 的整筆刪除放行
  IF TG_OP = 'DELETE'
     AND COALESCE(current_setting('ifm.deleting_order', true), '') = '1' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'order_events is append-only';
END;
$$;

/**
 * 刪除一整張訂單及其所有附屬資料。僅限平台管理員。
 *
 * 刻意做成「整張刪除」而不是「刪單一事件」—— 訂單整張消失是看得見的操作,
 * 抽掉其中一筆事件來竄改歷史則不行。
 */
CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.admin_delete_order(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_order(UUID, TEXT) IS
  '管理員刪除整張訂單(含事件流)。append-only 護欄只對這個路徑放行,直接 DELETE 仍被擋。';
