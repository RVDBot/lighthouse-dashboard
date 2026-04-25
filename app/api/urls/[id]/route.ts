import { NextRequest, NextResponse } from 'next/server'
import { getDb, type UrlRow, type Language, type PageType } from '@/lib/db'

const LANGS: readonly Language[] = ['nl','en','de','fr','es','it']
const PAGE_TYPES: readonly PageType[] = ['home','product','category','cart','checkout']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'id' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as Partial<UrlRow>
  const sets: string[] = []
  const vals: unknown[] = []

  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || !body.label.trim()) return NextResponse.json({ error: 'ongeldig label' }, { status: 400 })
    sets.push('label = ?'); vals.push(body.label.trim())
  }
  if (body.language !== undefined) {
    if (!LANGS.includes(body.language as Language)) return NextResponse.json({ error: 'ongeldige language' }, { status: 400 })
    sets.push('language = ?'); vals.push(body.language)
  }
  if (body.page_type !== undefined) {
    if (!PAGE_TYPES.includes(body.page_type as PageType)) return NextResponse.json({ error: 'ongeldige page_type' }, { status: 400 })
    sets.push('page_type = ?'); vals.push(body.page_type)
  }
  if (body.enabled !== undefined) {
    if (body.enabled !== 0 && body.enabled !== 1) return NextResponse.json({ error: 'ongeldig enabled' }, { status: 400 })
    sets.push('enabled = ?'); vals.push(body.enabled)
  }
  if (body.url !== undefined) {
    if (typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) return NextResponse.json({ error: 'ongeldige url' }, { status: 400 })
    sets.push('url = ?'); vals.push(body.url.trim())
  }

  if (sets.length === 0) return NextResponse.json({ ok: true })
  vals.push(numId)
  getDb().prepare(`UPDATE urls SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  getDb().prepare('DELETE FROM urls WHERE id = ?').run(parseInt(id, 10))
  return NextResponse.json({ ok: true })
}
