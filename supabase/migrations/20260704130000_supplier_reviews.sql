-- Feature: 供應商評價系統 (Supplier reviews / ratings)
-- Public read (shown on supplier profile); authenticated buyers add their own
-- review; admins manage. Applied to live DB via Management API.

CREATE TABLE IF NOT EXISTS public.supplier_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_ref INT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  reviewer_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view supplier reviews"
ON public.supplier_reviews FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Authenticated can add own review"
ON public.supplier_reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage supplier reviews"
ON public.supplier_reviews FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_supplier_reviews_ref ON public.supplier_reviews(supplier_ref);
