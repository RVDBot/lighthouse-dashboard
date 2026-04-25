import { NextRequest, NextResponse } from 'next/server'
import { getChatHistory, streamTurn } from '@/lib/chat'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  return NextResponse.json({ messages: getChatHistory(auditId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  const body = await req.json().catch(() => ({})) as {
    userText?: string
    pendingMessageId?: number | null
    model?: 'default' | 'escalated'
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamTurn({
          auditId,
          userText: body.userText ?? '',
          pendingMessageId: body.pendingMessageId ?? null,
          model: body.model ?? 'default',
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
