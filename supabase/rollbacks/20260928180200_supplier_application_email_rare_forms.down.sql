-- =====================================================================
-- Rollback:20260928180200_supplier_application_email_rare_forms.sql
--
-- 把匿名送件的 email 規則還原成 20260928180100 的版本(不收撇號、不收 punycode 國碼網域),並刪掉 ledger。
-- 要再往前退,接著依序跑 20260928180100_*.down.sql、20260928180000_*.down.sql。
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
    AND contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$'
    AND char_length(company_name) BETWEEN 1 AND 200
    AND coalesce(char_length(contact_name), 0)  <= 100
    AND coalesce(char_length(contact_phone), 0) <= 50
    AND coalesce(char_length(contact_line), 0)  <= 100
    AND coalesce(char_length(categories), 0)    <= 500
    AND coalesce(char_length(service_areas), 0) <= 500
    AND coalesce(char_length(description), 0)   <= 5000
  );

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260928180200';
