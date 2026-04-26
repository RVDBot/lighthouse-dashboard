'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Loader2 } from 'lucide-react'

type Progress = { total: number; done: number; failed: number }

type StreamEvent =
  | { type: 'started'; scanId: number; total: number }
  | { type: 'url-done'; scanId: number; ok: boolean }
  | { type: 'finished'; scanId: number; ok: number; failed: number }
  | { type: 'failed'; scanId: number; error: string }

export function ScanNowButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const msgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeStream = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  const attachStream = useCallback(() => {
    if (esRef.current) return
    const es = new EventSource('/api/scans/stream')
    esRef.current = es

    es.onmessage = (ev) => {
      let data: StreamEvent
      try { data = JSON.parse(ev.data) as StreamEvent } catch { return }

      if (data.type === 'started') {
        setProgress({ total: data.total, done: 0, failed: 0 })
      } else if (data.type === 'url-done') {
        setProgress(p => p ? { ...p, done: p.done + 1, failed: p.failed + (data.ok ? 0 : 1) } : p)
      } else if (data.type === 'finished') {
        setBusy(false)
        setProgress(null)
        setMsg(`Klaar: ${data.ok} OK${data.failed ? `, ${data.failed} failed` : ''}`)
        closeStream()
        router.refresh()
        if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current)
        msgTimeoutRef.current = setTimeout(() => setMsg(null), 8000)
      } else if (data.type === 'failed') {
        setBusy(false)
        setProgress(null)
        setMsg(`Fout: ${data.error}`)
        closeStream()
      }
    }

    es.onerror = () => {
      // Don't drop busy here — server may still be running. The next page load
      // will reconcile via the GET /api/scans poll on mount.
    }
  }, [closeStream, router])

  // On mount: if a scan is already running (e.g., started by another tab or cron),
  // hook into the live stream so the button reflects reality.
  useEffect(() => {
    let cancelled = false
    fetch('/api/scans')
      .then(r => r.json())
      .then((j: { running: number | null }) => {
        if (cancelled) return
        if (j.running !== null) {
          setBusy(true)
          attachStream()
        }
      })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true; closeStream() }
  }, [attachStream, closeStream])

  async function start() {
    if (busy) return
    setBusy(true); setMsg(null); setProgress(null)
    const r = await fetch('/api/scans', { method: 'POST' })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setMsg(j.error ?? 'Kon scan niet starten')
      setBusy(false)
      return
    }
    attachStream()
  }

  const label = busy && progress
    ? `${progress.done}/${progress.total}${progress.failed ? ` (${progress.failed} failed)` : ''}`
    : busy
      ? 'Bezig…'
      : 'Scan nu'

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-60 tabular-nums"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {label}
      </button>
      {msg && <span className="text-xs text-text-tertiary">{msg}</span>}
    </div>
  )
}
