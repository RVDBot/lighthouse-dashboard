'use client'

import { Paperclip, X } from 'lucide-react'
import { useRef } from 'react'

export interface PendingAttachment {
  id: number
  mime: string
  size: number
}

export function ImageUploader({
  pending,
  onPending,
  auditId,
}: {
  pending: { messageId: number | null; atts: PendingAttachment[] }
  onPending: (next: { messageId: number | null; atts: PendingAttachment[] }) => void
  auditId: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const fd = new FormData()
    fd.set('auditId', auditId)
    for (const f of Array.from(files)) fd.append('file', f)
    const r = await fetch('/api/attachments/upload', { method: 'POST', body: fd })
    const j = await r.json()
    if (!r.ok) {
      alert(j.error ?? 'Upload mislukt')
      return
    }
    onPending({ messageId: j.pendingMessageId, atts: [...pending.atts, ...j.attachments] })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="text-text-tertiary hover:text-text-primary p-2"
        aria-label="Voeg afbeelding toe"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={e => onFiles(e.target.files)}
      />
      {pending.atts.length > 0 && (
        <div className="flex gap-1">
          {pending.atts.map(a => (
            <div key={a.id} className="relative">
              <img src={`/api/attachments/${a.id}`} alt="" className="w-8 h-8 object-cover rounded border border-border" />
              <button
                onClick={() => onPending({ ...pending, atts: pending.atts.filter(x => x.id !== a.id) })}
                className="absolute -top-1 -right-1 bg-bad rounded-full w-3 h-3 flex items-center justify-center"
                aria-label="Verwijder"
              >
                <X className="w-2 h-2 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
