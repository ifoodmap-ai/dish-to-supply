-- Core supply matching schema for dish-to-supply

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt()->'app_metadata'->>'role', '') = 'admin';
$$;

CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  website_url TEXT,
  address TEXT,
  service_areas TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.supplies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  sku TEXT,
  unit TEXT,
  pack_size TEXT,
  price NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.dishes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  cuisine TEXT,
  description TEXT,
  serving_size TEXT,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.dish_supplies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  supply_id UUID NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
  quantity NUMERIC(12, 3),
  unit TEXT,
  notes TEXT,
  confidence_score NUMERIC(5, 4) CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (dish_id, supply_id)
);

CREATE TABLE public.menu_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'parsed', 'matched', 'failed')),
  parsed_menu JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.match_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  menu_upload_id UUID REFERENCES public.menu_uploads(id) ON DELETE CASCADE,
  dish_id UUID REFERENCES public.dishes(id) ON DELETE SET NULL,
  dish_name TEXT NOT NULL,
  matched_supplies JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'accepted', 'rejected')),
  confidence_score NUMERIC(5, 4) CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view suppliers"
ON public.suppliers
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage suppliers"
ON public.suppliers
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view supplies"
ON public.supplies
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage supplies"
ON public.supplies
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view dishes"
ON public.dishes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage dishes"
ON public.dishes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view dish supplies"
ON public.dish_supplies
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage dish supplies"
ON public.dish_supplies
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can view their own menu uploads"
ON public.menu_uploads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own menu uploads"
ON public.menu_uploads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own menu uploads"
ON public.menu_uploads
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own menu uploads"
ON public.menu_uploads
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage menu uploads"
ON public.menu_uploads
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can view their own match results"
ON public.match_results
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own match results"
ON public.match_results
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    menu_upload_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.menu_uploads
      WHERE menu_uploads.id = match_results.menu_upload_id
        AND menu_uploads.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update their own match results"
ON public.match_results
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    menu_upload_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.menu_uploads
      WHERE menu_uploads.id = match_results.menu_upload_id
        AND menu_uploads.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete their own match results"
ON public.match_results
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage match results"
ON public.match_results
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_supplies_updated_at
BEFORE UPDATE ON public.supplies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dishes_updated_at
BEFORE UPDATE ON public.dishes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dish_supplies_updated_at
BEFORE UPDATE ON public.dish_supplies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_uploads_updated_at
BEFORE UPDATE ON public.menu_uploads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_match_results_updated_at
BEFORE UPDATE ON public.match_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_suppliers_name ON public.suppliers(name);
CREATE INDEX idx_suppliers_is_active ON public.suppliers(is_active);
CREATE INDEX idx_suppliers_created_by ON public.suppliers(created_by);
CREATE INDEX idx_suppliers_service_areas ON public.suppliers USING GIN(service_areas);
CREATE INDEX idx_supplies_supplier_id ON public.supplies(supplier_id);
CREATE INDEX idx_supplies_name ON public.supplies(name);
CREATE INDEX idx_supplies_category ON public.supplies(category);
CREATE INDEX idx_supplies_is_available ON public.supplies(is_available);
CREATE INDEX idx_supplies_created_by ON public.supplies(created_by);
CREATE INDEX idx_supplies_attributes ON public.supplies USING GIN(attributes);
CREATE INDEX idx_dishes_name ON public.dishes(name);
CREATE INDEX idx_dishes_category ON public.dishes(category);
CREATE INDEX idx_dishes_created_by ON public.dishes(created_by);
CREATE INDEX idx_dishes_tags ON public.dishes USING GIN(tags);
CREATE INDEX idx_dishes_ingredients ON public.dishes USING GIN(ingredients);
CREATE INDEX idx_dish_supplies_dish_id ON public.dish_supplies(dish_id);
CREATE INDEX idx_dish_supplies_supply_id ON public.dish_supplies(supply_id);
CREATE INDEX idx_menu_uploads_user_id ON public.menu_uploads(user_id);
CREATE INDEX idx_menu_uploads_status ON public.menu_uploads(status);
CREATE INDEX idx_menu_uploads_created_at ON public.menu_uploads(created_at DESC);
CREATE INDEX idx_menu_uploads_parsed_menu ON public.menu_uploads USING GIN(parsed_menu);
CREATE INDEX idx_match_results_user_id ON public.match_results(user_id);
CREATE INDEX idx_match_results_menu_upload_id ON public.match_results(menu_upload_id);
CREATE INDEX idx_match_results_dish_id ON public.match_results(dish_id);
CREATE INDEX idx_match_results_status ON public.match_results(status);
CREATE INDEX idx_match_results_created_at ON public.match_results(created_at DESC);
CREATE INDEX idx_match_results_matched_supplies ON public.match_results USING GIN(matched_supplies);
