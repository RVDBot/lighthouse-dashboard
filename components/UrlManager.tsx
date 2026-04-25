'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'

interface Row { id: number; url: string; label: string; language: string; page_type: string; enabled: number }
const LANGS = ['nl','en','de','fr','es','it'] as const
const PAGES = ['home','product','category','cart','checkout'] as const

export function UrlManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ url: '', label: '', language: 'en', page_type: 'home' })

  async function load() {
    const r = await fetch('/api/urls'); const j = await r.json()
    setRows(j.urls ?? [])
  }
  useEffect(() => { load() }, [])

  async function add() {
    setBusy(true)
    const r = await fetch('/api/urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? 'Fout') }
    else { setForm({ url: '', label: '', language: 'en', page_type: 'home' }); await load() }
    setBusy(false)
  }

  async function toggle(id: number, enabled: number) {
    await fetch(`/api/urls/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled ? 0 : 1 }) })
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Verwijderen?')) return
    await fetch(`/api/urls/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface-1 border border-border rounded-xl p-3 grid grid-cols-5 gap-2">
        <input className="bg-surface-2 text-sm px-2 py-1.5 rounded border border-border col-span-2" placeholder="https://..." value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
        <input className="bg-surface-2 text-sm px-2 py-1.5 rounded border border-border" placeholder="Label" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
        <select className="bg-surface-2 text-sm px-2 py-1.5 rounded border border-border" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
          {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="flex-1 bg-surface-2 text-sm px-2 py-1.5 rounded border border-border" value={form.page_type} onChange={e => setForm({ ...form, page_type: e.target.value })}>
            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button disabled={busy || !form.url || !form.label} onClick={add} className="bg-accent hover:bg-accent-hover text-white px-2 py-1.5 rounded text-sm disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-text-tertiary text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Label</th>
              <th className="text-left px-3 py-2">URL</th>
              <th className="px-3 py-2">Lang</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Actief</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-text-tertiary text-xs truncate max-w-xs">{r.url}</td>
                <td className="px-3 py-2 text-center uppercase">{r.language}</td>
                <td className="px-3 py-2 text-center">{r.page_type}</td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => toggle(r.id, r.enabled)} className={r.enabled ? 'text-good' : 'text-text-tertiary'}>
                    {r.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => remove(r.id)} className="text-text-tertiary hover:text-bad">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
