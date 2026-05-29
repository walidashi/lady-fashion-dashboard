'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import Image from 'next/image'
import Sidebar from './Sidebar'
import { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  profile: Profile
  children: React.ReactNode
}

export default function DashboardShell({ profile, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f5f4f2]">
      {/* Mobile top bar */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[#111111] flex items-center justify-between px-4"
        style={{ borderBottom: '1px solid #1e1e1e' }}
      >
        <Image
          src="/logo.webp"
          alt="Lady Fashion"
          width={100}
          height={32}
          className="h-8 w-auto object-contain brightness-0 invert"
          priority
        />
        <button
          onClick={() => setOpen(true)}
          className="text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
          aria-label="فتح القائمة"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      <div className="flex min-h-screen">
        {/* Backdrop */}
        {open && (
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Sidebar — fixed overlay on mobile, static in flow on desktop */}
        <div
          className={cn(
            'fixed inset-y-0 right-0 z-50 transition-transform duration-300',
            'md:static md:inset-auto md:z-auto md:transition-none md:translate-x-0',
            open ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <Sidebar profile={profile} onClose={() => setOpen(false)} />
        </div>

        {/* Main content */}
        <main className="flex-1 pt-14 md:pt-0 p-4 md:p-6 overflow-auto min-h-screen w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
