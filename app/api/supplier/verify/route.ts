// Checks a supplier confirmation code against the order lines. Used by the dashboard to show
// "Verified by supplier": the code can only come from a real submission to the supplier site.
import { NextResponse } from 'next/server'
import { supplierBySlug, verifyOrderCode } from '@/lib/suppliers'

export async function POST(req: Request) {
  const { slug, code, lines } = (await req.json().catch(() => ({}))) as {
    slug?: string
    code?: string
    lines?: Record<string, number>
  }
  const supplier = slug ? supplierBySlug(slug) : undefined
  const valid = !!supplier && !!code && !!lines && verifyOrderCode(supplier, code, lines)
  return NextResponse.json({ valid })
}
