// After the manager approves: place one order per supplier.
// Step 3 adds the agent's browser path; the backup path submits the same order from our server.
import { inventory } from './data'
import { placeSupplierOrder, type SupplierOrderConfirmation } from './supplier-orders'
import { supplierByName, type OrderLines, type Supplier } from './suppliers'

export const CAFE_ACCOUNT = { cafe_name: 'Sunny Bistro', account_number: 'SB-1042' }

export interface ApprovedLine {
  id: string
  order_qty: number
}

export interface SupplierGroup {
  supplier: Supplier
  lines: OrderLines
}

export interface PlacedOrder extends SupplierOrderConfirmation {
  slug: string
  placed_by: 'agent' | 'backup'
  /** Why the backup was used, when it was. */
  note?: string
}

export function groupBySupplier(approved: ApprovedLine[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>()
  for (const line of approved) {
    const item = inventory.items.find((i) => i.id === line.id)
    const supplier = item && supplierByName(item.usual_supplier)
    if (!supplier || !(line.order_qty > 0)) continue
    const group = groups.get(supplier.slug) ?? { supplier, lines: {} }
    group.lines[line.id] = Math.ceil(line.order_qty)
    groups.set(supplier.slug, group)
  }
  return [...groups.values()]
}

export function deliveryDate(): string {
  return inventory.as_of.slice(0, 10)
}

export function placeByBackup(group: SupplierGroup, note?: string): PlacedOrder {
  const confirmation = placeSupplierOrder(group.supplier, {
    ...CAFE_ACCOUNT,
    delivery_date: deliveryDate(),
    delivery_window: 'asap',
    lines: group.lines,
  })
  return { ...confirmation, slug: group.supplier.slug, placed_by: 'backup', note }
}
