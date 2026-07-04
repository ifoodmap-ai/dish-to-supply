-- Features: 線上報價回覆 / 下單付款金流(demo) / 對帳與電子發票(demo) / LINE 即時通知(demo)
-- New tables backing the supplier-transaction & ops features. Applied to live DB
-- via Management API. Demo/sandbox tables (payments/invoices/notifications) are
-- not wired to real gateways yet — they persist simulated records for the UI.

-- 線上報價
CREATE TABLE IF NOT EXISTS public.order_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  supplier_id UUID,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view quotes" ON public.order_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "supplier manage own quotes" ON public.order_quotes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_accounts sa WHERE sa.user_id=auth.uid() AND sa.is_active AND sa.supplier_id=order_quotes.supplier_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.supplier_accounts sa WHERE sa.user_id=auth.uid() AND sa.is_active AND sa.supplier_id=order_quotes.supplier_id));
CREATE POLICY "admin manage quotes" ON public.order_quotes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 金流(demo)
CREATE TABLE IF NOT EXISTS public.order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'credit_card' CHECK (method IN ('credit_card','atm','cvs')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  transaction_no TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view payments" ON public.order_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage payments" ON public.order_payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 電子發票(demo)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  invoice_number TEXT,
  buyer_name TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage invoices" ON public.invoices FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 通知(LINE demo)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT,
  channel TEXT NOT NULL DEFAULT 'line' CHECK (channel IN ('line','email','sms')),
  title TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view notifications" ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
