// Placing an order with a demo supplier. Used by the supplier website's form handler and by
// the dashboard's backup path, so both produce the same signed confirmation.
import { createOrderCode, linesToParam, type OrderLines, type Supplier } from './suppliers'

export interface SupplierOrderInput {
  cafe_name: string
  account_number: string
  delivery_date: string
  delivery_window: string
  notes?: string
  lines: OrderLines
}

export interface SupplierOrderConfirmation {
  supplier: string
  code: string
  lines: OrderLines
  total_usd: number
  confirmation_url: string
}

export function placeSupplierOrder(supplier: Supplier, input: SupplierOrderInput): SupplierOrderConfirmation {
  const lines: OrderLines = {}
  for (const p of supplier.products) {
    const q = Math.floor(input.lines[p.id] ?? 0)
    if (q > 0) lines[p.id] = q
  }
  if (Object.keys(lines).length === 0) throw new Error('Enter a quantity for at least one product.')
  if (!input.cafe_name.trim() || !input.account_number.trim() || !input.delivery_date) {
    throw new Error('Business name, account number and delivery date are required.')
  }

  const code = createOrderCode(supplier, lines)
  const total = supplier.products.reduce((sum, p) => sum + (lines[p.id] ?? 0) * p.price_usd, 0)
  const query = new URLSearchParams({
    code,
    items: linesToParam(lines),
    cafe: input.cafe_name,
    account: input.account_number,
    date: input.delivery_date,
    window: input.delivery_window,
  })
  return {
    supplier: supplier.name,
    code,
    lines,
    total_usd: Math.round(total * 100) / 100,
    confirmation_url: `/supplier/${supplier.slug}/confirmation?${query}`,
  }
}
