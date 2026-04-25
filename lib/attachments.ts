import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { getDb, type ChatAttachmentRow } from './db'

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

function attachmentsDir(): string {
  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'lighthouse.db')
  const dir = path.join(path.dirname(path.resolve(dbPath)), 'attachments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export interface StoreInput {
  chatMessageId: number
  mime: string
  buffer: Buffer
}

export function storeAttachment(input: StoreInput): ChatAttachmentRow {
  if (!ALLOWED_MIMES.has(input.mime)) throw new Error(`MIME niet toegestaan: ${input.mime}`)
  if (input.buffer.byteLength > MAX_BYTES) throw new Error(`Bestand te groot (max ${MAX_BYTES} bytes)`)

  const ext = input.mime === 'image/png' ? 'png' : input.mime === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${randomUUID()}.${ext}`
  const fullPath = path.join(attachmentsDir(), filename)
  fs.writeFileSync(fullPath, input.buffer)

  const info = getDb().prepare(`
    INSERT INTO chat_attachments (chat_message_id, file_path, mime_type, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.chatMessageId, filename, input.mime, input.buffer.byteLength, Date.now())

  const row = getDb().prepare(`SELECT * FROM chat_attachments WHERE id = ?`).get(info.lastInsertRowid) as ChatAttachmentRow
  return row
}

export function readAttachment(id: number): { buffer: Buffer; mime: string } | null {
  const row = getDb().prepare(`SELECT file_path, mime_type FROM chat_attachments WHERE id = ?`).get(id) as
    { file_path: string; mime_type: string } | undefined
  if (!row) return null
  const fullPath = path.join(attachmentsDir(), row.file_path)
  if (!fs.existsSync(fullPath)) return null
  return { buffer: fs.readFileSync(fullPath), mime: row.mime_type }
}

export function listAttachmentsForMessage(chatMessageId: number): ChatAttachmentRow[] {
  return getDb().prepare(`SELECT * FROM chat_attachments WHERE chat_message_id = ? ORDER BY id`).all(chatMessageId) as ChatAttachmentRow[]
}
