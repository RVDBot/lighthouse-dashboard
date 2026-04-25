'use client'

import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'

export function ScanNowButton() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function start() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/scans', { method: 'POST' })
    if (r.ok) {
      setMsg('Scan gestart — kan 5–10 minuten duren')
    } else {
      const j = await r.json().catch(() => ({}))
      setMsg(j.error ?? 'Kon scan niet starten')
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={start} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        Scan nu
      </button>
      {msg && <span className="text-xs text-text-tertiary">{msg}</span>}
    </div>
  )
}
