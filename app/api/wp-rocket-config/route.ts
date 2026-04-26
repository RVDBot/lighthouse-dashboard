import { NextRequest, NextResponse } from 'next/server'
import { getExternalConfig, setExternalConfig, deleteExternalConfig } from '@/lib/external-configs'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const MAX_BYTES = 1024 * 1024 // 1 MB cap on the JSON

export async function GET() {
  const row = getExternalConfig('wp-rocket')
  if (!row) return NextResponse.json({ config: null })
  // Return both the parsed JSON (for the UI to render summary) and metadata
  let parsed: unknown = null
  try { parsed = JSON.parse(row.json_data) } catch { /* keep null, raw still available */ }
  return NextResponse.json({
    config: parsed,
    raw: row.json_data,
    filename: row.filename,
    uploadedAt: row.uploaded_at,
    bytes: new TextEncoder().encode(row.json_data).length,
  })
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let raw: string
  let filename: string | null = null

  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const f = form.get('file')
      if (!(f instanceof File)) return NextResponse.json({ error: 'file vereist' }, { status: 400 })
      if (f.size > MAX_BYTES) return NextResponse.json({ error: `bestand te groot (>${MAX_BYTES} bytes)` }, { status: 413 })
      raw = await f.text()
      filename = f.name
    } else {
      // application/json — { raw: "..." } OR direct JSON
      const body = await req.text()
      if (body.length > MAX_BYTES) return NextResponse.json({ error: `te groot` }, { status: 413 })
      // Try wrapped form first
      try {
        const parsed = JSON.parse(body) as { raw?: string }
        if (typeof parsed === 'object' && parsed && 'raw' in parsed && typeof parsed.raw === 'string') {
          raw = parsed.raw
        } else {
          raw = body
        }
      } catch {
        raw = body
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'fout bij lezen' }, { status: 400 })
  }

  // Sanity: must parse as JSON object
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return NextResponse.json({ error: 'geen geldige JSON' }, { status: 400 }) }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return NextResponse.json({ error: 'verwacht een JSON-object' }, { status: 400 })
  }

  setExternalConfig('wp-rocket', raw, filename)
  const keyCount = Object.keys(obj as Record<string, unknown>).length
  log('info', 'systeem', 'WP Rocket config geüpload', { filename, keys: keyCount, bytes: raw.length })
  return NextResponse.json({ ok: true, keys: keyCount, bytes: raw.length })
}

export async function DELETE() {
  deleteExternalConfig('wp-rocket')
  log('info', 'systeem', 'WP Rocket config verwijderd')
  return NextResponse.json({ ok: true })
}
