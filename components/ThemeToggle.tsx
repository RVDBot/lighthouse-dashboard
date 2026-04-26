'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = (typeof window !== 'undefined' ? localStorage.getItem('theme') : null) as Theme | null
    if (stored === 'light' || stored === 'dark') setTheme(stored)
    else {
      const attr = document.documentElement.getAttribute('data-theme') as Theme | null
      if (attr === 'light' || attr === 'dark') setTheme(attr)
    }
  }, [])

  function set(next: Theme) {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch { /* private mode etc */ }
  }

  const baseBtn = 'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors'
  const active = 'bg-accent text-white border-accent'
  const inactive = 'bg-surface-2 text-text-secondary border-border hover:text-text-primary'

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-3">
      <div className="flex gap-2">
        <button onClick={() => set('dark')} className={`${baseBtn} ${theme === 'dark' ? active : inactive}`}>
          <Moon className="w-4 h-4" /> Donker
        </button>
        <button onClick={() => set('light')} className={`${baseBtn} ${theme === 'light' ? active : inactive}`}>
          <Sun className="w-4 h-4" /> Licht
        </button>
      </div>
    </div>
  )
}
