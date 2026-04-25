'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type S = { PSI_API_KEY: string; ANTHROPIC_API_KEY: string; CLAUDE_MODEL_DEFAULT: string; CLAUDE_MODEL_ESCALATED: string; PROFILE_BASE_URL: string }

export function ApiKeysForm() {
  const [s, setS] = useState<S>({ PSI_API_KEY: '', ANTHROPIC_API_KEY: '', CLAUDE_MODEL_DEFAULT: '', CLAUDE_MODEL_ESCALATED: '', PROFILE_BASE_URL: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { fetch('/api/settings').then(r => r.json()).then(j => setS(j.settings)) }, [])

  async function save() {
    setSaving(true); setSaved(false)
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const row = (label: string, key: keyof S, placeholder?: string, type: 'text' | 'password' = 'password') => (
    <label className="block space-y-1">
      <span className="text-text-tertiary text-xs">{label}</span>
      <input type={type} value={s[key]} onChange={e => setS({ ...s, [key]: e.target.value })}
             className="w-full bg-surface-2 text-sm px-3 py-2 rounded border border-border"
             placeholder={placeholder} />
    </label>
  )

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
      {row('PSI API key', 'PSI_API_KEY')}
      {row('Anthropic API key', 'ANTHROPIC_API_KEY')}
      {row('Claude default model', 'CLAUDE_MODEL_DEFAULT', 'claude-haiku-4-5-20251001', 'text')}
      {row('Claude escalated model', 'CLAUDE_MODEL_ESCALATED', 'claude-opus-4-7', 'text')}
      {row('Profiel base URL', 'PROFILE_BASE_URL', 'https://speedropeshop.com/', 'text')}
      <button onClick={save} disabled={saving} className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-1.5 rounded disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? '✓ Opgeslagen' : 'Opslaan'}
      </button>
    </div>
  )
}
