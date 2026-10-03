// The morning check: send the café data to the ZooWork agent, read back its reorder list.
// If anything goes wrong (or mock mode is on) we return the plain-code answer instead,
// labelled source: 'mock', so the demo never breaks.
import { randomUUID } from 'node:crypto'
import {
  assistantText,
  createZooworkClient,
  isRunFinished,
  runOutcome,
  toolCall,
} from '@zoowork-ai/sdk'
import { CHECK_INSTRUCTIONS } from './agent-config'
import { inventory, sales } from './data'
import { forecastItems, orderQuantity, round2, type ItemForecast } from './forecast'

export interface ReorderLine {
  id: string
  name: string
  unit: string
  on_hand: number
  forecast_24h: number
  order_qty: number
  unit_cost_usd: number
  line_cost_usd: number
  est_lost_sales_usd: number
  usual_supplier: string
  reason: string
}

export interface LowItem {
  id: string
  name: string
  days_of_cover: number
  reason: string
}

export interface MorningCheckResult {
  cafe: string
  as_of: string
  source: 'agent' | 'mock'
  /** Why we fell back to mock, if we did. */
  fallback_reason?: string
  summary: string
  reorder: ReorderLine[]
  low_but_ok: LowItem[]
  /** Where our numbers overrode the agent's item list (agent mode only). */
  corrections: string[]
  totals: {
    order_cost_usd: number
    est_lost_sales_avoided_usd: number
    rush_premium_avoided_usd: number
  }
  session_id?: string
  duration_ms: number
}

export interface MorningCheckOptions {
  mock?: boolean
  timeoutMs?: number
  /** Progress messages for the terminal or UI ("agent is thinking", "tool: python", ...). */
  onProgress?: (message: string) => void
}

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === '1' || process.env.MOCK_MODE === 'true'
}

export async function runMorningCheck(opts: MorningCheckOptions = {}): Promise<MorningCheckResult> {
  const started = Date.now()
  if (opts.mock || isMockMode()) {
    return referenceCheck({ started })
  }
  try {
    return await agentCheck(opts, started)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    opts.onProgress?.(`Agent check failed, using mock result: ${message}`)
    return referenceCheck({ started, fallbackReason: message })
  }
}

// ---------------------------------------------------------------------------
// Live agent path

async function agentCheck(opts: MorningCheckOptions, started: number): Promise<MorningCheckResult> {
  const agentId = process.env.ZOOWORK_AGENT_ID
  if (!agentId) throw new Error('ZOOWORK_AGENT_ID is not set. Run `npm run setup-agent` first.')

  const zc = createZooworkClient()
  const timeoutMs = opts.timeoutMs ?? 180_000
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)

  try {
    const session = await zc.createSession(
      agentId,
      {
        initial_events: [{ type: 'user.message', content: buildMessage() }],
        metadata: { app: 'supply-run', kind: 'morning-check' },
      },
      randomUUID(),
    )
    opts.onProgress?.(`Session ${session.session_id} started, waiting for the agent...`)

    let reply = ''
    let cursor: string | undefined
    let outcome: string | undefined

    // The stream can close on idle before the run ends; reopen it from the last cursor.
    while (!outcome && !abort.signal.aborted) {
      const stream = zc.streamEvents(agentId, session.session_id, { cursor, signal: abort.signal })
      for await (const event of stream) {
        cursor = event.cursor ?? cursor
        const text = assistantText(event)
        if (text) reply += text + '\n'
        const tool = toolCall(event)
        if (tool?.phase === 'start') opts.onProgress?.(`Agent is using tool: ${tool.toolName}`)
        if (isRunFinished(event)) {
          outcome = runOutcome(event) ?? 'unknown'
          break
        }
      }
    }

    if (!outcome) throw new Error(`Agent did not finish within ${Math.round(timeoutMs / 1000)}s`)
    if (outcome !== 'succeeded') throw new Error(`Agent run ${outcome}`)

    const parsed = parseAgentReply(reply)
    if (parsed.reorder.length === 0) throw new Error('Agent returned an empty reorder list')
    return buildResult({
      source: 'agent',
      started,
      sessionId: session.session_id,
      summary: parsed.summary,
      reorder: parsed.reorder,
      lowButOk: parsed.low_but_ok,
    })
  } finally {
    clearTimeout(timer)
  }
}

function buildMessage(): string {
  const forecastTable = forecastItems().map((f) => ({
    id: f.id,
    name: f.name,
    unit: f.unit,
    on_hand: f.on_hand,
    par_level: f.par_level,
    avg_daily: f.avg_daily,
    same_weekday_last_week: f.same_weekday_last_week,
    forecast_24h: f.forecast_24h,
    days_of_cover: f.days_of_cover,
    runs_out: f.status === 'runs_out',
    low: f.status === 'low',
    order_qty: f.status === 'runs_out' ? orderQuantity(f.on_hand, f.par_level) : 0,
  }))
  return [
    CHECK_INSTRUCTIONS,
    '',
    'forecast (pre-calculated by the café system):',
    '```json',
    JSON.stringify(forecastTable),
    '```',
    '',
    'inventory.json:',
    '```json',
    JSON.stringify(inventory),
    '```',
    '',
    'sales.json:',
    '```json',
    JSON.stringify(sales),
    '```',
  ].join('\n')
}

interface AgentReply {
  summary: string
  reorder: { id: string; forecast_24h?: number; order_qty?: number; reason?: string }[]
  low_but_ok: { id: string; reason?: string }[]
}

/** Pull the last ```json block (or the last {...}) out of the agent's reply. */
export function parseAgentReply(reply: string): AgentReply {
  const blocks = [...reply.matchAll(/```json\s*([\s\S]*?)```/g)]
  let raw = blocks.length ? blocks[blocks.length - 1][1] : ''
  if (!raw) {
    const first = reply.indexOf('{')
    const last = reply.lastIndexOf('}')
    if (first >= 0 && last > first) raw = reply.slice(first, last + 1)
  }
  if (!raw) throw new Error('Agent reply had no JSON block')

  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Agent reply JSON could not be parsed')
  }
  if (!Array.isArray(data?.reorder)) throw new Error('Agent reply JSON has no "reorder" list')

  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    reorder: data.reorder.filter((r: any) => typeof r?.id === 'string'),
    low_but_ok: Array.isArray(data.low_but_ok) ? data.low_but_ok.filter((r: any) => typeof r?.id === 'string') : [],
  }
}

// ---------------------------------------------------------------------------
// Mock / reference path

function referenceCheck({ started, fallbackReason }: { started: number; fallbackReason?: string }): MorningCheckResult {
  const forecasts = forecastItems()
  const out = forecasts.filter((f) => f.status === 'runs_out')
  const low = forecasts.filter((f) => f.status === 'low')

  return buildResult({
    source: 'mock',
    started,
    fallbackReason,
    summary: `${out.length} items will run out during today's service: ${out.map((f) => f.name.toLowerCase()).join(', ')}. ${low.length} more are low but will last the day.`,
    reorder: out.map((f) => ({ id: f.id, reason: referenceReason(f) })),
    lowButOk: low.map((f) => ({ id: f.id, reason: lowReason(f) })),
  })
}

function referenceReason(f: ItemForecast): string {
  const hoursLeft = Math.max(1, Math.round((f.on_hand / f.forecast_24h) * 24))
  return `Only ${f.on_hand} on hand vs ~${f.forecast_24h} needed today; runs out in about ${hoursLeft} hours.`
}

function lowReason(f: ItemForecast): string {
  return `About ${f.days_of_cover.toFixed(1)} days of stock left. Fine today, reorder in the next day or two.`
}

// ---------------------------------------------------------------------------
// Shared: build the final lists. Which items are reordered, quantities and costs always come
// from our calculation (exact). The agent supplies the wording (reasons + summary).
// If the agent's list disagrees with the numbers, we correct it and record what changed.

function buildResult(input: {
  source: 'agent' | 'mock'
  started: number
  sessionId?: string
  fallbackReason?: string
  summary: string
  reorder: AgentReply['reorder']
  lowButOk: AgentReply['low_but_ok']
}): MorningCheckResult {
  const forecasts = forecastItems()
  const items = new Map(inventory.items.map((i) => [i.id, i]))
  const agentReorder = new Map(input.reorder.map((r) => [r.id, r]))
  const agentLow = new Map(input.lowButOk.map((r) => [r.id, r]))
  const corrections: string[] = []

  for (const id of agentReorder.keys()) {
    const f = forecasts.find((x) => x.id === id)
    if (f && f.status !== 'runs_out') {
      corrections.push(`Removed ${f.name}: ${f.on_hand} on hand covers the ${f.forecast_24h} forecast`)
    }
  }

  const reorder: ReorderLine[] = forecasts
    .filter((f) => f.status === 'runs_out')
    .map((f) => {
      const item = items.get(f.id)!
      const agentReason = agentReorder.get(f.id)?.reason?.trim()
      if (!agentReason) corrections.push(`Added ${f.name}: ${f.on_hand} on hand is below the ${f.forecast_24h} forecast`)
      const qty = orderQuantity(f.on_hand, f.par_level)
      return {
        id: f.id,
        name: f.name,
        unit: f.unit,
        on_hand: f.on_hand,
        forecast_24h: f.forecast_24h,
        order_qty: qty,
        unit_cost_usd: item.unit_cost_usd,
        line_cost_usd: round2(qty * item.unit_cost_usd),
        est_lost_sales_usd: round2((f.forecast_24h - f.on_hand) * item.est_revenue_per_unit_usd),
        usual_supplier: item.usual_supplier,
        reason: agentReason || referenceReason(f),
      }
    })

  const low_but_ok: LowItem[] = forecasts
    .filter((f) => f.status === 'low')
    .map((f) => ({
      id: f.id,
      name: f.name,
      days_of_cover: f.days_of_cover,
      reason: agentLow.get(f.id)?.reason?.trim() || lowReason(f),
    }))

  const orderCost = reorder.reduce((sum, l) => sum + l.line_cost_usd, 0)
  return {
    cafe: inventory.cafe,
    as_of: inventory.as_of,
    source: input.source,
    fallback_reason: input.fallbackReason,
    summary: input.summary,
    reorder,
    low_but_ok,
    corrections: input.source === 'agent' ? corrections : [],
    totals: {
      order_cost_usd: round2(orderCost),
      est_lost_sales_avoided_usd: round2(reorder.reduce((sum, l) => sum + l.est_lost_sales_usd, 0)),
      rush_premium_avoided_usd: round2((orderCost * inventory.rush_order_premium_pct) / 100),
    },
    session_id: input.sessionId,
    duration_ms: Date.now() - input.started,
  }
}
