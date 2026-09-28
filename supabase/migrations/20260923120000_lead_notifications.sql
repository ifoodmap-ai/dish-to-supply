-- =====================================================================
-- 官網表單 lead → email 通知
--
-- partnership_leads / landing_leads 每寫入一筆,就非同步呼叫 notify-lead
-- Edge Function 寄信給業主(ifoodmaptw@gmail.com)。
--
-- 為什麼需要:
--   這兩張表對 anon 只開 INSERT、沒有任何 SELECT policy,而後台 27 個 admin
--   頁面裡沒有一頁列出它們 —— 表單送進來沒有人看得到。在做出後台列表頁之前,
--   寄信是唯一會讓業主知道「有人來敲門」的機制。
--
-- 為什麼用手寫的 pg_net trigger 而不是 Dashboard 的 Database Webhook:
--   兩者底層是同一件事(AFTER INSERT trigger → net.http_post)。這個專案的
--   supabase_functions schema 從來沒被建立過(= 沒人在 Dashboard 開過
--   webhook),而 20260728100000_order_notifications.sql 已經用手寫 trigger
--   的方式跑了兩個月。沿用同一套:設定進 app_config、失敗不影響交易。
--   好處是這份 SQL 進 repo 可被 review、被 migration 落差檢查追蹤,
--   不像 Dashboard 設定只存在線上、沒人知道它存在。
--
-- pg_net 是非同步的 —— 送出 HTTP 請求就返回,不會拖慢 INSERT,
-- 寄信失敗也不會讓 lead 的寫入 rollback。lead 比通知重要得多。
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- app_config 在 20260728100000_order_notifications.sql 已建立(admin-only RLS)。
-- 這裡只補資料,不重建表。
CREATE TABLE IF NOT EXISTS public.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.notify_lead_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net, extensions
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'lead_notify_function_url';
  SELECT value INTO v_key FROM public.app_config WHERE key = 'lead_hook_secret';

  -- 沒設定就安靜跳過 —— 絕不能因為通知沒接好就讓表單送不出去
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
    -- 刻意做成 Supabase Database Webhook 的 payload 形狀,
    -- 之後若改用 Dashboard webhook,Edge Function 不用動
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  TG_TABLE_NAME,
                 'schema', TG_TABLE_SCHEMA,
                 'record', to_jsonb(NEW)
               ),
    timeout_milliseconds := 8000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- 通知出任何問題都不能擋住表單
  RAISE WARNING 'notify_lead_inserted failed on %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_lead_inserted() IS
  '官網表單 lead → notify-lead Edge Function。非同步、失敗不影響 INSERT。設定放在 app_config。';

DROP TRIGGER IF EXISTS trg_notify_partnership_lead ON public.partnership_leads;
CREATE TRIGGER trg_notify_partnership_lead
AFTER INSERT ON public.partnership_leads
FOR EACH ROW EXECUTE FUNCTION public.notify_lead_inserted();

DROP TRIGGER IF EXISTS trg_notify_landing_lead ON public.landing_leads;
CREATE TRIGGER trg_notify_landing_lead
AFTER INSERT ON public.landing_leads
FOR EACH ROW EXECUTE FUNCTION public.notify_lead_inserted();

-- 設定值(function URL 與共享密鑰)另外用 UPSERT 寫入,不寫死在 migration 裡。
-- 見 docs/DEPLOY.md「表單 lead 通知」一節。
