'use client'

import Link from 'next/link'
import { Settings, LogOut } from 'lucide-react'

export function Header({ title, right }: { title: string; right?: React.ReactNode }) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <Link href="/" className="text-text-primary font-medium">{title}</Link>
      <div className="flex items-center gap-3">
        {right}
        <Link href="/settings" aria-label="Settings" className="text-text-tertiary hover:text-text-primary">
          <Settings className="w-5 h-5" />
        </Link>
        <button onClick={logout} aria-label="Logout" className="text-text-tertiary hover:text-text-primary">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
