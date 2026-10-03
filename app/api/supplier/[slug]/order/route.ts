// Receives the supplier website's order form and redirects to the confirmation page.
import { NextResponse } from 'next/server'
import { placeSupplierOrder } from '@/lib/supplier-orders'
import { supplierBySlug } from '@/lib/suppliers'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supplier = supplierBySlug(slug)
  if (!supplier) return NextResponse.json({ error: 'Unknown supplier' }, { status: 404 })

  const form = await req.formData()
  const text = (name: string) => String(form.get(name) ?? '')
  const lines: Record<string, number> = {}
  for (const p of supplier.products) lines[p.id] = Number(form.get(`qty_${p.id}`) ?? 0)

  try {
    const confirmation = placeSupplierOrder(supplier, {
      cafe_name: text('cafe_name'),
      account_number: text('account_number'),
      delivery_date: text('delivery_date'),
      delivery_window: text('delivery_window'),
      notes: text('notes'),
      lines,
    })
    return NextResponse.redirect(new URL(confirmation.confirmation_url, req.url), 303)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Order failed'
    return NextResponse.redirect(new URL(`/supplier/${slug}?error=${encodeURIComponent(message)}`, req.url), 303)
  }
}
