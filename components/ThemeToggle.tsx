'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'

const ONE_YEAR_S = 365 * 24 * 60 * 60

function readThemeCookie(): Theme | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)lh_theme=(light|dark)/)
  return m ? (m[1] as Theme) : null
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    // Cookie is the source of truth (server reads it on the next render);
    // localStorage and the data-theme attribute are kept in sync as fallbacks.
    const fromCookie = readThemeCookie()
    if (fromCookie) {
      setTheme(fromCookie)
      return
    }
    const fromStorage = (typeof window !== 'undefined' ? localStorage.getItem('theme') : null) as Theme | null
    if (fromStorage === 'light' || fromStorage === 'dark') setTheme(fromStorage)
    else {
      const attr = document.documentElement.getAttribute('data-theme') as Theme | null
      if (attr === 'light' || attr === 'dark') setTheme(attr)
    }
  }, [])

  function set(next: Theme) {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch { /* private mode etc */ }
    // Cookie is what the server reads on the next page load; max-age = 1y.
    document.cookie = `lh_theme=${next}; path=/; max-age=${ONE_YEAR_S}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
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
