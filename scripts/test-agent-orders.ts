// Test the agent placing orders with its browser against a public deployment of the supplier site.
//   npx tsx --env-file=.env.local scripts/test-agent-orders.ts https://your-app.vercel.app
import { placeOrdersWithAgent } from '../lib/agent-orders'
import { groupBySupplier } from '../lib/place-orders'
import { verifyOrderCode } from '../lib/suppliers'

async function main() {
  const baseUrl = (process.argv[2] ?? '').replace(/\/$/, '')
  if (!baseUrl.startsWith('https://')) throw new Error('Pass the public https URL of the app')
  const groups = groupBySupplier([
    { id: 'oat-milk', order_qty: 26 },
    { id: 'avocados', order_qty: 35 },
    { id: 'croissants', order_qty: 31 },
    { id: 'sourdough', order_qty: 14 },
  ])
  const t0 = Date.now()
  const reports = await placeOrdersWithAgent(baseUrl, groups, (m) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`))
  console.log('\nAgent reported:', reports)
  for (const g of groups) {
    const r = reports.find((x) => x.slug === g.supplier.slug)
    console.log(`${g.supplier.name}: ${r ? r.code : 'no code'} -> ${r && verifyOrderCode(g.supplier, r.code, g.lines) ? 'VERIFIED' : 'not verified'}`)
  }
  console.log(`Took ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
