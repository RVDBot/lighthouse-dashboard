'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText, Loader2, CheckCircle2 } from 'lucide-react'

interface State {
  config: Record<string, unknown> | null
  filename: string | null
  uploadedAt: number | null
  bytes: number | null
}

const PERF_KEYS = [
  'cache_logged_user', 'cache_mobile', 'cache_ssl', 'cache_query_strings',
  'minify_css', 'minify_concatenate_css', 'remove_unused_css',
  'minify_js', 'minify_concatenate_js', 'defer_all_js', 'delay_js',
  'lazyload', 'lazyload_iframes', 'lazyload_youtube',
  'manual_preload', 'preload_links',
  'embeds', 'control_heartbeat', 'heartbeat_admin_behavior',
  'do_caching_mobile_files', 'database_cleanup_enabled',
] as const

export function WpRocketUpload() {
  const [state, setState] = useState<State>({ config: null, filename: null, uploadedAt: null, bytes: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function load() {
    const r = await fetch('/api/wp-rocket-config')
    const j = await r.json() as { config: Record<string, unknown> | null; filename?: string | null; uploadedAt?: number; bytes?: number }
    setState({
      config: j.config ?? null,
      filename: j.filename ?? null,
      uploadedAt: j.uploadedAt ?? null,
      bytes: j.bytes ?? null,
    })
  }

  useEffect(() => { load() }, [])

  async function uploadFile(file: File) {
    setBusy(true); setErr(null)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/wp-rocket-config', { method: 'POST', body: fd })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setErr(j.error ?? `HTTP ${r.status}`)
    } else {
      await load()
    }
    setBusy(false)
  }

  async function uploadPaste() {
    if (!pasteText.trim()) return
    setBusy(true); setErr(null)
    const r = await fetch('/api/wp-rocket-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: pasteText }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setErr(j.error ?? `HTTP ${r.status}`)
    } else {
      setPasteText('')
      setShowPaste(false)
      await load()
    }
    setBusy(false)
  }

  async function remove() {
    if (!confirm('WP Rocket config verwijderen?')) return
    setBusy(true)
    await fetch('/api/wp-rocket-config', { method: 'DELETE' })
    await load()
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        <p className="text-xs text-text-tertiary">
          Exporteer in WordPress: <span className="font-medium text-text-secondary">WP Admin → WP Rocket → Tools → Export Settings</span>.
          Upload de gedownloade <code className="bg-surface-2 px-1 rounded">.json</code> hier — Claude krijgt 'm dan als context bij elke advies-generatie en chat-vraag.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            JSON uploaden
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) uploadFile(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => setShowPaste(s => !s)}
            disabled={busy}
            className="bg-surface-3 hover:bg-surface-2 text-text-primary text-sm px-3 py-1.5 rounded disabled:opacity-50"
          >
            {showPaste ? 'Annuleer plakken' : 'Of plak JSON'}
          </button>
          {state.config && (
            <button
              onClick={remove}
              disabled={busy}
              className="bg-surface-3 hover:bg-bad/10 hover:text-bad text-text-tertiary text-sm px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Verwijder
            </button>
          )}
        </div>

        {showPaste && (
          <div className="space-y-2">
            <textarea
              rows={6}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder='{"cache_logged_user": 0, ...}'
              className="w-full bg-surface-2 text-text-primary text-xs font-mono px-3 py-2 rounded border border-border outline-none focus:border-accent"
            />
            <button
              onClick={uploadPaste}
              disabled={busy || !pasteText.trim()}
              className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
            >
              Bewaar
            </button>
          </div>
        )}

        {err && <p className="text-bad text-xs">{err}</p>}
      </div>

      {state.config && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-good" />
              <span className="text-text-primary">Config geladen</span>
              {state.filename && (
                <span className="text-text-tertiary text-xs">
                  <FileText className="w-3 h-3 inline mr-1" />
                  {state.filename}
                </span>
              )}
            </div>
            <div className="text-xs text-text-tertiary">
              {state.uploadedAt ? new Date(state.uploadedAt).toLocaleString('nl-NL') : ''}
              {state.bytes ? ` · ${Math.round(state.bytes / 1024)} KB` : ''}
              {' · '}
              {Object.keys(state.config).length} keys
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">Performance-relevante settings</summary>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
              {PERF_KEYS.map(k => {
                const v = state.config?.[k]
                return (
                  <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-0.5">
                    <dt className="text-text-tertiary truncate">{k}</dt>
                    <dd className="text-text-primary tabular-nums">{formatVal(v)}</dd>
                  </div>
                )
              })}
            </dl>
          </details>

          <details className="text-xs">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">Volledige JSON</summary>
            <pre className="mt-2 text-text-secondary bg-surface-2 rounded p-3 overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(state.config, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}

function formatVal(v: unknown): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return v ? '✓ on' : '○ off'
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v
  if (Array.isArray(v)) return `[${v.length}]`
  return JSON.stringify(v).slice(0, 80)
}
