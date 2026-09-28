-- =====================================================================
-- 供應商入駐申請:email 規則放寬兩種「合法但少見」的寫法(補 20260928180100)
--
-- 180100 為了擋 `文字<信箱>`、`x@gmail.com.` 改成嚴格格式,但也誤擋了:
--   - 帳號含撇號:o'brien@example.com
--   - punycode 的國碼網域:user@example.xn--kpry57d(.台灣)
-- 這兩種都不含 < > " 空白逗號,不能拿來塞顯示名稱或繞過「同一個 email」的判斷,放行。
-- 前端(JoinSupplierPage)與寄信端(supplier-mail.ts 的 EMAIL_PATTERN)同步改成同一條規則。
--
-- 只重建這一條 policy,不動資料、不動其他 policy。
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
    AND contact_email ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.([A-Za-z]{2,}|xn--[A-Za-z0-9-]+)$'
    AND char_length(company_name) BETWEEN 1 AND 200
    AND coalesce(char_length(contact_name), 0)  <= 100
    AND coalesce(char_length(contact_phone), 0) <= 50
    AND coalesce(char_length(contact_line), 0)  <= 100
    AND coalesce(char_length(categories), 0)    <= 500
    AND coalesce(char_length(service_areas), 0) <= 500
    AND coalesce(char_length(description), 0)   <= 5000
  );
