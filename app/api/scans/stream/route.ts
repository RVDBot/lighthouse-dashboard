import { subscribeScanProgress, type ScanProgressEvent } from '@/lib/scan'

export const runtime = 'nodejs'

export async function GET() {
  const encoder = new TextEncoder()
  let unsub: (() => void) | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: ScanProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      unsub = subscribeScanProgress(send)
      keepalive = setInterval(() => controller.enqueue(encoder.encode(': keepalive\n\n')), 20_000)
    },
    cancel() {
      if (unsub) unsub()
      if (keepalive) clearInterval(keepalive)
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
