import { NextRequest, NextResponse } from 'next/server'
import { generateAdviceForIssue } from '@/lib/advice'
import type { ModelKey } from '@/lib/claude'

const ALLOWED: ModelKey[] = ['haiku', 'sonnet', 'opus']

export async function POST(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  const body = await req.json().catch(() => ({})) as { model?: ModelKey }
  const modelKey: ModelKey = ALLOWED.includes(body.model as ModelKey) ? (body.model as ModelKey) : 'haiku'
  try {
    const result = await generateAdviceForIssue({ auditId, modelKey })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
