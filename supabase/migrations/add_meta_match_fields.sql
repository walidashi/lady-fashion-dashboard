-- Extra customer fields used to improve Meta match quality.
-- Run in the Supabase SQL Editor. Safe to re-run.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_city  TEXT;
