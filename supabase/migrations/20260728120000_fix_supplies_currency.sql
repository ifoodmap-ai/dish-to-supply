-- =====================================================================
-- 修正供應商目錄的幣別 —— 50 項裡有 37 項被標成 USD,但價格明顯是台幣
--
-- 蓬萊白米 42/kg、高麗菜 38/kg、牛腩 395/kg 這些都是台幣行情;
-- 標成 USD 之後,管理員後台「智慧媒合」比價頁會顯示成
-- 「小黃瓜 USD 49 / kg」,對著供應商 demo 時看起來就是系統壞掉。
--
-- 平台目前全站只有台幣(訂單金額、價格指數、報價都是 NT$),
-- 沒有任何匯率換算邏輯,所以 supplies.currency 只有 'TWD' 是合理的。
-- =====================================================================

UPDATE public.supplies
   SET currency = 'TWD'
 WHERE currency IS DISTINCT FROM 'TWD';

-- 之後要真的做多幣別,得先有匯率來源與換算邏輯;在那之前先把欄位鎖住,
-- 避免又被塞進顯示不出來的幣別。
ALTER TABLE public.supplies
  DROP CONSTRAINT IF EXISTS supplies_currency_twd_only;

ALTER TABLE public.supplies
  ADD CONSTRAINT supplies_currency_twd_only
  CHECK (currency IS NULL OR currency = 'TWD');

COMMENT ON COLUMN public.supplies.currency IS
  '目前只允許 TWD。全站無匯率換算,要支援多幣別要先做換算層再放寬這個 CHECK。';
