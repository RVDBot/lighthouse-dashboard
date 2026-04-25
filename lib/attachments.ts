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

/** Sniff the first bytes; return the actual MIME or null if it's not one of png/jpeg/webp. */
export function sniffImageMime(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  ("RIFF....WEBP")
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
   && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  return null
}

export interface StoreInput {
  chatMessageId: number
  declaredMime: string
  buffer: Buffer
}

export function storeAttachment(input: StoreInput): ChatAttachmentRow {
  if (!ALLOWED_MIMES.has(input.declaredMime)) {
    throw new Error(`MIME niet toegestaan: ${input.declaredMime}`)
  }
  if (input.buffer.byteLength > MAX_BYTES) {
    throw new Error(`Bestand te groot (max ${MAX_BYTES} bytes)`)
  }
  const sniffed = sniffImageMime(input.buffer)
  if (!sniffed) throw new Error('Bestand is geen geldige PNG/JPEG/WEBP')
  // Use the sniffed mime as the source of truth — ignore the (possibly spoofed) Content-Type.
  const mime = sniffed

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${randomUUID()}.${ext}`
  const fullPath = path.join(attachmentsDir(), filename)
  fs.writeFileSync(fullPath, input.buffer)

  const now = Date.now()
  const info = getDb().prepare(`
    INSERT INTO chat_attachments (chat_message_id, file_path, mime_type, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.chatMessageId, filename, mime, input.buffer.byteLength, now)

  return {
    id: info.lastInsertRowid as number,
    chat_message_id: input.chatMessageId,
    file_path: filename,
    mime_type: mime,
    size_bytes: input.buffer.byteLength,
    created_at: now,
  }
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
