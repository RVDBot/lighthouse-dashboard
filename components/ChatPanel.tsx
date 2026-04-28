'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Trash2 } from 'lucide-react'
import { MessageBubble, type ChatMsg } from './MessageBubble'
import { ImageUploader, type PendingAttachment } from './ImageUploader'

export function ChatPanel({ auditId }: { auditId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const [model, setModel] = useState<'haiku' | 'sonnet' | 'opus'>('sonnet')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ messageId: number | null; atts: PendingAttachment[] }>({ messageId: null, atts: [] })
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/issues/${encodeURIComponent(auditId)}/chat`).then(r => r.json()).then(j => {
      setMessages((j.messages ?? []).map((m: {
        id: number; role: 'user' | 'assistant'; content: string;
        attachments: Array<{ id: number; mime: string }>
      }) => ({
        id: m.id, role: m.role, content: m.content, attachments: m.attachments,
      })))
    })
    // Pull the configured default chat model from Settings.
    fetch('/api/settings').then(r => r.json()).then((j: { settings: Record<string, string> }) => {
      const v = j.settings?.CLAUDE_MODEL_DEFAULT_CHAT
      if (v === 'haiku' || v === 'sonnet' || v === 'opus') setModel(v)
    }).catch(() => { /* keep default */ })
  }, [auditId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!text.trim() && pending.atts.length === 0) return
    setBusy(true)
    const userMsg: ChatMsg = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: pending.atts,
    }
    const assistantPlaceholder: ChatMsg = { id: `stream-${Date.now()}`, role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, assistantPlaceholder])
    const currentText = text
    const currentPendingId = pending.messageId
    setText('')
    setPending({ messageId: null, atts: [] })

    let res: Response
    try {
      res = await fetch(`/api/issues/${encodeURIComponent(auditId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText: currentText, pendingMessageId: currentPendingId, model }),
      })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      setMessages(prev => prev.map(m => m.id === assistantPlaceholder.id ? { ...m, content: `Verbindingsfout: ${errMsg}` } : m))
      setBusy(false)
      return
    }

    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      const errMsg = j.error ?? `HTTP ${res.status}`
      setMessages(prev => prev.map(m => m.id === assistantPlaceholder.id ? { ...m, content: `Fout: ${errMsg}` } : m))
      setBusy(false)
      return
    }

    if (!res.body) { setBusy(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n\n')
      buf = lines.pop() ?? ''
      for (const ln of lines) {
        if (!ln.startsWith('data:')) continue
        const payload = JSON.parse(ln.slice(5).trim()) as { chunk?: string; done?: boolean; error?: string }
        if (payload.chunk) {
          const chunk = payload.chunk
          setMessages(prev => prev.map(m => m.id === assistantPlaceholder.id ? { ...m, content: m.content + chunk } : m))
        }
        if (payload.error) {
          const errMsg = payload.error
          setMessages(prev => prev.map(m => m.id === assistantPlaceholder.id ? { ...m, content: `Fout: ${errMsg}` } : m))
        }
      }
    }
    setBusy(false)
  }

  async function clearChat() {
    if (messages.length === 0) return
    const ok = confirm(`Chat wissen? ${messages.length} bericht${messages.length === 1 ? '' : 'en'} en alle bijlagen worden verwijderd.`)
    if (!ok) return
    setBusy(true)
    try {
      await fetch(`/api/issues/${encodeURIComponent(auditId)}/chat`, { method: 'DELETE' })
      setMessages([])
      setPending({ messageId: null, atts: [] })
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl flex flex-col min-h-[500px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border text-xs text-text-tertiary">
        <span>Chat</span>
        <div className="flex items-center gap-2">
          <select value={model} onChange={e => setModel(e.target.value as 'haiku' | 'sonnet' | 'opus')} className="bg-surface-2 text-text-primary text-xs px-2 py-1 rounded border border-border">
            <option value="haiku">Haiku (snel)</option>
            <option value="sonnet">Sonnet (gebalanceerd)</option>
            <option value="opus">Opus (diepgaand)</option>
          </select>
          <button
            onClick={clearChat}
            disabled={busy || messages.length === 0}
            className="text-xs flex items-center gap-1 bg-surface-2 hover:bg-bad/10 hover:text-bad text-text-tertiary px-2 py-1 rounded border border-border disabled:opacity-40"
            title={messages.length === 0 ? 'Chat is al leeg' : 'Wis deze chat-historie'}
          >
            <Trash2 className="w-3 h-3" /> Nieuwe chat
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(m => <MessageBubble key={m.id} m={m} />)}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 flex items-start gap-2">
        <ImageUploader auditId={auditId} pending={pending} onPending={setPending} />
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={2}
          className="flex-1 bg-surface-2 text-text-primary text-sm px-3 py-2 rounded-lg outline-none border border-border focus:border-accent resize-none"
          placeholder="Typ je vraag…"
        />
        <button disabled={busy} onClick={send} className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
