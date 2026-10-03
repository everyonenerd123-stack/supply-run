// Places the approved purchase order with each supplier. Streams progress like the morning check.
// 1. If the app is on a public URL, the agent fills in each supplier form with a real browser.
// 2. Any supplier the agent did not complete (or every supplier, locally / in mock mode) is
//    submitted by our server instead, and labelled "Submitted by backup".
import { placeOrdersWithAgent, type AgentOrderReport } from '@/lib/agent-orders'
import { CAFE_ACCOUNT, deliveryDate, groupBySupplier, placeByBackup, type ApprovedLine, type PlacedOrder } from '@/lib/place-orders'
import { confirmationFor } from '@/lib/supplier-orders'
import { verifyOrderCode } from '@/lib/suppliers'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { lines?: ApprovedLine[]; mock?: boolean }
  const groups = groupBySupplier(body.lines ?? [])
  const baseUrl = (process.env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const isPublic = !/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(baseUrl)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      const t0 = Date.now()
      const progress = (message: string) => send({ type: 'progress', message, ms: Date.now() - t0 })
      try {
        let reports: AgentOrderReport[] = []
        let backupNote = ''
        if (body.mock) {
          backupNote = 'Mock mode'
        } else if (!isPublic) {
          backupNote = "Running locally: the agent's cloud browser can't reach localhost"
          progress(`${backupNote}. Using the backup to submit the forms.`)
        } else {
          progress(`Asking the agent to place ${groups.length} orders on the supplier websites`)
          try {
            reports = await placeOrdersWithAgent(baseUrl, groups, progress)
          } catch (err) {
            backupNote = `Agent could not finish: ${err instanceof Error ? err.message : String(err)}`
            progress(`${backupNote}. Using the backup for the rest.`)
          }
        }

        for (const group of groups) {
          const report = reports.find((r) => r.slug === group.supplier.slug)
          let order: PlacedOrder
          if (report && verifyOrderCode(group.supplier, report.code, group.lines)) {
            order = {
              ...confirmationFor(group.supplier, report.code.trim().toUpperCase(), group.lines, {
                ...CAFE_ACCOUNT,
                delivery_date: deliveryDate(),
                delivery_window: 'asap',
              }),
              slug: group.supplier.slug,
              placed_by: 'agent',
            }
          } else {
            if (report) progress(`Code from agent for ${group.supplier.name} did not verify; using backup`)
            order = placeByBackup(group, backupNote || 'Agent did not report this order')
          }
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
