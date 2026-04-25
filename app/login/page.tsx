'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setBusy(false)
    if (res.ok) router.push('/')
    else setError('Wachtwoord onjuist')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 bg-surface-1 p-6 rounded-xl border border-border">
        <h1 className="text-lg font-medium">Lighthouse Dashboard</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-surface-2 text-text-primary px-3 py-2 rounded-lg outline-none border border-border focus:border-accent"
          placeholder="Wachtwoord"
        />
        {error && <p className="text-bad text-sm">{error}</p>}
        <button
          disabled={busy || !password}
          className="w-full bg-accent hover:bg-accent-hover text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Inloggen'}
        </button>
      </form>
    </main>
  )
}
