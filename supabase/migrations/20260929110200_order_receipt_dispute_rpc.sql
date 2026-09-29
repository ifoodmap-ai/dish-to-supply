-- =====================================================================
-- 收貨與爭議改成一次交易完成(業主 2026-09-29 拍板 F7);刪單改成先鎖訂單
--
-- 發現的問題:
--   收貨對話框與爭議申請都是從前端分好幾次寫:先寫送貨單(delivery_receipts)、回填出貨紀錄的收貨欄位、
--   或建爭議案件(disputes),最後才寫事件。兩個人同時操作(老闆按「確認收貨」、採購員同時按「回報異常」)時,
--   後到的事件會因為畫面過期被 guard_order_transition 擋下,但它先寫的送貨單、出貨紀錄 receive_status、
--   爭議案件已經留在資料庫裡 —— 訂單明明是 received,卻掛著一筆「有差異」的送貨單。
--
-- 做法:包成兩支 RPC,都是 SECURITY INVOKER(照呼叫者身分跑,RLS、欄位權限、guard_order_transition 全部照常):
--   - restaurant_receive_order(訂單, 畫面上的狀態, 有沒有差異, 備註, 照片, 差異明細, 品項數)
--   - restaurant_open_dispute(訂單, 畫面上的狀態, 類型, 說明)
--   兩支都「先寫事件」:guard 會先鎖住訂單、檢查身分與轉移、畫面過期就整筆擋下 —— 後面的子表一筆都還沒寫;
--   子表寫入失敗(例如爭議類型不合法)也會讓整個交易連同事件一起回滾。子表的 id 先產生好寫進事件內容。
--   另外 admin_delete_order 改成先鎖訂單再刪子表,讓所有碰訂單的交易都是「先訂單、後子表」的同一個鎖順序
--   (以前刪單是先刪子表、最後才碰訂單;跟 RPC「持有訂單鎖、再改出貨紀錄」同時發生會死鎖)。
--
-- 死鎖:兩支 RPC 的鎖順序 = 訂單(事件的 guard)→ 出貨紀錄 / 送貨單 / 爭議(新增或更新);
--   同一張單的兩個 RPC 在事件那一步就排隊,後到的拿到新狀態後被判過期,不會碰到子表。
--
-- 還原:supabase/rollbacks/20260929110200_order_receipt_dispute_rpc.down.sql
--   (要先把前端退回直接寫子表的版本,否則收貨與爭議會呼叫不存在的 RPC)
-- 測試:supabase/tests/database/order_receipt_dispute_rpc.test.sql;兩人同時操作的並發測試見交付說明
-- =====================================================================

SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- 1. 確認收貨 / 回報收貨異常:事件 + 送貨單 + 出貨紀錄的收貨欄位,一次交易
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_receive_order(
  p_order_id        uuid,
  p_from_status     text,
  p_has_discrepancy boolean,
  p_note            text    DEFAULT NULL,
  p_image_url       text    DEFAULT NULL,
  p_discrepancies   jsonb   DEFAULT '[]'::jsonb,
  p_items_total     integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_to          text := CASE WHEN p_has_discrepancy THEN 'discrepancy' ELSE 'received' END;
  v_diffs       jsonb := CASE WHEN jsonb_typeof(p_discrepancies) = 'array' THEN p_discrepancies ELSE '[]'::jsonb END;
  v_receipt_id  uuid;
  v_shipment_id uuid;
  v_event_id    uuid;
BEGIN
  -- 這張單最新的一筆出貨紀錄(可能沒有:舊資料或供應商沒經由「出貨」事件)
  SELECT s.id INTO v_shipment_id
    FROM public.supplier_shipments s
   WHERE s.order_id = p_order_id
   ORDER BY s.created_at DESC
   LIMIT 1;

  -- 有照片或有差異才留一筆送貨單;id 先產生,事件內容與送貨單用同一個
  IF p_image_url IS NOT NULL OR p_has_discrepancy THEN
    v_receipt_id := gen_random_uuid();
  END IF;

  -- 1) 先寫事件:guard_order_transition 鎖住訂單、檢查身分與轉移;畫面過期(別人剛收貨/回報)就在這裡整筆擋下,
  --    後面的送貨單、出貨紀錄一筆都不會寫
  INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, note, payload)
  VALUES (
    p_order_id, p_from_status, v_to, 'restaurant', 'restaurant_portal', NULLIF(btrim(p_note), ''),
    jsonb_build_object(
      'items_total', p_items_total,
      'discrepancy_count', jsonb_array_length(v_diffs),
      'discrepancies', v_diffs,
      'receipt_id', v_receipt_id,
      'shipment_id', v_shipment_id,
      'has_photo', p_image_url IS NOT NULL
    )
  )
  RETURNING id INTO v_event_id;

  -- 2) 送貨單
  IF v_receipt_id IS NOT NULL THEN
    INSERT INTO public.delivery_receipts (id, order_id, shipment_id, image_url, ai_parsed, discrepancies, has_discrepancy, uploaded_by)
    VALUES (v_receipt_id, p_order_id, v_shipment_id, p_image_url, NULL,
            CASE WHEN jsonb_array_length(v_diffs) > 0 THEN v_diffs ELSE NULL END,
            p_has_discrepancy, v_uid);
  END IF;

  -- 3) 出貨紀錄的收貨三欄(沒有出貨紀錄就略過)
  IF v_shipment_id IS NOT NULL THEN
    UPDATE public.supplier_shipments
       SET received_at = now(),
           received_by = v_uid,
           receive_status = CASE WHEN p_has_discrepancy THEN 'discrepancy' ELSE 'ok' END
     WHERE id = v_shipment_id;
  END IF;

  RETURN jsonb_build_object('event_id', v_event_id, 'to_status', v_to,
                            'receipt_id', v_receipt_id, 'shipment_id', v_shipment_id);
END;
$$;

COMMENT ON FUNCTION public.restaurant_receive_order(uuid, text, boolean, text, text, jsonb, integer) IS
  '餐廳確認收貨/回報收貨異常:事件(先寫,畫面過期整筆擋下)+ 送貨單 + 出貨紀錄收貨欄位,一次交易。照呼叫者權限跑(RLS、guard 都生效)。';

-- ---------------------------------------------------------------------
-- 2. 申請爭議處理:事件 + 爭議案件,一次交易
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_open_dispute(
  p_order_id    uuid,
  p_from_status text,
  p_kind        text,
  p_detail      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_dispute_id uuid := gen_random_uuid();
  v_detail     text := NULLIF(btrim(p_detail), '');
  v_event_id   uuid;
BEGIN
  -- 1) 先寫事件(鎖訂單、檢查身分與轉移;畫面過期整筆擋下,不會留下爭議案件)
  INSERT INTO public.order_events (order_id, from_status, to_status, actor_role, source, note, payload)
  VALUES (p_order_id, p_from_status, 'disputed', 'restaurant', 'restaurant_portal', v_detail,
          jsonb_build_object('kind', p_kind, 'dispute_id', v_dispute_id))
  RETURNING id INTO v_event_id;

  -- 2) 爭議案件(kind 不合法會被 CHECK 擋下,事件一起回滾)
  INSERT INTO public.disputes (id, order_id, kind, status, opened_by, opened_role, detail)
  VALUES (v_dispute_id, p_order_id, p_kind, 'open', auth.uid(), 'restaurant', v_detail);

  RETURN jsonb_build_object('event_id', v_event_id, 'dispute_id', v_dispute_id);
END;
$$;

COMMENT ON FUNCTION public.restaurant_open_dispute(uuid, text, text, text) IS
  '餐廳申請爭議處理:事件(先寫,畫面過期整筆擋下)+ 爭議案件,一次交易。照呼叫者權限跑(RLS、guard 都生效)。';

REVOKE ALL ON FUNCTION public.restaurant_receive_order(uuid, text, boolean, text, text, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_open_dispute(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_receive_order(uuid, text, boolean, text, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_open_dispute(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. admin_delete_order:先鎖訂單再刪子表(20260728110000 的版本 + 一行鎖)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '只有平台管理員可以刪除訂單' USING ERRCODE = '42501';
  END IF;

  -- 先鎖訂單,再刪子表(20260929110200):跟事件寫入、收貨/爭議 RPC 同一個順序 —— 先訂單、後子表。
  -- 以前是先刪子表、最後才碰訂單,跟「持有訂單鎖、再寫出貨紀錄」的交易順序相反,同時發生會死鎖。
  PERFORM 1 FROM public.supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
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

NOTIFY pgrst, 'reload schema';
