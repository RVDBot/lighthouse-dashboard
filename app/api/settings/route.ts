import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = ['PSI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_DEFAULT', 'CLAUDE_MODEL_ESCALATED', 'PROFILE_BASE_URL'] as const
const SECRET_KEYS = new Set(['PSI_API_KEY', 'ANTHROPIC_API_KEY'])
const MAX_VALUE_LEN = 2000

function mask(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

export async function GET() {
  const out: Record<string, string> = {}
  for (const k of ALLOWED_KEYS) {
    const v = getSetting(k) ?? ''
    out[k] = SECRET_KEYS.has(k) ? mask(v) : v
  }
  return NextResponse.json({ settings: out })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  for (const [k, v] of Object.entries(body)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(k)) continue
    if (typeof v !== 'string') continue
    if (v.length > MAX_VALUE_LEN) continue
    // Don't overwrite a stored secret with the masked placeholder coming back from the form.
    if (SECRET_KEYS.has(k) && v.startsWith('••••')) continue
    setSetting(k, v)
  }
  return NextResponse.json({ ok: true })
}
