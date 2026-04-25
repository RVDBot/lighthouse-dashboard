import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/security'

export const runtime = 'nodejs'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const token = req.cookies.get('lh_auth')?.value
  if (token && (await verifyToken(token))) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
}
