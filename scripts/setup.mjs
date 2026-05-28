// Lady Fashion — one-time Supabase setup script
// Runs schema + creates admin user

const SUPABASE_URL = 'https://ltvkgscczajcnkkrpwur.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0dmtnc2NjemFqY25ra3Jwd3VyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTk5NjczNiwiZXhwIjoyMDk1NTcyNzM2fQ.za2Ssm8UclPcsJTANfeoRoqlZOhCGFuDQL1oD3gmpiw'
const ADMIN_EMAIL = 'ashiwalid@gmail.com'
const ADMIN_PASSWORD = 'dedo2005'
const ADMIN_NAME = 'Admin'
const PROJECT_REF = 'ltvkgscczajcnkkrpwur'

const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
}

// ─── 1. Run schema via Supabase Management API ────────────────────────────────
async function runSQL(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`)
  return JSON.parse(text)
}

// ─── 2. Create admin user ─────────────────────────────────────────────────────
async function createAdminUser() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: ADMIN_NAME },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    if (data.msg?.includes('already been registered') || data.code === 'email_exists') {
      console.log('ℹ️  User already exists — skipping creation')
      return null
    }
    throw new Error(`Create user failed: ${JSON.stringify(data)}`)
  }
  return data
}

// ─── 3. Manually insert profile row (in case trigger didn't fire) ─────────────
async function upsertProfile(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: userId,
      full_name: ADMIN_NAME,
      role: 'admin',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upsert profile failed: ${text}`)
  }
}

// ─── Schema SQL statements (split into individual steps) ─────────────────────
const schemaSteps = [
  // Profiles table
  `CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Shipping companies table
  `CREATE TABLE IF NOT EXISTS public.shipping_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Seed shipping companies
  `INSERT INTO public.shipping_companies (name) VALUES
    ('Bosta - بوسطة'),('Aramex - أرامكس'),('Egypt Post - البريد المصري'),
    ('Mylerz - مايلرز'),('Vhubs - فيهابس'),('J&T Express'),('DHL')
  ON CONFLICT (name) DO NOTHING`,

  // Orders table
  `CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    address TEXT NOT NULL,
    products TEXT NOT NULL,
    products_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 75,
    total NUMERIC(10,2) GENERATED ALWAYS AS (products_total + shipping_cost) STORED,
    amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
    remaining NUMERIC(10,2) GENERATED ALWAYS AS (products_total + shipping_cost - amount_paid) STORED,
    items_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '-',
    payment_method TEXT NOT NULL DEFAULT 'الدفع عند الاستلام',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','shipped','delivered','cancelled')),
    estimated_delivery DATE,
    shipping_company_id UUID REFERENCES public.shipping_companies(id),
    shipping_company_name TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_by_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // updated_at trigger function
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql`,

  // updated_at trigger
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_updated_at') THEN
      CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END $$`,

  // handle_new_user function
  `CREATE OR REPLACE FUNCTION handle_new_user()
   RETURNS TRIGGER AS $$
   BEGIN
     INSERT INTO public.profiles (id, full_name, role)
     VALUES (
       NEW.id,
       COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
       COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
     )
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql SECURITY DEFINER`,

  // on_auth_user_created trigger
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
      CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
    END IF;
  END $$`,

  // RLS
  `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.shipping_companies ENABLE ROW LEVEL SECURITY`,

  // Profiles policies
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'own profile' AND tablename = 'profiles') THEN
      CREATE POLICY "own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin reads all profiles' AND tablename = 'profiles') THEN
      CREATE POLICY "admin reads all profiles" ON public.profiles FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin updates profiles' AND tablename = 'profiles') THEN
      CREATE POLICY "admin updates profiles" ON public.profiles FOR UPDATE
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
    END IF;
  END $$`,

  // Orders policies
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'employees see own orders' AND tablename = 'orders') THEN
      CREATE POLICY "employees see own orders" ON public.orders FOR SELECT
      USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'employees insert orders' AND tablename = 'orders') THEN
      CREATE POLICY "employees insert orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = created_by);
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admins update orders' AND tablename = 'orders') THEN
      CREATE POLICY "admins update orders" ON public.orders FOR UPDATE
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
  END $$`,

  // Shipping companies policies
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read shipping companies' AND tablename = 'shipping_companies') THEN
      CREATE POLICY "read shipping companies" ON public.shipping_companies FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admins manage shipping companies' AND tablename = 'shipping_companies') THEN
      CREATE POLICY "admins manage shipping companies" ON public.shipping_companies FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
  END $$`,
]

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Setting up Lady Fashion database...\n')

  // Run schema
  for (let i = 0; i < schemaSteps.length; i++) {
    const step = schemaSteps[i]
    const label = step.trim().split('\n')[0].slice(0, 60)
    process.stdout.write(`  [${i + 1}/${schemaSteps.length}] ${label}... `)
    try {
      await runSQL(step)
      console.log('✓')
    } catch (err) {
      console.log('✗')
      console.error(`\n  Error: ${err.message}\n`)
      // Don't abort — some steps may fail if already exists
    }
  }

  console.log('\n👤 Creating admin user...')
  let userId
  try {
    const user = await createAdminUser()
    if (user) {
      userId = user.id
      console.log(`  ✓ Created user: ${user.email} (${userId})`)
    } else {
      // User exists — look them up
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(ADMIN_EMAIL)}`, {
        headers
      })
      const data = await res.json()
      userId = data.users?.[0]?.id
      if (userId) console.log(`  ✓ Found existing user: ${ADMIN_EMAIL} (${userId})`)
    }
  } catch (err) {
    console.error(`  ✗ ${err.message}`)
  }

  if (userId) {
    console.log('\n🏷️  Setting admin role in profiles...')
    try {
      await upsertProfile(userId)
      console.log('  ✓ Profile set to role: admin')
    } catch (err) {
      console.error(`  ✗ ${err.message}`)
    }
  }

  console.log('\n✅ Done! You can now log in at http://localhost:3000')
  console.log(`   Email:    ${ADMIN_EMAIL}`)
  console.log(`   Password: ${ADMIN_PASSWORD}`)
}

main().catch(console.error)
