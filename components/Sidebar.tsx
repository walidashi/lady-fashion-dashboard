'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useMemo } from 'react'
import { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Package, Plus, LogOut, LayoutDashboard, Settings } from 'lucide-react'
import Image from 'next/image'

interface Props {
  profile: Profile
  onClose?: () => void
}

const employeeLinks = [
  { href: '/dashboard/employee', icon: Package, label: 'طلباتي', exact: true },
  { href: '/dashboard/employee/new-order', icon: Plus, label: 'إضافة طلب', exact: false },
]

const adminLinks = [
  { href: '/dashboard/admin', icon: LayoutDashboard, label: 'جميع الطلبات', exact: true },
  { href: '/dashboard/employee/new-order', icon: Plus, label: 'إضافة طلب', exact: false },
  { href: '/dashboard/admin/settings', icon: Settings, label: 'الإعدادات', exact: false },
]

export default function Sidebar({ profile, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const links = profile.role === 'admin' ? adminLinks : employeeLinks

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <aside className="w-60 bg-[#111111] flex flex-col min-h-screen border-l border-[#1e1e1e]">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-[#1e1e1e]">
        <Image
          src="/logo.webp"
          alt="Lady Fashion"
          width={120}
          height={40}
          className="h-10 w-auto object-contain brightness-0 invert"
          priority
        />
        <p className="text-xs text-[#6b6b6b] mt-1.5">
          {profile.role === 'admin' ? 'مدير النظام' : 'موظف'}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {links.map(({ href, icon: Icon, label, exact }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive(href, exact)
                ? 'bg-pink-700 text-white'
                : 'text-[#888] hover:bg-[#1e1e1e] hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-[#1e1e1e]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 bg-pink-700 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">
              {profile.full_name?.[0] ?? '؟'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile.full_name}</p>
            <p className="text-xs text-[#6b6b6b]">
              {profile.role === 'admin' ? 'أدمن' : 'موظف'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-[#6b6b6b] hover:text-red-400 transition-colors w-full py-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
