-- =====================================================================
-- Rollback:20260928180000_supplier_application_mail.sql
--
-- 把 supplier_applications 還原成套用前的樣子(匿名 INSERT 回到 WITH CHECK (true)、沒有 trigger),
-- 刪掉寄信紀錄表與輔助函式,並刪掉 ledger。
--
-- ⚠️ 先處理 Edge Function,再跑這支:
--    - approve-supplier 新版會讀 applicant_message、呼叫 supplier_approval_account()、寫 supplier_application_mails,
--      還原資料庫前要先把它換回舊版並重新部署(否則核准 / 退件會直接失敗)。
--    - notify-lead 新版不用換:trigger 沒了就不會再收到 supplier_applications 的呼叫。
-- ⚠️ 會遺失的資料:退件時「給申請者的說明」(applicant_message)與全部寄信紀錄。
-- ⚠️ 還原後,申請者確認信 / 業主通知 / 退件信都不會再寄,匿名送件的限制也一起消失。
--
-- 用法:整段執行,全部在同一個交易裡。可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

DROP TRIGGER IF EXISTS trg_supplier_application_queue_mails ON public.supplier_applications;
DROP FUNCTION IF EXISTS public.supplier_application_queue_mails();
DROP FUNCTION IF EXISTS public.supplier_approval_account(text);
DROP FUNCTION IF EXISTS public.supplier_mail_email_key(text);
DROP TABLE IF EXISTS public.supplier_application_mails;

DROP INDEX IF EXISTS public.supplier_applications_one_pending_per_email;

DROP POLICY IF EXISTS "anon submit application" ON public.supplier_applications;
CREATE POLICY "anon submit application" ON public.supplier_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

ALTER TABLE public.supplier_applications DROP COLUMN IF EXISTS applicant_message;
COMMENT ON COLUMN public.supplier_applications.admin_notes IS NULL;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928180000';
