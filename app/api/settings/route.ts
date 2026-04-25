import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = ['PSI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_DEFAULT', 'CLAUDE_MODEL_ESCALATED', 'PROFILE_BASE_URL'] as const

export async function GET() {
  const out: Record<string, string> = {}
  for (const k of ALLOWED_KEYS) out[k] = getSetting(k) ?? ''
  return NextResponse.json({ settings: out })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  for (const [k, v] of Object.entries(body)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(k)) continue
    if (typeof v === 'string') setSetting(k, v)
  }
  return NextResponse.json({ ok: true })
}
