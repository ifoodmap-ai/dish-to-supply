-- =====================================================================
-- Rollback:20260928180100_supplier_application_strict_email.sql
--
-- 把匿名送件的 email 檢查還原成 20260928180000 的寬鬆版(只擋空白與多個 @),並刪掉 ledger。
-- ⚠️ 還原後 `a<victim@gmail.com>` 這類字串又能繞過「一筆待審」「24 小時一封確認信」。
-- 要整個退回套用 20260928180000 之前的狀態,接著再跑 20260928180000_supplier_application_mail.down.sql。
--
-- 用法:整段執行,全部在同一個交易裡。可以先用 BEGIN; <本檔>; ROLLBACK; 演練。
-- =====================================================================

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

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928180100';
