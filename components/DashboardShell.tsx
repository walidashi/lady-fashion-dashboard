'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import Image from 'next/image'
import Sidebar from './Sidebar'
import { Profile } from '@/lib/types'

interface Props {
  profile: Profile
  children: React.ReactNode
}

export default function DashboardShell({ profile, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#f5f4f2]">

      {/* ── Desktop sidebar — always in flow ── */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar profile={profile} />
      </div>

      {/* ── Mobile: top bar + slide-in drawer ── */}
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

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 md:hidden">
            <Sidebar profile={profile} onClose={() => setOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 p-4 md:p-6 overflow-auto min-h-screen">
        {children}
      </main>

    </div>
  )
}
