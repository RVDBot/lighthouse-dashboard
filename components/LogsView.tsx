'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2, Loader2 } from 'lucide-react'

interface LogEntry {
  id: number
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
  meta: string | null
  created_at: number
}

const LEVELS = ['info', 'warn', 'error'] as const
const CATEGORIES = ['scan', 'profile', 'advice', 'chat', 'psi', 'auth', 'systeem'] as const

const LEVEL_BG: Record<string, string> = {
  info:  'bg-accent/15 text-accent',
  warn:  'bg-warn/15 text-warn',
  error: 'bg-bad/15 text-bad',
}

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (level) params.set('level', level)
    if (category) params.set('category', category)
    params.set('limit', '300')
    try {
      const r = await fetch(`/api/logs?${params}`)
      const j = await r.json() as { logs: LogEntry[] }
      setLogs(j.logs ?? [])
    } finally {
      setLoading(false)
    }
  }, [level, category])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [autoRefresh, load])

  async function clearAll() {
    if (!confirm('Alle logs verwijderen?')) return
    await fetch('/api/logs', { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface-1 border border-border rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-tertiary">Niveau</label>
          <select value={level} onChange={e => setLevel(e.target.value)} className="bg-surface-2 text-text-primary text-xs px-2 py-1 rounded border border-border">
            <option value="">Alle</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-tertiary">Categorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="bg-surface-2 text-text-primary text-xs px-2 py-1 rounded border border-border">
            <option value="">Alle</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
          Auto-refresh (5s)
        </label>
        <div className="flex-1" />
        <button onClick={load} disabled={loading} className="text-xs flex items-center gap-1 bg-surface-3 hover:bg-surface-2 text-text-primary px-2 py-1 rounded disabled:opacity-50">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Vernieuwen
        </button>
        <button onClick={clearAll} className="text-xs flex items-center gap-1 bg-surface-3 hover:bg-bad/10 hover:text-bad text-text-tertiary px-2 py-1 rounded">
          <Trash2 className="w-3 h-3" /> Wis logs
        </button>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        {logs.length === 0 ? (
          <p className="text-text-tertiary text-sm p-6 text-center">Geen logs.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {logs.map(l => {
              const isOpen = expanded[l.id]
              const hasMeta = l.meta && l.meta !== 'null' && l.meta !== '{}'
              return (
                <li key={l.id} className="px-3 py-2 hover:bg-surface-2/50">
                  <div className="flex items-start gap-3">
                    <span className="text-text-tertiary text-xs tabular-nums shrink-0 w-32">
                      {new Date(l.created_at).toLocaleString('nl-NL')}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded shrink-0 ${LEVEL_BG[l.level] ?? ''}`}>
                      {l.level}
                    </span>
                    <span className="text-text-tertiary text-xs shrink-0 w-16">{l.category}</span>
                    <span className="text-text-primary flex-1 break-words">{l.message}</span>
                    {hasMeta && (
                      <button
                        onClick={() => setExpanded(p => ({ ...p, [l.id]: !p[l.id] }))}
                        className="text-text-tertiary text-xs hover:text-text-primary shrink-0"
                      >
                        {isOpen ? 'verberg' : 'meta'}
                      </button>
                    )}
                  </div>
                  {hasMeta && isOpen && (
                    <pre className="mt-1.5 ml-32 text-xs text-text-secondary bg-surface-2 rounded p-2 overflow-x-auto">
                      {prettyJson(l.meta)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-text-tertiary">{logs.length} regel(s) — newest first.</p>
    </div>
  )
}

function prettyJson(s: string | null): string {
  if (!s) return ''
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}
