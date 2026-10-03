'use client'
// The Supply Run dashboard: inventory + 7-day sales, "Run morning check", the purchase order,
// Approve/Reject, and the orders placed with suppliers.
import { useMemo, useState } from 'react'
import type { Inventory, Sales } from '@/lib/data'
import { forecastItems, type StockStatus } from '@/lib/forecast'
import type { MorningCheckResult } from '@/lib/morning-check'
import type { PlacedOrder } from '@/lib/place-orders'
import { formatUnitPrice } from '@/lib/units'

type Phase = 'idle' | 'checking' | 'review' | 'placing' | 'placed' | 'rejected'
type FeedLine = { ms: number; message: string; tone?: 'ok' | 'warn' }
type OrderRow = PlacedOrder & { verified?: boolean }

const ICONS: Record<string, string> = {
  'oat-milk': '🥛', 'whole-milk': '🥛', 'almond-milk': '🥛', butter: '🧈', cheddar: '🧀', eggs: '🥚',
  avocados: '🥑', spinach: '🥬', croissants: '🥐', sourdough: '🍞', bacon: '🥓', 'espresso-beans': '☕',
  matcha: '🍵', 'vanilla-syrup': '🍯', 'cups-12oz': '🥤',
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function readNdjson(res: Response, onLine: (obj: any) => void) {
  if (!res.body) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) onLine(JSON.parse(line))
  }
  if (buffer.trim()) onLine(JSON.parse(buffer))
}

export function Dashboard({ inventory, sales }: { inventory: Inventory; sales: Sales }) {
  const defaults = useMemo(() => Object.fromEntries(inventory.items.map((i) => [i.id, i.on_hand])), [inventory])
  const [onHand, setOnHand] = useState<Record<string, number>>(defaults)
  const [mock, setMock] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [feed, setFeed] = useState<FeedLine[]>([])
  const [result, setResult] = useState<MorningCheckResult | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  // "Need today" numbers the manager typed in; items not listed use our forecast.
  const [need, setNeed] = useState<Record<string, number>>({})

  const edited = inventory.items.some((i) => onHand[i.id] !== i.on_hand) || Object.keys(need).length > 0
  const liveInventory = useMemo(
    () => ({
      ...inventory,
      items: inventory.items.map((i) => ({
        ...i,
        on_hand: onHand[i.id] ?? i.on_hand,
        ...(need[i.id] !== undefined ? { need_today: need[i.id] } : {}),
      })),
    }),
    [inventory, onHand, need],
  )
  const forecasts = useMemo(() => forecastItems(liveInventory, sales), [liveInventory, sales])
  const counts = { out: forecasts.filter((f) => f.status === 'runs_out').length, low: forecasts.filter((f) => f.status === 'low').length }

  const log = (message: string, ms = 0, tone?: FeedLine['tone']) => setFeed((f) => [...f, { ms, message, tone }])

  async function runCheck() {
    setPhase('checking')
    setFeed([])
    setResult(null)
    setOrders([])
    try {
      const overrides = Object.fromEntries(inventory.items.filter((i) => onHand[i.id] !== i.on_hand).map((i) => [i.id, onHand[i.id]]))
      const res = await fetch('/api/morning-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mock, onHand: overrides, need }),
      })
      await readNdjson(res, (msg) => {
        if (msg.type === 'progress') log(msg.message, msg.ms)
        if (msg.type === 'error') log(`Error: ${msg.message}`, 0, 'warn')
        if (msg.type === 'result') {
          const r = msg.result as MorningCheckResult
          setResult(r)
          if (r.fallback_reason) log(`Fell back to mock result: ${r.fallback_reason}`, r.duration_ms, 'warn')
          if (r.corrections.length) r.corrections.forEach((c) => log(`Safety check: ${c}`, r.duration_ms, 'warn'))
          log(`Done in ${(r.duration_ms / 1000).toFixed(1)}s: ${r.reorder.length} items to reorder`, r.duration_ms, 'ok')
        }
      })
      setPhase('review')
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`, 0, 'warn')
      setPhase('idle')
    }
  }

  async function approve() {
    if (!result) return
    setPhase('placing')
    setOrders([])
    log('Manager approved the purchase order', 0, 'ok')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mock, lines: result.reorder.map((l) => ({ id: l.id, order_qty: l.order_qty })) }),
      })
      await readNdjson(res, async (msg) => {
        if (msg.type === 'progress') log(msg.message, msg.ms)
        if (msg.type === 'error') log(`Error: ${msg.message}`, 0, 'warn')
        if (msg.type === 'order') {
          const order = msg.order as PlacedOrder
          setOrders((o) => [...o, order])
          log(`${order.supplier} confirmed order ${order.code}`, msg.ms, 'ok')
          const v = await fetch('/api/supplier/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: order.slug, code: order.code, lines: order.lines }),
          }).then((r) => r.json())
          setOrders((o) => o.map((x) => (x.code === order.code ? { ...x, verified: v.valid } : x)))
        }
      })
      setPhase('placed')
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`, 0, 'warn')
      setPhase('review')
    }
  }

  function reject() {
    setPhase('rejected')
    log('Manager rejected the purchase order. Nothing was ordered.', 0, 'warn')
  }

  const step = phase === 'idle' || phase === 'checking' ? (result ? 2 : 1) : phase === 'review' || phase === 'rejected' ? 3 : 4
  // What the café spent on the supplies it used over the last 7 days (usage x unit cost).
  const weekSpend = inventory.items.reduce(
    (sum, item) => sum + (sales.usage_by_item[item.id] ?? []).reduce((a, b) => a + b, 0) * item.unit_cost_usd,
    0,
  )
  const maxRevenue = Math.max(...sales.revenue_usd)
  const bySupplier = groupLines(result)

  return (
    <div className="min-h-screen">
      {/* Header, as in the mockup */}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-lg text-white">⇅</div>
            <span className="text-lg font-bold">Supply Run</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {['Stock', 'Check', 'Order', 'Placed'].map((label, i) => (
              <span
                key={label}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${step === i + 1 ? 'bg-brand text-white' : 'text-muted'}`}
              >
                <span className={`grid size-5 place-items-center rounded-full text-xs ${step === i + 1 ? 'bg-white/20' : 'border border-line'}`}>{i + 1}</span>
                {label}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted">🏪 {inventory.cafe}</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* Title + main action */}
        <section className="flex flex-wrap items-end gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Morning stock check</h1>
            <p className="mt-1 text-sm text-muted">
              Stock counted {new Date(inventory.as_of).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Forecast covers the next 24 hours.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
              Mock mode
            </label>
            <button
              onClick={runCheck}
              disabled={phase === 'checking' || phase === 'placing'}
              className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
            >
              {phase === 'checking' ? 'Agent is working…' : 'Run morning check'}
            </button>
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Supply spend, last 7 days" value={usd(weekSpend)} />
          <Kpi label="Run out in 24h" value={String(counts.out)} tone="danger" />
          <Kpi label="Low but OK" value={String(counts.low)} tone="warn" />
          <Kpi label="Today’s order" value={result && phase !== 'checking' ? usd(result.totals.order_cost_usd) : '–'} />
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Inventory */}
          <section className="overflow-hidden rounded-xl border border-line bg-white lg:col-span-2">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <h2 className="font-semibold">Inventory</h2>
              <span className="text-xs text-muted">Edit “On hand” or “Need today”, then run the check</span>
              {edited && (
                <button
                  onClick={() => {
                    setOnHand(defaults)
                    setNeed({})
                  }}
                  className="ml-auto text-sm font-medium text-brand hover:underline"
                >
                  Reset to demo data
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">On hand</th>
                    <th className="px-3 py-2 font-medium" title="Our forecast: the higher of the 7-day average and the same day last week. Type your own number to override it.">
                      Need today ⓘ
                    </th>
                    <th className="px-3 py-2 font-medium">Par</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map((f) => (
                    <tr key={f.id} className="border-t border-line/70">
                      <td className="px-5 py-2">
                        <span className="mr-2">{ICONS[f.id]}</span>
                        {f.name}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`On hand ${f.name}`}
                          value={onHand[f.id]}
                          onChange={(e) => setOnHand((o) => ({ ...o, [f.id]: Math.max(0, Number(e.target.value) || 0) }))}
                          className={`w-20 rounded-md border px-2 py-1 text-right ${onHand[f.id] !== defaults[f.id] ? 'border-brand bg-blue-50' : 'border-line'}`}
                        />
                        <span className="ml-1.5 text-xs text-muted">{f.unit}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Need today ${f.name}`}
                          value={f.forecast_24h}
                          onChange={(e) => setNeed((n) => ({ ...n, [f.id]: Math.max(0, Number(e.target.value) || 0) }))}
                          className={`w-20 rounded-md border px-2 py-1 text-right ${need[f.id] !== undefined ? 'border-brand bg-blue-50' : 'border-line'}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-muted">{f.par_level}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={f.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="space-y-6">
            {/* Sales chart */}
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Sales, last 7 days</h2>
              <div className="mt-4 flex h-36 items-end gap-2">
                {sales.revenue_usd.map((rev, i) => (
                  <div key={sales.dates[i]} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted">${(rev / 1000).toFixed(1)}k</span>
                    <div className="w-full rounded-t bg-brand/80" style={{ height: `${(rev / maxRevenue) * 100}px` }} />
                    <span className="text-xs text-muted">{sales.weekdays[i]}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Live activity feed */}
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Agent activity</h2>
                {result && <SourceBadge result={result} />}
              </div>
              {feed.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Click “Run morning check” to watch the agent work.</p>
              ) : (
                <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm">
                  {feed.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-10 shrink-0 text-right font-mono text-xs leading-5 text-muted">{(line.ms / 1000).toFixed(1)}s</span>
                      <span className={line.tone === 'ok' ? 'text-ok' : line.tone === 'warn' ? 'text-amber-700' : ''}>{line.message}</span>
                    </li>
                  ))}
                  {(phase === 'checking' || phase === 'placing') && <li className="animate-pulse pl-12 text-muted">working…</li>}
                </ol>
              )}
            </section>
          </div>
        </div>

        {/* Purchase order, as in the mockup */}
        {result && phase !== 'checking' && (
          <section className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold">Purchase order</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted">{result.summary}</p>
              </div>
            </div>

            {bySupplier.map(([supplier, lines]) => (
              <div key={supplier} className="border-b border-line px-5 py-4">
                <div className="flex items-center gap-2 font-semibold">
                  🚚 {supplier}
                  <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">Usual supplier</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-1 font-medium">Item</th>
                        <th className="py-1 font-medium">Quantity</th>
                        <th className="py-1 font-medium">Unit price</th>
                        <th className="py-1 font-medium">Price online</th>
                        <th className="py-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-t border-line/70 align-top">
                          <td className="py-2 pr-3">
                            <div className="font-medium">
                              {ICONS[l.id]} {l.name}
                            </div>
                            <div className="mt-0.5 max-w-sm text-xs text-muted">{l.reason}</div>
                          </td>
                          <td className="py-2 pr-3">{l.order_qty}</td>
                          <td className="py-2 pr-3">{formatUnitPrice(l.unit_cost_usd, l.unit)}</td>
                          <td className="py-2 pr-3 text-xs">
                            {l.market_price_usd !== null ? (
                              <>
                                <span className="font-medium">{formatUnitPrice(l.market_price_usd, l.unit)}</span>{' '}
                                <span className={l.market_price_usd >= l.unit_cost_usd ? 'text-ok' : 'text-amber-700'}>
                                  {l.market_price_usd >= l.unit_cost_usd ? '· our price is better' : '· cheaper elsewhere'}
                                </span>
                                {l.market_source_url && (
                                  <a href={l.market_source_url} target="_blank" rel="noreferrer" className="block truncate text-brand hover:underline">
                                    {hostOf(l.market_source_url)}
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-muted">{l.market_note}</span>
                            )}
                          </td>
                          <td className="py-2 text-right font-medium">{usd(l.line_cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="rounded-lg bg-ok-soft px-4 py-3 text-sm">
                <div className="font-semibold text-ok">Why order now</div>
                <ul className="mt-1 space-y-0.5 text-ink">
                  <li>
                    Protects about <b>{usd(result.totals.est_lost_sales_avoided_usd)}</b> of potential sales today that would be lost when these items run out.
                  </li>
                  <li>
                    Saves about <b>{usd(result.totals.rush_premium_avoided_usd)}</b> compared with an emergency delivery later, which suppliers charge ~
                    {inventory.rush_order_premium_pct}% extra for.
                  </li>
                </ul>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xs text-muted">Total</div>
                <div className="text-2xl font-bold">{usd(result.totals.order_cost_usd)}</div>
              </div>
            </div>

            {phase === 'review' && (
              <div className="flex gap-3 px-5 pb-5">
                <button onClick={reject} className="rounded-lg border border-line px-5 py-3 font-semibold hover:bg-gray-50">
                  Reject
                </button>
                <button onClick={approve} className="flex-1 rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-dark">
                  ✓ Approve order
                </button>
              </div>
            )}
            {phase === 'rejected' && <div className="px-5 pb-5 text-sm text-amber-700">Rejected. Nothing was ordered. Run the check again any time.</div>}
          </section>
        )}

        {/* Orders placed */}
        {(phase === 'placing' || phase === 'placed') && (
          <section className="rounded-xl border border-line bg-white p-6">
            <div className="text-center">
              <div className={`mx-auto grid size-14 place-items-center rounded-full text-2xl text-white ${phase === 'placed' ? 'bg-ok' : 'animate-pulse bg-brand'}`}>
                {phase === 'placed' ? '✓' : '…'}
              </div>
              <h2 className="mt-3 text-2xl font-bold">{phase === 'placed' ? 'Order approved and placed' : 'Placing orders with suppliers…'}</h2>
              <p className="mt-1 text-sm text-muted">One order per supplier, charged to the café’s account.</p>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {orders.map((o) => (
                <div key={o.code} className="rounded-lg border border-line p-4 text-sm">
                  <div className="font-semibold">{o.supplier}</div>
                  <div className="mt-1 font-mono text-lg">{o.code}</div>
                  <div className="mt-1 text-muted">{usd(o.total_usd)} · {Object.keys(o.lines).length} item(s)</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${o.placed_by === 'agent' ? 'bg-blue-50 text-brand' : 'bg-amber-50 text-amber-800'}`}>
                      {o.placed_by === 'agent' ? 'Submitted by agent' : 'Submitted by backup'}
                    </span>
                    {o.verified === true && <span className="rounded-full bg-ok-soft px-2 py-0.5 font-medium text-ok">Verified by supplier ✓</span>}
                    {o.verified === false && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">Not verified</span>}
                  </div>
                  <a href={o.confirmation_url} target="_blank" rel="noreferrer" className="mt-3 block font-medium text-brand hover:underline">
                    Open supplier confirmation ↗
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function groupLines(result: MorningCheckResult | null) {
  const map = new Map<string, MorningCheckResult['reorder']>()
  for (const l of result?.reorder ?? []) map.set(l.usual_supplier, [...(map.get(l.usual_supplier) ?? []), l])
  return [...map.entries()]
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warn' }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-amber-600' : 'text-ink'
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: StockStatus }) {
  const map = {
    runs_out: ['Runs out', 'bg-danger-soft text-danger'],
    low: ['Low', 'bg-amber-50 text-amber-700'],
    ok: ['OK', 'bg-ok-soft text-ok'],
  } as const
  const [label, cls] = map[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

function SourceBadge({ result }: { result: MorningCheckResult }) {
  return result.source === 'agent' ? (
    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-brand">● Live agent</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">Mock</span>
  )
}
