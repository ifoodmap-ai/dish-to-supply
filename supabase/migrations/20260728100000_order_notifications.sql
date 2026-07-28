-- =====================================================================
-- 訂單關鍵節點自動通知
--
-- order_events 每寫入一筆,就非同步呼叫 notify Edge Function 決定要不要寄信。
--
-- 為什麼掛在 DB 而不是前端:
--   1. 系統事件(自動派發、cron 逾時)不經過前端,掛前端會漏掉
--   2. 使用者關掉分頁不該影響通知送出
--   3. 前端有三個入口(餐廳/供應商/管理員),掛前端要維護三份
--
-- pg_net 是非同步的 —— 送出 HTTP 請求就返回,不會拖慢交易,
-- 寄信失敗也不會讓 order_events 的寫入 rollback。通知是加值,不該擋住交易。
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Edge Function 的網址與 service key 存在這裡,避免寫死在函式裡。
-- (Supabase 的 Vault 在 Management API 不好操作,用一張 admin-only 的設定表)
CREATE TABLE IF NOT EXISTS public.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 只有 admin 讀得到;trigger 走 SECURITY DEFINER 不受 RLS 限制
DROP POLICY IF EXISTS "app_config admin only" ON public.app_config;
CREATE POLICY "app_config admin only" ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.notify_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net, extensions
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_notify_order_event ON public.order_events;
CREATE TRIGGER trg_notify_order_event
AFTER INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.notify_order_event();

COMMENT ON FUNCTION public.notify_order_event() IS
  '訂單事件 → notify Edge Function。非同步、失敗不影響交易。設定放在 app_config。';
