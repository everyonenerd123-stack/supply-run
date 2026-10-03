// Plain-code forecast. It uses the same rules we give the agent, so it is both
// the answer key for checking the agent and the result shown in mock mode.
import { inventory as defaultInventory, sales as defaultSales, type Inventory, type Sales } from './data'

export const LOW_DAYS_OF_COVER = 3

export type StockStatus = 'runs_out' | 'low' | 'ok'

export interface ItemForecast {
  id: string
  name: string
  category: string
  unit: string
  on_hand: number
  par_level: number
  avg_daily: number
  same_weekday_last_week: number
  forecast_24h: number
  days_of_cover: number
  status: StockStatus
}

export const round2 = (n: number) => Math.round(n * 100) / 100

// "2026-10-03T07:00:00" minus 7 days -> "2026-09-26"
function dateWeekBefore(asOf: string): string {
  const d = new Date(asOf.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

export function forecastItems(inv: Inventory = defaultInventory, s: Sales = defaultSales): ItemForecast[] {
  const lastWeekIndex = s.dates.indexOf(dateWeekBefore(inv.as_of))

  return inv.items.map((item) => {
    const usage = s.usage_by_item[item.id] ?? []
    const avg = usage.length ? usage.reduce((a, b) => a + b, 0) / usage.length : 0
    const sameDay = lastWeekIndex >= 0 ? (usage[lastWeekIndex] ?? 0) : 0
    const forecast = Math.max(avg, sameDay)
    const daysOfCover = avg > 0 ? item.on_hand / avg : Infinity

    const status: StockStatus =
      item.on_hand < forecast ? 'runs_out' : daysOfCover < LOW_DAYS_OF_COVER ? 'low' : 'ok'

    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      on_hand: item.on_hand,
      par_level: item.par_level,
      avg_daily: round2(avg),
      same_weekday_last_week: sameDay,
      forecast_24h: round2(forecast),
      days_of_cover: round2(daysOfCover),
      status,
    }
  })
}

/** Top up to par, in whole units. */
export function orderQuantity(onHand: number, parLevel: number): number {
  return Math.max(0, Math.ceil(parLevel - onHand))
}
