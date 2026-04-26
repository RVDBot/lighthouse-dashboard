'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type S = {
  PSI_API_KEY: string
  ANTHROPIC_API_KEY: string
  CLAUDE_MODEL_HAIKU: string
  CLAUDE_MODEL_SONNET: string
  CLAUDE_MODEL_OPUS: string
  CLAUDE_MODEL_DEFAULT_CHAT: string
  PROFILE_BASE_URL: string
}

const EMPTY: S = {
  PSI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  CLAUDE_MODEL_HAIKU: '',
  CLAUDE_MODEL_SONNET: '',
  CLAUDE_MODEL_OPUS: '',
  CLAUDE_MODEL_DEFAULT_CHAT: '',
  PROFILE_BASE_URL: '',
}

export function ApiKeysForm() {
  const [s, setS] = useState<S>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then((j: { settings: Partial<S> }) => {
      setS({ ...EMPTY, ...j.settings })
    })
  }, [])

  async function save() {
    setSaving(true); setSaved(false)
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const text = (label: string, key: keyof S, placeholder?: string, type: 'text' | 'password' = 'password') => (
    <label className="block space-y-1">
      <span className="text-text-tertiary text-xs">{label}</span>
      <input
        type={type}
        value={s[key]}
        onChange={e => setS({ ...s, [key]: e.target.value })}
        className="w-full bg-surface-2 text-sm px-3 py-2 rounded border border-border"
        placeholder={placeholder}
      />
    </label>
  )

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
      {text('PSI API key', 'PSI_API_KEY')}
      {text('Anthropic API key', 'ANTHROPIC_API_KEY')}

      <hr className="border-border" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {text('Haiku model id',  'CLAUDE_MODEL_HAIKU',  'claude-haiku-4-5-20251001', 'text')}
        {text('Sonnet model id', 'CLAUDE_MODEL_SONNET', 'claude-sonnet-4-6',         'text')}
        {text('Opus model id',   'CLAUDE_MODEL_OPUS',   'claude-opus-4-7',           'text')}
      </div>

      <label className="block space-y-1">
        <span className="text-text-tertiary text-xs">Standaard model voor chat</span>
        <select
          value={s.CLAUDE_MODEL_DEFAULT_CHAT || 'sonnet'}
          onChange={e => setS({ ...s, CLAUDE_MODEL_DEFAULT_CHAT: e.target.value })}
          className="w-full bg-surface-2 text-sm px-3 py-2 rounded border border-border"
        >
          <option value="haiku">Haiku (snel, goedkoop)</option>
          <option value="sonnet">Sonnet (gebalanceerd) — aanbevolen</option>
          <option value="opus">Opus (diepgaand, traag)</option>
        </select>
        <p className="text-xs text-text-tertiary">
          Per chat kun je dit nog wisselen via de selector in het chatvenster.
        </p>
      </label>

      <hr className="border-border" />

      {text('Profiel base URL', 'PROFILE_BASE_URL', 'https://speedropeshop.com/', 'text')}

      <button onClick={save} disabled={saving} className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-1.5 rounded disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? '✓ Opgeslagen' : 'Opslaan'}
      </button>
    </div>
  )
}
