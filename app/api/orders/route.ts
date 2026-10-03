// Places the approved purchase order with each supplier. Streams progress like the morning check.
import { groupBySupplier, placeByBackup, type ApprovedLine } from '@/lib/place-orders'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { lines?: ApprovedLine[]; mock?: boolean }
  const groups = groupBySupplier(body.lines ?? [])
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      const t0 = Date.now()
      try {
        for (const group of groups) {
          send({ type: 'progress', message: `Placing order with ${group.supplier.name}`, ms: Date.now() - t0 })
          const order = placeByBackup(group)
          send({ type: 'order', order, ms: Date.now() - t0 })
        }
        send({ type: 'done', ms: Date.now() - t0 })
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
