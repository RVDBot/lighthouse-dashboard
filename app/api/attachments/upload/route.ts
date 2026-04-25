import { NextRequest, NextResponse } from 'next/server'
import { storeAttachment } from '@/lib/attachments'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'

const MAX_FILES_PER_REQUEST = 5

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const auditId = form.get('auditId')
  if (typeof auditId !== 'string' || !auditId) {
    return NextResponse.json({ error: 'auditId vereist' }, { status: 400 })
  }

  // Only accept auditIds we've actually seen as opportunities — refuse seeding rows
  // for arbitrary strings.
  const known = getDb().prepare(`SELECT 1 FROM opportunities WHERE audit_id = ? LIMIT 1`).get(auditId)
  if (!known) {
    return NextResponse.json({ error: 'onbekende auditId' }, { status: 400 })
  }

  // Collect File entries first; only commit a placeholder message + attachments if at least one is valid.
  const files: File[] = []
  for (const [k, v] of form.entries()) {
    if (k !== 'file') continue
    if (v instanceof File) files.push(v)
  }
  if (files.length === 0) {
    return NextResponse.json({ error: 'geen bestanden' }, { status: 400 })
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `maximaal ${MAX_FILES_PER_REQUEST} bestanden per upload` }, { status: 400 })
  }

  const db = getDb()
  const info = db.prepare(`
    INSERT INTO issue_chat_messages (audit_id, role, content, created_at)
    VALUES (?, 'user', '', ?)
  `).run(auditId, Date.now())
  const chatMessageId = info.lastInsertRowid as number

  const stored = []
  try {
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer())
      const a = storeAttachment({ chatMessageId, declaredMime: f.type, buffer: buf })
      stored.push({ id: a.id, mime: a.mime_type, size: a.size_bytes })
    }
  } catch (e) {
    // Roll back the placeholder + any partial attachments so we don't leave orphans.
    db.prepare(`DELETE FROM issue_chat_messages WHERE id = ?`).run(chatMessageId)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }

  return NextResponse.json({ pendingMessageId: chatMessageId, attachments: stored })
}
