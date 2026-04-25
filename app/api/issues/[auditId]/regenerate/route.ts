import { NextRequest, NextResponse } from 'next/server'
import { generateAdviceForIssue } from '@/lib/advice'
import { escalatedModel, defaultModel } from '@/lib/claude'

export async function POST(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  const body = await req.json().catch(() => ({})) as { model?: 'default' | 'escalated' }
  const model = body.model === 'escalated' ? escalatedModel() : defaultModel()
  try {
    const result = await generateAdviceForIssue({ auditId, model })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
