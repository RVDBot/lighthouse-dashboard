import { NextResponse } from 'next/server'
import { runScan, getRunningScanId } from '@/lib/scan'
import { getDb, type ScanRow } from '@/lib/db'

export async function GET() {
  const rows = getDb().prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 20').all() as ScanRow[]
  return NextResponse.json({ scans: rows, running: getRunningScanId() })
}

export async function POST() {
  if (getRunningScanId() !== null) {
    return NextResponse.json({ error: 'Scan al bezig' }, { status: 429 })
  }
  runScan('manual').catch(() => { /* errors already logged + persisted */ })
  return NextResponse.json({ ok: true })
}
