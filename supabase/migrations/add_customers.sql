-- Customers database: one row per phone number, kept in sync with orders by
-- triggers so every write path (employee form, Shopify webhook, Excel import,
-- bulk status changes, undo) updates customer stats without app code.
-- Safe to re-run.

BEGIN;

-- ─── Phone normalization ─────────────────────────────────────────────────────
-- Collapses 01095100407 / +201095100407 / 00201095100407 / ٠١٠٩٥١٠٠٤٠٧ into
-- the local 11-digit form. Returns NULL for anything too short to be a phone.
CREATE OR REPLACE FUNCTION public.normalize_phone(raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  d := translate(raw, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '\D', '', 'g');
  IF d LIKE '0020%' THEN
    d := substr(d, 5);
  ELSIF d LIKE '20%' AND length(d) = 12 THEN
    d := substr(d, 3);
  END IF;
  IF length(d) = 10 AND d LIKE '1%' THEN d := '0' || d; END IF;
  IF length(d) < 10 THEN RETURN NULL; END IF;
  RETURN d;
END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  phone            TEXT PRIMARY KEY,
  name             TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  total_orders     INTEGER NOT NULL DEFAULT 0,
  delivered_count  INTEGER NOT NULL DEFAULT 0,
  returned_count   INTEGER NOT NULL DEFAULT 0,
  cancelled_count  INTEGER NOT NULL DEFAULT 0,
  total_spent      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- value of delivered orders
  first_order_at   TIMESTAMPTZ,
  last_order_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
CREATE INDEX IF NOT EXISTS orders_customer_phone_idx ON public.orders (customer_phone);

-- ─── Recompute one customer from their orders ────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_customer(p_phone TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_phone IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE customer_phone = p_phone) THEN
    DELETE FROM customers WHERE phone = p_phone;
    RETURN;
  END IF;

  INSERT INTO customers AS c (
    phone, name, address, total_orders, delivered_count, returned_count,
    cancelled_count, total_spent, first_order_at, last_order_at, updated_at
  )
  SELECT
    p_phone, latest.customer_name, latest.address,
    agg.total_orders, agg.delivered, agg.returned, agg.cancelled,
    agg.spent, agg.first_at, agg.last_at, NOW()
  FROM (
    SELECT
      COUNT(*)                                            AS total_orders,
      COUNT(*) FILTER (WHERE status = 'delivered')        AS delivered,
      COUNT(*) FILTER (WHERE status = 'returned')         AS returned,
      COUNT(*) FILTER (WHERE status = 'cancelled')        AS cancelled,
      COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) AS spent,
      MIN(created_at)                                     AS first_at,
      MAX(created_at)                                     AS last_at
    FROM orders WHERE customer_phone = p_phone
  ) agg
  CROSS JOIN LATERAL (
    SELECT customer_name, address FROM orders
    WHERE customer_phone = p_phone
    ORDER BY created_at DESC LIMIT 1
  ) latest
  ON CONFLICT (phone) DO UPDATE SET
    name            = EXCLUDED.name,
    address         = EXCLUDED.address,
    total_orders    = EXCLUDED.total_orders,
    delivered_count = EXCLUDED.delivered_count,
    returned_count  = EXCLUDED.returned_count,
    cancelled_count = EXCLUDED.cancelled_count,
    total_spent     = EXCLUDED.total_spent,
    first_order_at  = EXCLUDED.first_order_at,
    last_order_at   = EXCLUDED.last_order_at,
    updated_at      = NOW();
END $$;

REVOKE EXECUTE ON FUNCTION public.refresh_customer(TEXT) FROM PUBLIC, anon, authenticated;

-- ─── Backfill existing orders ────────────────────────────────────────────────
-- Skip the updated_at trigger so backfilling doesn't touch every order's timestamp.
ALTER TABLE public.orders DISABLE TRIGGER orders_updated_at;
UPDATE public.orders SET customer_phone = public.normalize_phone(mobile);
ALTER TABLE public.orders ENABLE TRIGGER orders_updated_at;

SELECT public.refresh_customer(p)
FROM (SELECT DISTINCT customer_phone AS p FROM public.orders WHERE customer_phone IS NOT NULL) s;

-- ─── Triggers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orders_set_customer_phone()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.customer_phone := normalize_phone(NEW.mobile);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_customer_phone ON public.orders;
CREATE TRIGGER orders_customer_phone
  BEFORE INSERT OR UPDATE OF mobile ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_customer_phone();

CREATE OR REPLACE FUNCTION public.orders_sync_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM refresh_customer(NEW.customer_phone);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM refresh_customer(OLD.customer_phone);
  ELSE
    PERFORM refresh_customer(NEW.customer_phone);
    IF OLD.customer_phone IS DISTINCT FROM NEW.customer_phone THEN
      PERFORM refresh_customer(OLD.customer_phone);
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS orders_sync_customer ON public.orders;
CREATE TRIGGER orders_sync_customer
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_sync_customer();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Everyone signed in can look customers up (employees need it on the order
-- form); only the triggers above write to the table.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read customers" ON public.customers;
CREATE POLICY "authenticated read customers" ON public.customers
  FOR SELECT USING (auth.role() = 'authenticated');

COMMIT;
