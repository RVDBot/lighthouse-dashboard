import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getChatHistory, streamTurn } from '@/lib/chat'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const MAX_USER_TEXT = 10_000

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

  // Validate the audit_id ever existed as an opportunity (avoids creating chat
  // history for arbitrary strings).
  const known = getDb().prepare(`SELECT 1 FROM opportunities WHERE audit_id = ? LIMIT 1`).get(auditId)
  if (!known) {
    return NextResponse.json({ error: 'onbekende auditId' }, { status: 400 })
  }

  const userText = typeof body.userText === 'string' ? body.userText : ''
  if (userText.length > MAX_USER_TEXT) {
    return NextResponse.json({ error: `userText te lang (max ${MAX_USER_TEXT})` }, { status: 400 })
  }

  const pendingMessageId = typeof body.pendingMessageId === 'number' ? body.pendingMessageId : null

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamTurn({
          auditId,
          userText,
          pendingMessageId,
          model: body.model === 'escalated' ? 'escalated' : 'default',
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
      } catch (e) {
        // Log the real error server-side; surface a generic message to the client
        // so secrets / config-name leaks can't reach the browser.
        const realMsg = e instanceof Error ? e.message : String(e)
        log('error', 'chat', 'streamTurn faalde', { error: realMsg, auditId })
        const isConfig = /VAPID|API_KEY|niet geconfigureerd/i.test(realMsg)
        const clientMsg = isConfig ? 'Server-configuratie incompleet' : 'Er ging iets mis bij het versturen'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: clientMsg })}\n\n`))
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
