'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Loader2 } from 'lucide-react'

export function AdviceBody({
  auditId,
  initial,
  initialModel,
  initialGeneratedAt,
}: {
  auditId: string
  initial: string | null
  initialModel: string | null
  initialGeneratedAt: number | null
}) {
  const [body, setBody] = useState(initial)
  const [model, setModel] = useState(initialModel)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function regenerate(mode: 'default' | 'escalated') {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/issues/${encodeURIComponent(auditId)}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: mode }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Fout')
      setBody(j.markdown)
      setModel(j.model)
      setGeneratedAt(Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-5 space-y-3">
      {body ? (
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-text-tertiary text-sm">Nog geen advies gegenereerd.</p>
      )}
      {err && <p className="text-bad text-xs">{err}</p>}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="text-xs text-text-tertiary">
          {model ? `${model}` : ''}{generatedAt ? ` · ${new Date(generatedAt).toLocaleString('nl-NL')}` : ''}
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => regenerate('default')} className="text-xs px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 text-text-primary flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Regenereer
          </button>
          <button disabled={busy} onClick={() => regenerate('escalated')} className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Met Opus
          </button>
        </div>
      </div>
    </div>
  )
}
