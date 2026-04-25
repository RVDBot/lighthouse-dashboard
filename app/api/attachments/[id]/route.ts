import { NextRequest, NextResponse } from 'next/server'
import { readAttachment } from '@/lib/attachments'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = readAttachment(parseInt(id, 10))
  if (!a) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return new NextResponse(new Uint8Array(a.buffer), {
    headers: {
      'Content-Type': a.mime,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
