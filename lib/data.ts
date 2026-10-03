// The café's fake data. These two JSON files are the single source of truth for the demo.
import inventoryJson from '../data/inventory.json'
import salesJson from '../data/sales.json'

export interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  on_hand: number
  par_level: number
  unit_cost_usd: number
  est_revenue_per_unit_usd: number
  usual_supplier: string
  /** Set when the manager types their own "Need today" number on the dashboard. */
  need_today?: number
}

export interface Inventory {
  cafe: string
  currency: string
  as_of: string
  rush_order_premium_pct: number
  note: string
  items: InventoryItem[]
}

export interface Sales {
  cafe: string
  currency: string
  note: string
  dates: string[]
  weekdays: string[]
  revenue_usd: number[]
  orders: number[]
  usage_by_item: Record<string, number[]>
}

export const inventory = inventoryJson as Inventory
export const sales = salesJson as Sales
