-- Shopify + Meta sync. Run this in the Supabase SQL Editor.
-- Safe to re-run.

-- ── 1. Link orders to Shopify, record when they resolved ────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopify_order_gid     TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopify_order_name    TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopify_customer_gid  TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at          TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refused_at            TIMESTAMPTZ;

-- One dashboard order per Shopify order. Also stops Shopify webhook retries
-- from creating duplicate dashboard orders.
CREATE UNIQUE INDEX IF NOT EXISTS orders_shopify_order_gid_key
  ON public.orders(shopify_order_gid) WHERE shopify_order_gid IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_refused_at_idx   ON public.orders(refused_at);
CREATE INDEX IF NOT EXISTS orders_delivered_at_idx ON public.orders(delivered_at);

-- Fill the new timestamps for orders that are already delivered / returned,
-- from the status log where possible.
UPDATE public.orders o SET delivered_at = COALESCE(
  (SELECT MAX(l.created_at) FROM public.order_status_logs l
    WHERE l.order_id = o.id AND l.to_status = 'delivered'),
  o.updated_at)
WHERE o.status = 'delivered' AND o.delivered_at IS NULL;

UPDATE public.orders o SET refused_at = COALESCE(
  (SELECT MAX(l.created_at) FROM public.order_status_logs l
    WHERE l.order_id = o.id AND l.to_status = 'returned'),
  o.updated_at)
WHERE o.status = 'returned' AND o.refused_at IS NULL;

-- ── 2. Per-order sync state ─────────────────────────────────────────────────
-- One row per (order, target). The unique key is what makes every sync
-- idempotent: a 'done' row is never run again.
CREATE TABLE IF NOT EXISTS public.order_sync (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  target      TEXT NOT NULL CHECK (target IN ('shopify_deliver', 'shopify_cancel', 'meta_delivered')),
  state       TEXT NOT NULL DEFAULT 'pending'
              CHECK (state IN ('pending', 'running', 'done', 'error', 'skipped', 'dry_run', 'test')),
  message     TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, target)
);
CREATE INDEX IF NOT EXISTS order_sync_state_idx ON public.order_sync(state);

-- Atomically claims a sync row for one run. Returns false if it is already
-- done, or another run is in flight (a 'running' row older than 2 minutes is
-- treated as crashed and can be reclaimed).
CREATE OR REPLACE FUNCTION public.claim_order_sync(p_order_id UUID, p_target TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.order_sync(order_id, target) VALUES (p_order_id, p_target)
  ON CONFLICT (order_id, target) DO NOTHING;

  UPDATE public.order_sync
     SET state = 'running', attempts = attempts + 1, updated_at = NOW()
   WHERE order_id = p_order_id AND target = p_target
     AND state <> 'done'
     AND (state <> 'running' OR updated_at < NOW() - INTERVAL '2 minutes');

  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_order_sync(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_sync(UUID, TEXT) TO service_role;

-- ── 3. API call log (no tokens, phones masked) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number TEXT,
  target      TEXT NOT NULL,
  action      TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  dry_run     BOOLEAN NOT NULL DEFAULT false,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS integration_logs_created_at_idx ON public.integration_logs(created_at DESC);

-- ── 4. Runtime settings (dry run) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Dry run starts ON: nothing reaches Shopify or Meta until you switch it off.
INSERT INTO public.app_settings(key, value) VALUES ('sync_dry_run', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 5. RLS: admins read; all writes go through the server (service role) ────
ALTER TABLE public.order_sync       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read order_sync" ON public.order_sync;
CREATE POLICY "admins read order_sync" ON public.order_sync FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admins read integration_logs" ON public.integration_logs;
CREATE POLICY "admins read integration_logs" ON public.integration_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admins read app_settings" ON public.app_settings;
CREATE POLICY "admins read app_settings" ON public.app_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
