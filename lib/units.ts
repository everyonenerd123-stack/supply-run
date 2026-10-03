// Turns a quantity + unit into words people read naturally: "35 avocados", "14 loaves", "1.5 kg".
const IRREGULAR: Record<string, string> = { loaf: 'loaves' }
const SYMBOLS = new Set(['L', 'kg', 'g', 'ml'])

export function unitWord(unit: string, qty: number): string {
  if (SYMBOLS.has(unit) || qty === 1) return unit
  return IRREGULAR[unit] ?? `${unit}s`
}

/** "35 avocados", "26 cartons", "21 L" */
export function formatQty(qty: number, unit: string): string {
  return `${qty} ${unitWord(unit, qty)}`
}

/** "$1.35 / avocado" */
export function formatUnitPrice(price: number, unit: string): string {
  return `$${price.toFixed(2)} / ${unit}`
}
