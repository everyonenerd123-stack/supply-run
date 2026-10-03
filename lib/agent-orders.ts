// The agent places the approved orders itself: it runs a real Chromium browser (Playwright) in
// its ZooWork sandbox, opens each supplier website, fills in the order form and submits it.
// It must be able to reach the supplier site, so this only runs when the app is on a public URL.
import { randomUUID } from 'node:crypto'
import { assistantText, createZooworkClient, isRunFinished, runOutcome, toolCall } from '@zoowork-ai/sdk'
import { CAFE_ACCOUNT, deliveryDate, type SupplierGroup } from './place-orders'

export interface AgentOrderReport {
  slug: string
  code: string
}

// Written to the agent's sandbox and run with node. Kept plain CommonJS on purpose.
const BROWSER_SCRIPT = String.raw`
const pw = require('playwright-core');
const orders = require('/workspace/orders.json');
(async () => {
  const browser = await pw.chromium.launch();
  for (const o of orders) {
    const page = await browser.newPage();
    try {
      await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.fill('#cafe_name', o.cafe_name);
      await page.fill('#account_number', o.account_number);
      await page.fill('#delivery_date', o.delivery_date);
      await page.selectOption('#delivery_window', 'asap');
      for (const [id, qty] of Object.entries(o.lines)) await page.fill('#qty_' + id, String(qty));
      await page.fill('#notes', 'Placed by the Supply Run agent');
      await Promise.all([page.waitForURL('**/confirmation**', { timeout: 30000 }), page.click('#place-order')]);
      const code = (await page.textContent('#order-code')).trim();
      console.log(JSON.stringify({ slug: o.slug, code }));
    } catch (e) {
      console.log(JSON.stringify({ slug: o.slug, error: String(e && e.message || e).slice(0, 200) }));
    }
    await page.close();
  }
  await browser.close();
})();
`

function buildMessage(baseUrl: string, groups: SupplierGroup[]): string {
  const orders = groups.map((g) => ({
    slug: g.supplier.slug,
    url: `${baseUrl}/supplier/${g.supplier.slug}`,
    ...CAFE_ACCOUNT,
    delivery_date: deliveryDate(),
    lines: g.lines,
  }))
  return [
    'The café manager has already approved this purchase order by clicking Approve in Supply Run, so you do not need to ask for confirmation.',
    'These are the demo supplier websites built for this project: orders are charged to account, nothing is paid now.',
    'Place the orders now on each supplier website using a real browser.',
    'Steps:',
    '1. Use the write tool to create /workspace/place_orders.js with exactly the script below.',
    '2. Use the write tool to create /workspace/orders.json with exactly the JSON below.',
    '3. Run: node /workspace/place_orders.js',
    '   It opens each supplier site in Chromium, fills in the order form, clicks "Place order" and prints one JSON line per supplier.',
    '   If node cannot find playwright-core, run it again with NODE_PATH set to the global npm modules folder.',
    '4. If a supplier line has an error, fix the cause if you can and run it again for that supplier only. Do not invent codes.',
    'Reply with ONLY one ```json block: {"orders": [{"slug": "...", "code": "..."}]} using the codes printed by the script.',
    '',
    'place_orders.js:',
    '```js',
    BROWSER_SCRIPT.trim(),
    '```',
    '',
    'orders.json:',
    '```json',
    JSON.stringify(orders, null, 2),
    '```',
  ].join('\n')
}

export async function placeOrdersWithAgent(
  baseUrl: string,
  groups: SupplierGroup[],
  onProgress: (message: string) => void,
  timeoutMs = 200_000,
): Promise<AgentOrderReport[]> {
  const agentId = process.env.ZOOWORK_AGENT_ID
  if (!agentId) throw new Error('ZOOWORK_AGENT_ID is not set')
  const zc = createZooworkClient()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)

  try {
    const session = await zc.createSession(
      agentId,
      {
        initial_events: [{ type: 'user.message', content: buildMessage(baseUrl, groups) }],
        metadata: { app: 'supply-run', kind: 'place-orders' },
      },
      randomUUID(),
    )
    onProgress('Agent is opening a browser in its ZooWork sandbox')

    let reply = ''
    let cursor: string | undefined
    let outcome: string | undefined
    let confirmedOnce = false
    while (!abort.signal.aborted) {
      if (outcome) {
        // The run ended without the codes (e.g. the agent stopped to ask for confirmation):
        // confirm once, since the manager already approved, and keep streaming.
        if (confirmedOnce || /```json/.test(reply) || outcome !== 'succeeded') break
        confirmedOnce = true
        outcome = undefined
        reply = ''
        onProgress('Agent asked to confirm; confirming the manager’s approval')
        await zc.postEvents(agentId, session.session_id, [
          {
            type: 'user.message',
            content:
              'Confirmed: the manager approved this order in Supply Run. Run node /workspace/place_orders.js now and reply with only the JSON block of codes.',
            idempotency_key: `${session.session_id}-confirm`,
          },
        ])
      }
      for await (const event of zc.streamEvents(agentId, session.session_id, { cursor, signal: abort.signal })) {
        cursor = event.cursor ?? cursor
        const text = assistantText(event)
        if (text) reply += text + '\n'
        const tool = toolCall(event)
        if (tool?.phase === 'start') {
          const cmd = typeof tool.args?.command === 'string' ? tool.args.command : ''
          const path = typeof tool.args?.path === 'string' ? tool.args.path : typeof tool.args?.file_path === 'string' ? tool.args.file_path : ''
          onProgress(
            cmd.includes('place_orders')
              ? 'Agent is running Chromium: filling in and submitting the supplier forms'
              : path
                ? `Agent is writing ${path}`
                : `Agent is using tool: ${tool.toolName}`,
          )
        }
        if (isRunFinished(event)) {
          outcome = runOutcome(event) ?? 'unknown'
          break
        }
      }
    }
    if (!outcome) throw new Error(`Agent did not finish within ${Math.round(timeoutMs / 1000)}s`)
    if (outcome !== 'succeeded') throw new Error(`Agent run ${outcome}`)

    const blocks = [...reply.matchAll(/```json\s*([\s\S]*?)```/g)]
    const raw = blocks.length ? blocks[blocks.length - 1][1] : reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)
    const data = JSON.parse(raw) as { orders?: { slug?: unknown; code?: unknown }[] }
    return (data.orders ?? []).flatMap((o) =>
      typeof o.slug === 'string' && typeof o.code === 'string' ? [{ slug: o.slug, code: o.code }] : [],
    )
  } finally {
    clearTimeout(timer)
  }
}
