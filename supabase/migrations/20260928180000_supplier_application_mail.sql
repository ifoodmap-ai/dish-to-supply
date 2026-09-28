-- =====================================================================
-- 供應商入駐申請:寄信流程 + 防濫用
--
-- 業主問「申請之後能不能收到信」。這之前的現況:
--   - 送出申請:申請者沒有確認信,業主也不會收到通知(這張表沒有任何 trigger)
--   - 退件:只改資料庫,不會通知申請者
--
-- 做法(寄信本身在 Edge Function,這裡只負責「決定要不要寄」並排隊):
--
--   瀏覽器 --(anon INSERT)--> supplier_applications
--     --(AFTER INSERT trigger:在同一個交易裡做頻率判斷、記一筆 queued)--> supplier_application_mails
--     --(pg_net,只帶申請 id)--> notify-lead Edge Function
--     --(逐筆把 queued「搶」成 sending 才寄,寄完記 resend_id)--> Resend
--
-- 為什麼頻率判斷放在 trigger 而不是 Edge Function:
--   申請表是匿名的,加了自動回信之後,等於任何人都能叫我們寄信給任意信箱。
--   「先數再寄」如果放在 Edge Function,同時灌進來的請求每一個數到的都是同一個數字,
--   全部過關(20260928160000_restaurant_invite_guards.sql 同一個理由)。
--   在 trigger 裡用 advisory lock 排隊,「數 + 記一筆」和申請寫入在同一個交易 —— 併發也不會超量,
--   而且直接打 PostgREST 繞過前端也一樣受限。
--
-- 為什麼 pg_net 只帶 id、不帶整筆資料:
--   Edge Function 只寄「資料庫裡排好隊(queued)」的信,而且先把狀態搶成 sending 才寄。
--   就算共享密鑰外洩、有人重播請求,也沒辦法叫它寄任意內容、或把同一封信寄兩次。
--
-- 防濫用規則(數字可以在 app_config 改,不用重新部署):
--   1. 同一個 email 只能有一筆「待審」申請           → 部分唯一索引
--   2. 同一個 email 24 小時內最多收一封確認信        → trigger(email 先正規化:去 +tag、gmail 去點)
--   3. 全站每小時確認信上限(預設 20)               → trigger,app_config.supplier_application_confirm_hourly_cap
--   4. 全站每小時業主通知上限(預設 30,保護業主信箱與 Resend 額度)
--                                                  → trigger,app_config.supplier_application_owner_hourly_cap
--   5. 匿名只能送「待審」的乾淨申請(不能自己帶 approved / 管理員欄位、欄位長度有上限)
--   6. 前端另有 honeypot 欄位(JoinSupplierPage.tsx)
--   確認信刻意不回顯申請者填的任何文字(公司名、簡介…),避免被拿來替別人的信箱送垃圾內容。
--
-- 只新增欄位 / 表 / 函式 / trigger / 索引,並收緊匿名 INSERT policy;不動任何既有資料。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 退件時「給申請者的說明」。admin_notes 維持內部備註,絕不寄出。
-- ---------------------------------------------------------------------
ALTER TABLE public.supplier_applications
  ADD COLUMN IF NOT EXISTS applicant_message TEXT;

COMMENT ON COLUMN public.supplier_applications.applicant_message IS
  '退件時給申請者的說明(選填)—— 只有這一欄會出現在退件信裡。';
COMMENT ON COLUMN public.supplier_applications.admin_notes IS
  '內部備註,只有管理員看得到,絕不寄給申請者。';

-- ---------------------------------------------------------------------
-- 2) 同一個 email 只能有一筆待審申請(核准或退件之後才能再送)
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS supplier_applications_one_pending_per_email
  ON public.supplier_applications (lower(btrim(contact_email)))
  WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- 3) 匿名送件只能是「待審」、不能帶管理員欄位,欄位長度有上限
--    (原本是 WITH CHECK (true):匿名可以直接寫一筆 status='approved' 進來)
--    管理員另有 "admin manage applications"(FOR ALL, is_admin()),不受影響。
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "anon submit application" ON public.supplier_applications;
CREATE POLICY "anon submit application" ON public.supplier_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND admin_notes IS NULL
    AND applicant_message IS NULL
    AND reviewed_at IS NULL
    AND char_length(contact_email) <= 254
    AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND char_length(company_name) BETWEEN 1 AND 200
    AND coalesce(char_length(contact_name), 0)  <= 100
    AND coalesce(char_length(contact_phone), 0) <= 50
    AND coalesce(char_length(contact_line), 0)  <= 100
    AND coalesce(char_length(categories), 0)    <= 500
    AND coalesce(char_length(service_areas), 0) <= 500
    AND coalesce(char_length(description), 0)   <= 5000
  );

-- ---------------------------------------------------------------------
-- 4) 寄信紀錄:頻率限制的依據、防重複寄信、稽核
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_application_mails (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- 申請被刪掉時保留寄信紀錄(頻率限制還要用),所以是 SET NULL 不是 CASCADE
  application_id UUID REFERENCES public.supplier_applications(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL CHECK (kind IN (
                   'owner_notification',         -- 新申請 → 業主
                   'applicant_confirmation',     -- 新申請 → 申請者「已收到」
                   'approved_existing_account',  -- 核准,但 email 原本就有帳號 → 申請者「請用原帳號登入」
                   'rejection'                   -- 退件 → 申請者
                 )),
  -- 正規化後的收件 email(只有寄給申請者的信才有),頻率限制用
  email_key      TEXT,
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason    TEXT,
  subject        TEXT,
  -- 寄給申請者的純文字內容(稽核用:事後查得到到底寄了什麼)
  body_text      TEXT,
  resend_id      TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同一筆申請、同一種信最多一封(退件信 / 核准通知不會重複寄)
CREATE UNIQUE INDEX IF NOT EXISTS supplier_application_mails_once_per_kind
  ON public.supplier_application_mails (application_id, kind);
CREATE INDEX IF NOT EXISTS idx_supplier_application_mails_kind_time
  ON public.supplier_application_mails (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_application_mails_key_time
  ON public.supplier_application_mails (email_key, created_at DESC)
  WHERE email_key IS NOT NULL;

COMMENT ON TABLE public.supplier_application_mails IS
  '供應商申請相關寄信紀錄(排隊、頻率限制、防重複、稽核)。只有 service_role 與 trigger 碰得到。';

-- 開 RLS、不給任何 policy、收回 anon / authenticated 權限:前端完全碰不到
ALTER TABLE public.supplier_application_mails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_application_mails FROM PUBLIC;
REVOKE ALL ON public.supplier_application_mails FROM anon;
REVOKE ALL ON public.supplier_application_mails FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_application_mails TO service_role;

-- ---------------------------------------------------------------------
-- 5) email 正規化(只給頻率限制用):小寫、去空白、去 +tag;gmail 另外去掉點
--    Foo.Bar+x@GMail.com 與 foobar@gmail.com 是同一個信箱,不能各收一封
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_mail_email_key(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN s.domain IN ('gmail.com', 'googlemail.com')
             THEN replace(s.local, '.', '') || '@gmail.com'
           ELSE s.local || '@' || s.domain
         END
    FROM (
      SELECT split_part(split_part(e.addr, '@', 1), '+', 1) AS local,
             split_part(e.addr, '@', 2)                     AS domain
        FROM (SELECT lower(btrim(coalesce(p_email, ''))) AS addr) e
    ) s
$$;

REVOKE ALL ON FUNCTION public.supplier_mail_email_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_mail_email_key(text) FROM anon;
REVOKE ALL ON FUNCTION public.supplier_mail_email_key(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_mail_email_key(text) TO service_role;

-- ---------------------------------------------------------------------
-- 6) 新申請 → 決定寄哪些信、排隊、叫 notify-lead 起來寄
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_application_queue_mails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url            text;
  v_secret         text;
  v_raw            text;
  v_owner_cap      integer := 30;
  v_confirm_cap    integer := 20;
  v_key            text;
  v_owner_status   text := 'queued';
  v_owner_reason   text;
  v_confirm_status text := 'queued';
  v_confirm_reason text;
BEGIN
  -- 只處理真正的新申請(匿名 policy 保證是 pending;管理員手動補資料不寄信)
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_url    FROM public.app_config WHERE key = 'lead_notify_function_url';
  SELECT value INTO v_secret FROM public.app_config WHERE key = 'lead_hook_secret';
  -- 通知沒接好就安靜跳過 —— 絕不能因此讓申請送不出去
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_raw FROM public.app_config WHERE key = 'supplier_application_owner_hourly_cap';
  IF v_raw ~ '^[0-9]{1,6}$' THEN v_owner_cap := v_raw::integer; END IF;
  SELECT value INTO v_raw FROM public.app_config WHERE key = 'supplier_application_confirm_hourly_cap';
  IF v_raw ~ '^[0-9]{1,6}$' THEN v_confirm_cap := v_raw::integer; END IF;

  v_key := public.supplier_mail_email_key(NEW.contact_email);

  -- 所有新申請在這裡排隊:「數 + 記一筆」在同一把鎖、同一個交易裡完成,併發也不會超量
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier_application_mails', 0));

  IF (SELECT count(*) FROM public.supplier_application_mails
       WHERE kind = 'owner_notification'
         AND status <> 'skipped'
         AND created_at > now() - interval '1 hour') >= v_owner_cap THEN
    v_owner_status := 'skipped';
    v_owner_reason := 'owner_hourly_cap';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supplier_application_mails
              WHERE kind = 'applicant_confirmation'
                AND status <> 'skipped'
                AND email_key = v_key
                AND created_at > now() - interval '24 hours') THEN
    v_confirm_status := 'skipped';
    v_confirm_reason := 'email_24h';
  ELSIF (SELECT count(*) FROM public.supplier_application_mails
          WHERE kind = 'applicant_confirmation'
            AND status <> 'skipped'
            AND created_at > now() - interval '1 hour') >= v_confirm_cap THEN
    v_confirm_status := 'skipped';
    v_confirm_reason := 'hourly_cap';
  END IF;

  INSERT INTO public.supplier_application_mails (application_id, kind, email_key, status, skip_reason)
  VALUES (NEW.id, 'owner_notification',     NULL,  v_owner_status,   v_owner_reason),
         (NEW.id, 'applicant_confirmation', v_key, v_confirm_status, v_confirm_reason);

  IF v_owner_status = 'queued' OR v_confirm_status = 'queued' THEN
    -- pg_net 是非同步的:交易 commit 之後才真的送出,不會拖慢申請寫入
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_secret
                 ),
      body    := jsonb_build_object(
                   'type',   'INSERT',
                   'table',  'supplier_applications',
                   'schema', 'public',
                   'record', jsonb_build_object('id', NEW.id)
                 ),
      timeout_milliseconds := 10000
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- 通知出任何問題都不能擋住申請(排隊紀錄會跟著這個區塊一起 rollback)
  RAISE WARNING 'supplier_application_queue_mails failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.supplier_application_queue_mails() IS
  '新供應商申請 → 頻率判斷 + 排隊 supplier_application_mails → pg_net 叫 notify-lead 寄信。失敗不影響 INSERT。';

REVOKE ALL ON FUNCTION public.supplier_application_queue_mails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_application_queue_mails() FROM anon;
REVOKE ALL ON FUNCTION public.supplier_application_queue_mails() FROM authenticated;

DROP TRIGGER IF EXISTS trg_supplier_application_queue_mails ON public.supplier_applications;
CREATE TRIGGER trg_supplier_application_queue_mails
AFTER INSERT ON public.supplier_applications
FOR EACH ROW EXECUTE FUNCTION public.supplier_application_queue_mails();

-- ---------------------------------------------------------------------
-- 7) 核准時查「這個 email 是不是已經有帳號、是否已綁定供應商」(給 approve-supplier 用)
--    auth.admin.listUsers 一頁最多 200 筆、而且要翻頁,不可靠;直接查 auth.users。
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_approval_account(p_email text)
RETURNS TABLE (user_id uuid, linked_supplier_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, sa.supplier_id
    FROM auth.users u
    LEFT JOIN public.supplier_accounts sa ON sa.user_id = u.id
   WHERE lower(u.email) = lower(btrim(p_email))
   ORDER BY u.is_sso_user, u.created_at
   LIMIT 1
$$;

COMMENT ON FUNCTION public.supplier_approval_account(text) IS
  'approve-supplier 專用:email 對應的既有帳號與已綁定的供應商。只給 service_role。';

REVOKE ALL ON FUNCTION public.supplier_approval_account(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_approval_account(text) FROM anon;
REVOKE ALL ON FUNCTION public.supplier_approval_account(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_approval_account(text) TO service_role;
