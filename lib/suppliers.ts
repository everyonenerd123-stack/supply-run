// The demo suppliers and their ordering websites (app/supplier/...).
// Order confirmation codes are signed with SUPPLIER_SECRET, so a code can only come from a real
// submission to the supplier site. The dashboard re-checks the code to prove the order happened.
import { createHmac } from 'node:crypto'
import { inventory } from './data'

export interface SupplierProduct {
  id: string
  name: string
  unit: string
  price_usd: number
}

export interface Supplier {
  slug: string
  name: string
  prefix: string
  tagline: string
  products: SupplierProduct[]
}

const SUPPLIER_META: Record<string, { slug: string; prefix: string; tagline: string }> = {
  'Valley Dairy Co.': { slug: 'valley-dairy', prefix: 'VD', tagline: 'Fresh dairy & plant milks, delivered daily' },
  'GreenLeaf Produce': { slug: 'greenleaf-produce', prefix: 'GL', tagline: 'Local fruit & veg for kitchens' },
  'Golden Crust Bakery': { slug: 'golden-crust-bakery', prefix: 'GC', tagline: 'Wholesale breads & pastries, baked overnight' },
  'FreshFood Supply': { slug: 'freshfood-supply', prefix: 'FF', tagline: 'Meat, deli & café packaging' },
  'Bean & Leaf Roasters': { slug: 'bean-leaf-roasters', prefix: 'BL', tagline: 'Specialty coffee, tea & syrups' },
}

export const suppliers: Supplier[] = Object.entries(SUPPLIER_META).map(([name, meta]) => ({
  name,
  ...meta,
  products: inventory.items
    .filter((i) => i.usual_supplier === name)
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, price_usd: i.unit_cost_usd })),
}))

export function supplierBySlug(slug: string): Supplier | undefined {
  return suppliers.find((s) => s.slug === slug)
}

export function supplierByName(name: string): Supplier | undefined {
  return suppliers.find((s) => s.name === name)
}

// ---------------------------------------------------------------------------
// Signed order codes

export type OrderLines = Record<string, number> // product id -> quantity

const secret = () => process.env.SUPPLIER_SECRET || 'local-dev-supplier-secret'

function canonical(slug: string, ts: number, lines: OrderLines): string {
  const items = Object.entries(lines)
    .filter(([, q]) => q > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, q]) => `${id}:${q}`)
    .join(',')
  return `${slug}|${ts}|${items}`
}

function signature(slug: string, ts: number, lines: OrderLines): string {
  return createHmac('sha256', secret()).update(canonical(slug, ts, lines)).digest('hex').slice(0, 6).toUpperCase()
}

/** e.g. VD-MGB2K1X0-3F9A1C : supplier prefix, timestamp, signature. */
export function createOrderCode(supplier: Supplier, lines: OrderLines, ts = Date.now()): string {
  return `${supplier.prefix}-${ts.toString(36).toUpperCase()}-${signature(supplier.slug, ts, lines)}`
}

/** True only if this code was issued by the supplier site for exactly these lines. */
export function verifyOrderCode(supplier: Supplier, code: string, lines: OrderLines): boolean {
  const [prefix, ts36, sig] = code.trim().toUpperCase().split('-')
  if (prefix !== supplier.prefix || !ts36 || !sig) return false
  const ts = parseInt(ts36, 36)
  return Number.isFinite(ts) && signature(supplier.slug, ts, lines) === sig
}

export function linesToParam(lines: OrderLines): string {
  return Object.entries(lines)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => `${id}:${q}`)
    .join(',')
}

export function paramToLines(param: string | undefined): OrderLines {
  const lines: OrderLines = {}
  for (const part of (param ?? '').split(',')) {
    const [id, q] = part.split(':')
    const n = Number(q)
    if (id && Number.isFinite(n) && n > 0) lines[id] = n
  }
  return lines
}
