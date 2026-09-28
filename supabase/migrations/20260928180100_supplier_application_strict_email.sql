-- =====================================================================
-- 供應商入駐申請:匿名送件的 email 改成嚴格格式(補 20260928180000)
--
-- 20260928180000 的格式檢查只擋「空白與多個 @」,像 `a<victim@gmail.com>`、
-- `廣告文字<victim@gmail.com>`、`x@gmail.com.` 這類字串都會過:
--   - 每個前綴都是不同字串 →「同一個 email 只能一筆待審」與「24 小時一封確認信」都擋不住,
--     全站每小時的確認信額度可以全部灌到同一個信箱
--   - 寄信服務可能把 `文字<信箱>` 當成「顯示名稱 + 地址」,等於讓人在收件人名稱塞廣告
-- 改成只收一般的 email(英數與 . _ % + - 的帳號、正常的網域、英文頂級網域),
-- 前端(JoinSupplierPage)與 Edge Function(isDeliverableEmail)用同一條規則再擋一次。
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
    AND contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$'
    AND char_length(company_name) BETWEEN 1 AND 200
    AND coalesce(char_length(contact_name), 0)  <= 100
    AND coalesce(char_length(contact_phone), 0) <= 50
    AND coalesce(char_length(contact_line), 0)  <= 100
    AND coalesce(char_length(categories), 0)    <= 500
    AND coalesce(char_length(service_areas), 0) <= 500
    AND coalesce(char_length(description), 0)   <= 5000
  );
