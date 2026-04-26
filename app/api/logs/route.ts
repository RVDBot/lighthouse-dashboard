import { NextRequest, NextResponse } from 'next/server'
import { getDb, type LogRow } from '@/lib/db'
import { log } from '@/lib/logger'

const ALLOWED_LEVELS = new Set(['info', 'warn', 'error'])
const ALLOWED_CATEGORIES = new Set(['scan', 'profile', 'advice', 'chat', 'psi', 'auth', 'systeem'])

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const level = sp.get('level')
  const category = sp.get('category')
  const limit = Math.min(parseInt(sp.get('limit') ?? '200', 10) || 200, 1000)
  const before = sp.get('before')
  const beforeId = before ? parseInt(before, 10) : null

  const where: string[] = []
  const args: unknown[] = []
  if (level && ALLOWED_LEVELS.has(level)) {
    where.push('level = ?'); args.push(level)
  }
  if (category && ALLOWED_CATEGORIES.has(category)) {
    where.push('category = ?'); args.push(category)
  }
  if (beforeId !== null && !isNaN(beforeId)) {
    where.push('id < ?'); args.push(beforeId)
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  args.push(limit)

  const rows = getDb().prepare(`
    SELECT * FROM logs ${whereClause} ORDER BY id DESC LIMIT ?
  `).all(...args) as LogRow[]

  return NextResponse.json({ logs: rows })
}

export async function DELETE() {
  const db = getDb()
  const before = (db.prepare('SELECT COUNT(*) AS c FROM logs').get() as { c: number }).c
  db.prepare('DELETE FROM logs').run()
  log('info', 'systeem', `Logs gewist (${before} entries verwijderd)`)
  return NextResponse.json({ ok: true, removed: before })
}
