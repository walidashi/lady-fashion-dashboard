-- Lady Fashion Dashboard — Supabase Schema
-- Run this in your Supabase SQL Editor

-- ─── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role      TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Shipping Companies ────────────────────────────────────────────────────────
CREATE TABLE public.shipping_companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.shipping_companies (name) VALUES
  ('Bosta - بوسطة'),
  ('Aramex - أرامكس'),
  ('Egypt Post - البريد المصري'),
  ('Mylerz - مايلرز'),
  ('Vhubs - فيهابس'),
  ('J&T Express'),
  ('DHL');

-- ─── Orders ───────────────────────────────────────────────────────────────────
CREATE TABLE public.orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         TEXT UNIQUE NOT NULL,
  customer_name        TEXT NOT NULL,
  mobile               TEXT NOT NULL,
  address              TEXT NOT NULL,
  products             TEXT NOT NULL,
  products_total       NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_cost        NUMERIC(10,2) NOT NULL DEFAULT 75,
  total                NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining            NUMERIC(10,2) NOT NULL DEFAULT 0,
  items_count          INTEGER NOT NULL DEFAULT 1,
  notes                TEXT DEFAULT '-',
  payment_method       TEXT NOT NULL DEFAULT 'الدفع عند الاستلام',
  status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','preparing','shipped','delivered','cancelled')),
  estimated_delivery   DATE,
  shipping_company_id  UUID REFERENCES public.shipping_companies(id),
  shipping_company_name TEXT,
  source               TEXT DEFAULT 'اورجانيك',
  order_type           TEXT NOT NULL DEFAULT 'تسليم' CHECK (order_type IN ('تسليم', 'استرجاع', 'استبدال')),
  returned_products    TEXT,
  returned_products_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by           UUID REFERENCES auth.users(id),
  created_by_name      TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_companies ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admin reads all profiles" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "admin updates profiles" ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Orders
CREATE POLICY "employees see own orders" ON public.orders FOR SELECT
  USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "employees insert orders" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "admins update orders" ON public.orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Shipping companies (all authenticated users can read)
CREATE POLICY "read shipping companies" ON public.shipping_companies FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "admins manage shipping companies" ON public.shipping_companies FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
