// Runs the morning check and streams progress lines to the dashboard as they happen.
// Response is newline-delimited JSON: {"type":"progress",...} lines, then one {"type":"result",...}.
import { runMorningCheck } from '@/lib/morning-check'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    mock?: boolean
    onHand?: Record<string, number>
    need?: Record<string, number>
  }
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      const t0 = Date.now()
      send({ type: 'progress', message: body.mock ? 'Running in mock mode (no live APIs)' : 'Sending stock and sales data to the ZooWork agent', ms: 0 })
      try {
        const result = await runMorningCheck({
          mock: body.mock,
          onHandOverrides: body.onHand,
          needOverrides: body.need,
          timeoutMs: 100_000,
          onProgress: (message) => send({ type: 'progress', message, ms: Date.now() - t0 }),
        })
        send({ type: 'result', result })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
