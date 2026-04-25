import { NextResponse } from 'next/server'
import { getStoredProfile, refreshSiteProfile } from '@/lib/profile'

export async function GET() {
  const stored = getStoredProfile()
  return NextResponse.json(stored ?? { profile: null })
}

export async function POST() {
  try {
    const { profile, hash } = await refreshSiteProfile()
    return NextResponse.json({ profile, hash, refreshedAt: Date.now() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
