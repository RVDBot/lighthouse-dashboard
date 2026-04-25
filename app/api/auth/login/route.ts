import { NextRequest, NextResponse } from 'next/server'
import { signToken, verifyPassword } from '@/lib/security'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Ongeldig' }, { status: 401 })
  }
  const token = await signToken('operator')
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
