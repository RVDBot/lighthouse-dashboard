import { NextRequest, NextResponse } from 'next/server'
import { storeAttachment } from '@/lib/attachments'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const auditId = form.get('auditId')
  if (typeof auditId !== 'string' || !auditId) {
    return NextResponse.json({ error: 'auditId vereist' }, { status: 400 })
  }

  const info = getDb().prepare(`
    INSERT INTO issue_chat_messages (audit_id, role, content, created_at)
    VALUES (?, 'user', '', ?)
  `).run(auditId, Date.now())
  const chatMessageId = info.lastInsertRowid as number

  const stored = []
  for (const [k, v] of form.entries()) {
    if (k !== 'file') continue
    if (!(v instanceof File)) continue
    const buf = Buffer.from(await v.arrayBuffer())
    try {
      const a = storeAttachment({ chatMessageId, mime: v.type, buffer: buf })
      stored.push({ id: a.id, mime: a.mime_type, size: a.size_bytes })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
    }
  }

  return NextResponse.json({ pendingMessageId: chatMessageId, attachments: stored })
}
