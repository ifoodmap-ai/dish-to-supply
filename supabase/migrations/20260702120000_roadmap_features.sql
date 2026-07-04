-- Roadmap features for the public investor progress page (/investors)
-- NOTE: the production DB is dashboard-managed; this file is the source of
-- record but must also be applied to the live project (Management API / SQL editor).

CREATE TABLE public.roadmap_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  block TEXT NOT NULL CHECK (block IN ('ai_matching', 'procurement', 'supplier_portal')),
  phase INT NOT NULL DEFAULT 1 CHECK (phase BETWEEN 1 AND 4),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('done', 'in_progress', 'planned')),
  image_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.roadmap_features ENABLE ROW LEVEL SECURITY;

-- The investor page is public: anonymous visitors must be able to read.
CREATE POLICY "Anyone can view roadmap features"
ON public.roadmap_features
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can manage roadmap features"
ON public.roadmap_features
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER update_roadmap_features_updated_at
BEFORE UPDATE ON public.roadmap_features
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_roadmap_features_block ON public.roadmap_features(block, phase, sort_order);

INSERT INTO public.roadmap_features (block, phase, title, description, status, sort_order) VALUES
  -- AI 媒合功能
  ('ai_matching', 1, '公開官網與供應商展示', '品牌官網、平台介紹、合作供應商展示與供應商詳情頁', 'done', 1),
  ('ai_matching', 1, 'AI 菜單圖片辨識', '上傳菜單照片,Gemini Vision 自動辨識菜色並推算採購食材', 'done', 2),
  ('ai_matching', 1, '對話式需求萃取', '客人用聊天描述需求,AI 自動整理成標準採購清單', 'done', 3),
  ('ai_matching', 1, '結構化食材清單', '品名/數量/單位/分類標準化輸出,可直接轉為採購單', 'done', 4),
  ('ai_matching', 1, '對話自動重新萃取與合併', '對話持續進行時,自動更新並合併食材清單,不漏任何需求', 'done', 5),
  ('ai_matching', 1, 'AI 客服對話機器人', '全天候智慧客服,引導客人講清楚採購需求', 'done', 6),
  ('ai_matching', 3, '供應商自動推薦排序', '依品項、地區與供應能力,自動排序最適合的供應商', 'in_progress', 7),
  ('ai_matching', 3, '媒合信心分數', '每筆媒合附上 AI 信心分數,輔助審核決策', 'planned', 8),
  ('ai_matching', 3, '多供應商比價引擎', '同一食材多家供應商報價自動比較,幫買家省成本', 'planned', 9),
  ('ai_matching', 4, '需求預測與備貨建議', '依歷史訂單預測採購需求,提前給供應商備貨建議', 'planned', 10),
  -- 採購系統
  ('procurement', 1, '分析紀錄後台管理', '所有 AI 分析需求集中列表、狀態分類與追蹤', 'done', 1),
  ('procurement', 1, '需求審核流程', '管理員審核 AI 分析結果,一鍵批准發送或拒絕', 'done', 2),
  ('procurement', 1, '完整對話紀錄檢視', '聊天室式圖文穿插紀錄,圖片燈箱放大檢視', 'done', 3),
  ('procurement', 1, '買家聯絡資訊管理', '訂單與分析詳情整合買家聯絡方式,方便跟進', 'done', 4),
  ('procurement', 2, '供應商訂單建立與發送', '審核通過即自動建立訂單並推送給對應供應商', 'done', 5),
  ('procurement', 2, '訂單列表/明細/搜尋', '訂單全生命週期管理,支援搜尋與明細檢視', 'done', 6),
  ('procurement', 3, '線上報價回覆', '供應商線上回報價格,買家即時比較確認', 'in_progress', 7),
  ('procurement', 3, '下單與付款金流', '線上下單、金流串接與交易保障', 'planned', 8),
  ('procurement', 4, '對帳與電子發票', '自動對帳結算、電子發票開立', 'planned', 9),
  ('procurement', 4, '營運數據儀表板', 'GMV、媒合率、回購率等核心指標即時儀表板', 'planned', 10),
  -- 供應商系統
  ('supplier_portal', 1, 'Email＋密碼會員認證', '安全的帳號註冊、登入與權限控管', 'done', 1),
  ('supplier_portal', 1, '角色導向登入', '管理員/供應商登入後自動導向各自專屬後台', 'done', 2),
  ('supplier_portal', 2, '供應商接單列表', '供應商專屬入口,即時查看平台派發的新訂單', 'done', 3),
  ('supplier_portal', 2, '確認出貨流程', '一鍵確認出貨並回報平台,流程透明', 'done', 4),
  ('supplier_portal', 2, '出貨紀錄查詢', '歷史出貨紀錄與追蹤資訊完整保存', 'done', 5),
  ('supplier_portal', 3, '供應商商品目錄管理', '供應商自主上架、管理商品品項與價格', 'in_progress', 6),
  ('supplier_portal', 3, '物流追蹤', '出貨後物流狀態即時追蹤與異常提醒', 'planned', 7),
  ('supplier_portal', 4, 'LINE 即時通知', '新訂單、出貨提醒即時 LINE 推播', 'planned', 8),
  ('supplier_portal', 4, '供應商評價系統', '買家評價供應商,建立平台信任機制', 'planned', 9);
