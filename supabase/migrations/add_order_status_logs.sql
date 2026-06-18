-- Run this in your Supabase SQL Editor

CREATE TABLE public.order_status_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number     TEXT NOT NULL DEFAULT '',
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  changed_by       UUID REFERENCES auth.users(id),
  changed_by_name  TEXT NOT NULL DEFAULT '',
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX order_status_logs_order_id_idx  ON public.order_status_logs(order_id);
CREATE INDEX order_status_logs_created_at_idx ON public.order_status_logs(created_at DESC);

ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;

-- Admins read all logs
CREATE POLICY "admins read logs" ON public.order_status_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Employees read logs for orders they created
CREATE POLICY "employees read own order logs" ON public.order_status_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders WHERE id = order_id AND created_by = auth.uid()
    )
  );
