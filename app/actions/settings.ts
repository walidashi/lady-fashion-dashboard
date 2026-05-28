'use server'

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function createEmployee(payload: {
  full_name: string
  email: string
  password: string
  role: 'employee' | 'admin'
}) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'غير مصرح' }

  const supabase = adminClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { full_name: payload.full_name, role: payload.role },
  })

  if (error) {
    if (error.message.includes('already been registered') || error.code === 'email_exists') {
      return { error: 'هذا البريد الإلكتروني مسجل مسبقاً' }
    }
    return { error: error.message }
  }

  // Upsert profile row in case trigger didn't fire
  await supabase.from('profiles').upsert({
    id: data.user.id,
    full_name: payload.full_name,
    role: payload.role,
  })

  revalidatePath('/dashboard/admin/settings')
  return { success: true }
}

export async function updateUserRole(userId: string, role: 'employee' | 'admin') {
  const admin = await requireAdmin()
  if (!admin) return { error: 'غير مصرح' }

  const supabase = adminClient()

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  })

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin/settings')
  return { success: true }
}

export async function deleteUser(userId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'غير مصرح' }
  if (userId === admin.id) return { error: 'لا يمكنك حذف حسابك الحالي' }

  const supabase = adminClient()
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/settings')
  return { success: true }
}

// ─── Shipping Companies ───────────────────────────────────────────────────────

export async function addShippingCompany(name: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'غير مصرح' }

  const supabase = await createClient()
  const { error } = await supabase.from('shipping_companies').insert({ name })

  if (error) {
    if (error.code === '23505') return { error: 'هذه الشركة موجودة مسبقاً' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/admin/settings')
  return { success: true }
}

export async function deleteShippingCompany(id: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: 'غير مصرح' }

  const supabase = await createClient()
  const { error } = await supabase.from('shipping_companies').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin/settings')
  return { success: true }
}
