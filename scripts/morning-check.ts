// Runs the morning check and prints the reorder list, then compares it with the answer key.
//
//   npm run check        -> asks the live ZooWork agent
//   npm run check:mock   -> skips ZooWork, instant mock result
import { forecastItems } from '../lib/forecast'
import { runMorningCheck } from '../lib/morning-check'

async function main() {
  const mock = process.argv.includes('--mock')
  console.log(mock ? 'Running morning check in MOCK mode...' : 'Running morning check with the ZooWork agent (30-90s)...')

  const result = await runMorningCheck({ mock, onProgress: (m) => console.log(`  ${m}`) })

  console.log(`\nSource: ${result.source}${result.fallback_reason ? `  (fell back because: ${result.fallback_reason})` : ''}`)
  console.log(`Took: ${(result.duration_ms / 1000).toFixed(1)}s`)
  console.log(`\nSummary: ${result.summary}\n`)

  console.log('REORDER (runs out in the next 24 hours):')
  console.table(
    result.reorder.map((l) => ({
      item: l.name,
      on_hand: `${l.on_hand} ${l.unit}`,
      forecast_24h: l.forecast_24h,
      order_qty: l.order_qty,
      cost: `$${l.line_cost_usd.toFixed(2)}`,
      supplier: l.usual_supplier,
      market: l.market_price_usd === null ? '-' : `$${l.market_price_usd.toFixed(2)} vs our $${l.unit_cost_usd.toFixed(2)}`,
    })),
  )
  for (const l of result.reorder) {
    console.log(`  ${l.name}: ${l.reason}`)
    console.log(`     market: ${l.market_note}${l.market_source_url ? ` <${l.market_source_url}>` : ''}`)
  }
  console.log(`Market prices from: ${result.market_source}`)

  console.log('\nLOW BUT OK TODAY:')
  for (const l of result.low_but_ok) console.log(`  ${l.name} (${l.days_of_cover} days): ${l.reason}`)

  const t = result.totals
  console.log(`\nOrder total: $${t.order_cost_usd.toFixed(2)}`)
  console.log(`Lost sales avoided today: ~$${t.est_lost_sales_avoided_usd.toFixed(2)}`)
  console.log(`Rush-order premium avoided: ~$${t.rush_premium_avoided_usd.toFixed(2)}`)

  // Did the agent's item list agree with the calculated numbers?
  if (result.source === 'agent') {
    if (result.corrections.length === 0) console.log('\nAgent agreed with the calculated numbers ✓')
    else console.log(`\nSafety check corrected the agent:\n${result.corrections.map((c) => `  - ${c}`).join('\n')}`)
  }

  // Final list vs the answer key (should always match: the list comes from the calculation)
  const expected = forecastItems().filter((f) => f.status === 'runs_out').map((f) => f.id).sort()
  const got = result.reorder.map((l) => l.id).sort()
  const match = JSON.stringify(expected) === JSON.stringify(got)
  console.log(match ? 'Final list matches reference ✓' : `Final list DOES NOT match reference ✗ (expected ${expected.join(', ')})`)
  if (!match) process.exitCode = 1
}

main().catch((err) => {
  console.error('Check failed:', err)
  process.exit(1)
})
