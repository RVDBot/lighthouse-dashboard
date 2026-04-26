import { NextRequest, NextResponse } from 'next/server'
import { getDb, type UrlRow, type Language, type PageType } from '@/lib/db'
import { log } from '@/lib/logger'

const LANGS: readonly Language[] = ['nl','en','de','fr','es','it']
const PAGE_TYPES: readonly PageType[] = ['home','product','category','cart','checkout']

export async function GET() {
  const rows = getDb().prepare('SELECT * FROM urls ORDER BY language, page_type, id').all() as UrlRow[]
  return NextResponse.json({ urls: rows })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }) }
  const b = body as Partial<UrlRow>
  const url = typeof b.url === 'string' ? b.url.trim() : ''
  const label = typeof b.label === 'string' ? b.label.trim() : ''
  const language = b.language as Language
  const page_type = b.page_type as PageType

  if (!url || !/^https?:\/\//.test(url)) return NextResponse.json({ error: 'url vereist en moet http(s) zijn' }, { status: 400 })
  if (!label)                              return NextResponse.json({ error: 'label vereist' },                   { status: 400 })
  if (!LANGS.includes(language))           return NextResponse.json({ error: 'ongeldige language' },              { status: 400 })
  if (!PAGE_TYPES.includes(page_type))     return NextResponse.json({ error: 'ongeldige page_type' },             { status: 400 })

  const enabled = b.enabled === 0 ? 0 : 1
  try {
    const info = getDb().prepare(`
      INSERT INTO urls (url, label, language, page_type, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(url, label, language, page_type, enabled, Date.now())
    log('info', 'systeem', `URL toegevoegd: ${label}`, { id: info.lastInsertRowid, url, language, page_type })
    return NextResponse.json({ id: info.lastInsertRowid, ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'URL bestaat al of DB-fout', detail: e instanceof Error ? e.message : String(e) }, { status: 409 })
  }
}
