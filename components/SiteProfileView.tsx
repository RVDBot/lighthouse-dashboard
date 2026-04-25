'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'

interface Profile {
  detectedAt: number
  cdn: string | null
  cache: { plugin: string | null; edgeCache: boolean; ttlSeconds: number }
  pageBuilder: string | null
  theme: { slug: string | null; type: string | null }
  plugins: string[]
  wpml: { active: boolean; autoTranslate: boolean; languages: string[] }
  signals: { homepageHtmlBytes: number; inlineCssBytes: number; scriptCount: number; thirdPartyHosts: string[] }
}

export function SiteProfileView() {
  const [p, setP] = useState<Profile | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const r = await fetch('/api/site-profile'); const j = await r.json()
    if (j.profile) { setP(j.profile); setRefreshedAt(j.refreshedAt ?? j.refreshed_at ?? null) }
  }
  useEffect(() => { load() }, [])

  async function refresh() {
    setBusy(true)
    await fetch('/api/site-profile', { method: 'POST' })
    await load()
    setBusy(false)
  }

  if (!p) return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 text-sm text-text-tertiary flex items-center justify-between">
      <span>Nog geen site-profiel.</span>
      <button onClick={refresh} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded">Scan profiel</button>
    </div>
  )

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">Ververst: {refreshedAt ? new Date(refreshedAt).toLocaleString('nl-NL') : '—'}</div>
        <button disabled={busy} onClick={refresh} className="text-xs flex items-center gap-1 bg-surface-3 hover:bg-surface-2 text-text-primary px-2 py-1 rounded disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Verversen
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <dt className="text-text-tertiary">CDN</dt><dd>{p.cdn ?? '—'}</dd>
        <dt className="text-text-tertiary">Cache</dt><dd>{p.cache.plugin ?? '—'}{p.cache.edgeCache ? ` · edge (${p.cache.ttlSeconds}s)` : ''}</dd>
        <dt className="text-text-tertiary">Page builder</dt><dd>{p.pageBuilder ?? '—'}</dd>
        <dt className="text-text-tertiary">Thema</dt><dd>{p.theme.slug ?? '—'}{p.theme.type ? ` (${p.theme.type})` : ''}</dd>
        <dt className="text-text-tertiary">WPML</dt><dd>{p.wpml.active ? `actief${p.wpml.autoTranslate ? ' · auto' : ''} (${p.wpml.languages.join(', ')})` : '—'}</dd>
        <dt className="text-text-tertiary">Plugins</dt><dd className="break-words">{p.plugins.join(', ')}</dd>
        <dt className="text-text-tertiary">Homepage HTML</dt><dd>{Math.round(p.signals.homepageHtmlBytes / 1024)} KB</dd>
        <dt className="text-text-tertiary">Inline CSS</dt><dd>{Math.round(p.signals.inlineCssBytes / 1024)} KB</dd>
        <dt className="text-text-tertiary">Scripts</dt><dd>{p.signals.scriptCount}</dd>
        <dt className="text-text-tertiary">3rd-party hosts</dt><dd className="break-words">{p.signals.thirdPartyHosts.join(', ')}</dd>
      </dl>
    </div>
  )
}
