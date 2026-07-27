-- Transaction records are private to the restaurant and supplier on the
-- related order. The original policies allowed every authenticated account to
-- read every row, which is unsafe now that restaurants can self-register.

DROP POLICY IF EXISTS "view quotes" ON public.order_quotes;
DROP POLICY IF EXISTS "view payments" ON public.order_payments;
DROP POLICY IF EXISTS "view invoices" ON public.invoices;
DROP POLICY IF EXISTS "view notifications" ON public.notifications;

-- A foreign key does not create an index in Postgres. These indexes keep the
-- order lookup used by each RLS predicate bounded as the tables grow.
CREATE INDEX IF NOT EXISTS idx_order_quotes_order
  ON public.order_quotes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_quotes_supplier
  ON public.order_quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order
  ON public.order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order
  ON public.invoices(order_id);

CREATE POLICY "transaction parties read order_quotes"
ON public.order_quotes
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.supplier_orders o
    WHERE o.id = order_quotes.order_id
      AND (
        o.restaurant_id IN (SELECT public.current_restaurant_ids())
        OR o.supplier_id IN (SELECT public.current_supplier_ids())
      )
  )
);

CREATE POLICY "transaction parties read order_payments"
ON public.order_payments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.supplier_orders o
    WHERE o.id = order_payments.order_id
      AND (
        o.restaurant_id IN (SELECT public.current_restaurant_ids())
        OR o.supplier_id IN (SELECT public.current_supplier_ids())
      )
  )
);

CREATE POLICY "transaction parties read invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.supplier_orders o
    WHERE o.id = invoices.order_id
      AND (
        o.restaurant_id IN (SELECT public.current_restaurant_ids())
        OR o.supplier_id IN (SELECT public.current_supplier_ids())
      )
  )
);

-- notifications.recipient is free-form display text, not an auth user/order
-- foreign key. It cannot safely authorize tenant reads, so notifications stay
-- admin-only until a trusted recipient_user_id or order_id is introduced.
CREATE POLICY "notifications admin read"
ON public.notifications
FOR SELECT
TO authenticated
USING (public.is_admin());

-- The old quote policy checked only a caller-controlled supplier_id. Bind
-- quote writes to an active supplier account and an order assigned to exactly
-- that supplier, preventing cross-tenant quote attachment.
DROP POLICY IF EXISTS "supplier manage own quotes" ON public.order_quotes;
CREATE POLICY "supplier manage own quotes"
ON public.order_quotes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.supplier_accounts sa
    JOIN public.supplier_orders o
      ON o.id = order_quotes.order_id
     AND o.supplier_id = order_quotes.supplier_id
    WHERE sa.user_id = (SELECT auth.uid())
      AND sa.is_active
      AND sa.supplier_id = order_quotes.supplier_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.supplier_accounts sa
    JOIN public.supplier_orders o
      ON o.id = order_quotes.order_id
     AND o.supplier_id = order_quotes.supplier_id
    WHERE sa.user_id = (SELECT auth.uid())
      AND sa.is_active
      AND sa.supplier_id = order_quotes.supplier_id
  )
);

-- RLS remains the row-level control for authenticated users. Explicitly remove
-- any direct table privileges inherited by unauthenticated roles.
REVOKE ALL ON TABLE public.order_quotes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.order_payments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.invoices FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon;
