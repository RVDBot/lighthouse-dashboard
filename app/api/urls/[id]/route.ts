import { NextRequest, NextResponse } from 'next/server'
import { getDb, type UrlRow } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'id' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as Partial<UrlRow>
  const sets: string[] = []
  const vals: unknown[] = []
  for (const k of ['label','language','page_type','enabled','url'] as const) {
    if (body[k] !== undefined) {
      sets.push(`${k} = ?`)
      vals.push(body[k])
    }
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
