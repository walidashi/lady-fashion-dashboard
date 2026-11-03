-- Let employees see all orders (not just their own), so they can confirm
-- Shopify orders too. Writes stay admin-only; employees still change status
-- only through the server (confirmOrder). Run in the Supabase SQL Editor.
-- Safe to re-run.

-- Orders: any employee or admin can read every order
DROP POLICY IF EXISTS "employees see own orders" ON public.orders;
DROP POLICY IF EXISTS "staff read all orders" ON public.orders;
CREATE POLICY "staff read all orders" ON public.orders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'employee')
  ));

-- Status history shown in each order's details: same visibility as orders
DROP POLICY IF EXISTS "employees read own order logs" ON public.order_status_logs;
DROP POLICY IF EXISTS "staff read all order logs" ON public.order_status_logs;
CREATE POLICY "staff read all order logs" ON public.order_status_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'employee')
  ));
