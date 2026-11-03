-- Adds the 'confirmed' (مؤكد) status between 'new' and 'preparing'.
-- Run in the Supabase SQL Editor. Safe to re-run.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new','confirmed','preparing','ready','shipped','returned','delivered','cancelled'));
