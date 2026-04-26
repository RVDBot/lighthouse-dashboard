'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2, ListPlus, X } from 'lucide-react'

interface Row { id: number; url: string; label: string; language: string; page_type: string; enabled: number }

const LANGS = ['nl','en','de','fr','es','it'] as const
const PAGES = ['home','product','category','cart','checkout'] as const
type Lang = typeof LANGS[number]
type PageT = typeof PAGES[number]

interface Parsed {
  url: string
  label: string
  language: Lang
  page_type: PageT
}

const TLD_TO_LANG: Record<string, Lang> = {
  com: 'en',
  nl: 'nl',
  de: 'de',
  fr: 'fr',
  es: 'es',
  it: 'it',
}

const CART_RE     = /\/(cart|winkelwagen|winkelmand|warenkorb|chariot|panier|carrito|carrello)(\/|$)/
const CHECKOUT_RE = /\/(checkout|kassa|kasse|caisse|commander|pago|cassa|finalizar|paiement|paye)(\/|$)/
const CATEGORY_RE = /\/(all-ropes|alle-ropes|alle-seile|toutes-les-cordes|todas-las-cuerdas|tutte-le-corde|shop|winkel|boutique|tienda|negozio|categor)(\/|$)/

function parseUrlLine(raw: string): Parsed | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }

  const tld = u.hostname.split('.').pop() ?? ''
  const language: Lang = TLD_TO_LANG[tld] ?? 'en'

  const pathLower = u.pathname.toLowerCase()
  const cleanPath = pathLower.replace(/\/$/, '')

  let page_type: PageT = 'home'
  if (cleanPath === '' || cleanPath === '/') page_type = 'home'
  else if (CART_RE.test(pathLower))     page_type = 'cart'
  else if (CHECKOUT_RE.test(pathLower)) page_type = 'checkout'
  else if (CATEGORY_RE.test(pathLower)) page_type = 'category'
  else if (cleanPath.split('/').filter(Boolean).length >= 2) page_type = 'product'
  else page_type = 'category'

  const segments = cleanPath.split('/').filter(Boolean)
  const last = segments.length === 0 ? 'Homepage' : segments[segments.length - 1]
  const pretty = last
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  const label = page_type === 'home'
    ? `Homepage ${language.toUpperCase()}`
    : `${pretty} ${language.toUpperCase()}`

  return { url: u.toString(), label, language, page_type }
}

export function UrlManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ url: '', label: '', language: 'en', page_type: 'home' })

  // Bulk panel state
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [parsed, setParsed] = useState<Parsed[]>([])
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

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

  function parseBulk() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l && /^https?:\/\//i.test(l))
    const out: Parsed[] = []
    for (const ln of lines) {
      const p = parseUrlLine(ln)
      if (p) out.push(p)
    }
    setParsed(out)
    setBulkResult(null)
  }

  function patchParsed(idx: number, patch: Partial<Parsed>) {
    setParsed(p => p.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function dropParsed(idx: number) {
    setParsed(p => p.filter((_, i) => i !== idx))
  }

  async function submitBulk() {
    if (parsed.length === 0) return
    setBulkSubmitting(true)
    let ok = 0, fail = 0
    for (const p of parsed) {
      const r = await fetch('/api/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      if (r.ok) ok++; else fail++
    }
    setBulkSubmitting(false)
    setBulkResult(`${ok} toegevoegd${fail ? `, ${fail} mislukt (waarschijnlijk al aanwezig)` : ''}`)
    setBulkText('')
    setParsed([])
    await load()
  }

  return (
    <div className="space-y-3">
      {/* Single add form */}
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

      {/* Bulk-add toggle + panel */}
      <div className="bg-surface-1 border border-border rounded-xl">
        <button
          onClick={() => setBulkOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ListPlus className="w-4 h-4" />
          Bulk toevoegen {bulkOpen ? '▾' : '▸'}
        </button>
        {bulkOpen && (
          <div className="border-t border-border p-3 space-y-3">
            <p className="text-xs text-text-tertiary">
              Plak één URL per regel. Taal en pagina-type worden automatisch afgeleid uit het domein en het pad — je kunt elke regel daarna nog aanpassen vóór toevoegen.
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={8}
              placeholder={'https://speedropeshop.com/\nhttps://speedropeshop.nl/\nhttps://speedropeshop.de/warenkorb/\n...'}
              className="w-full bg-surface-2 text-text-primary text-sm px-3 py-2 rounded-lg outline-none border border-border focus:border-accent font-mono"
            />
            <div className="flex items-center gap-2">
              <button onClick={parseBulk} disabled={!bulkText.trim()} className="bg-surface-3 hover:bg-surface-2 text-text-primary text-sm px-3 py-1.5 rounded disabled:opacity-50">
                Voorbeeld
              </button>
              {parsed.length > 0 && (
                <button onClick={submitBulk} disabled={bulkSubmitting} className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50">
                  {bulkSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Voeg {parsed.length} URL{parsed.length === 1 ? '' : 's'} toe
                </button>
              )}
              {bulkResult && <span className="text-xs text-text-tertiary">{bulkResult}</span>}
            </div>

            {parsed.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-text-tertiary text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">URL</th>
                      <th className="text-left px-3 py-2">Label</th>
                      <th className="px-3 py-2">Lang</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 text-xs text-text-tertiary truncate max-w-xs">{r.url}</td>
                        <td className="px-3 py-1.5">
                          <input
                            className="w-full bg-surface-2 text-text-primary text-xs px-2 py-1 rounded border border-border"
                            value={r.label}
                            onChange={e => patchParsed(i, { label: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <select
                            className="bg-surface-2 text-xs px-1 py-1 rounded border border-border"
                            value={r.language}
                            onChange={e => patchParsed(i, { language: e.target.value as Lang })}
                          >
                            {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <select
                            className="bg-surface-2 text-xs px-1 py-1 rounded border border-border"
                            value={r.page_type}
                            onChange={e => patchParsed(i, { page_type: e.target.value as PageT })}
                          >
                            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button onClick={() => dropParsed(i)} className="text-text-tertiary hover:text-bad" aria-label="Verwijder uit lijst">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Existing rows */}
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
