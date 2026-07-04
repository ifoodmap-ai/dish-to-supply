-- Feature: 供應商商品目錄管理 (Supplier product catalog self-management)
-- The supplies table already exists (core_supply_schema). This adds an RLS
-- policy so a supplier can manage the products under their own supplier_id
-- (linked via supplier_accounts). Applied to live DB via Management API.

DROP POLICY IF EXISTS "Suppliers manage own supplies" ON public.supplies;

CREATE POLICY "Suppliers manage own supplies"
ON public.supplies
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.supplier_accounts sa
    WHERE sa.user_id = auth.uid()
      AND sa.is_active
      AND sa.supplier_id = supplies.supplier_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.supplier_accounts sa
    WHERE sa.user_id = auth.uid()
      AND sa.is_active
      AND sa.supplier_id = supplies.supplier_id
  )
);
