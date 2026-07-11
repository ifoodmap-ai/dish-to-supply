-- Seed-sprint loop features: 供應商自助入駐申請 / 內建 analytics / 評價遷移真實供應商
-- Applied to live DB via Management API. (主 app 買家聯絡擷取重用既有 landing_leads 表,
-- 帶 analysis_id + source='app';admin 顯示邏輯 fe92528 已存在,無需改表。)

-- 供應商自助入駐申請
CREATE TABLE IF NOT EXISTS public.supplier_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_line TEXT,
  categories TEXT,
  service_areas TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon submit application" ON public.supplier_applications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin manage applications" ON public.supplier_applications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 內建 analytics 事件(anon insert-only;admin 讀)
CREATE TABLE IF NOT EXISTS public.app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert events" ON public.app_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin read events" ON public.app_events FOR SELECT TO authenticated USING (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_app_events_event_time ON public.app_events(event, created_at DESC);

-- 供應商評價:從 mock int ref 遷移到真實 suppliers uuid
ALTER TABLE public.supplier_reviews ADD COLUMN IF NOT EXISTS supplier_id UUID;
-- (live 已執行:ref 1/2/3 → 鮮綠農產供應商/頂鮮肉品行/陽光蔬果批發)
