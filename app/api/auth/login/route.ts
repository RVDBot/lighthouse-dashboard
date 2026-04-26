import { NextRequest, NextResponse } from 'next/server'
import { signToken, verifyPassword } from '@/lib/security'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'onbekend'
  if (!verifyPassword(password)) {
    log('warn', 'auth', 'Login geweigerd', { ip })
    return NextResponse.json({ error: 'Ongeldig' }, { status: 401 })
  }
  const token = await signToken('operator')
  log('info', 'auth', 'Login geslaagd', { ip })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('lh_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
  return res
}
