// The supplier's "order received" page. The code is checked against the order lines, so a
// made-up or edited link shows as invalid.
import { notFound } from 'next/navigation'
import { paramToLines, supplierBySlug, verifyOrderCode } from '@/lib/suppliers'
import { SupplierShell } from '../../SupplierShell'

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { slug } = await params
  const q = await searchParams
  const supplier = supplierBySlug(slug)
  if (!supplier) notFound()

  const code = q.code ?? ''
  const lines = paramToLines(q.items)
  const valid = verifyOrderCode(supplier, code, lines)
  const rows = supplier.products.filter((p) => lines[p.id])
  const total = rows.reduce((sum, p) => sum + lines[p.id] * p.price_usd, 0)

  return (
    <SupplierShell supplier={supplier}>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        {valid ? (
          <>
            <div className="text-sm font-medium text-emerald-700">Order received</div>
            <h1 id="order-code" className="mt-1 text-3xl font-bold tracking-tight">
              {code}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Thank you, {q.cafe} (account {q.account}). Delivery on {q.date}
              {q.window === 'asap' ? ', as soon as possible' : `, ${q.window?.replace('-', ':00 to ')}:00`}. We will
              invoice your account.
            </p>
            <table className="mt-6 w-full text-sm">
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-gray-600">
                      {lines[p.id]} × {p.unit}
                    </td>
                    <td className="py-2 text-right">${(lines[p.id] * p.price_usd).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="py-2" colSpan={2}>
                    Total (charged to account)
                  </td>
                  <td className="py-2 text-right">${total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-red-700">We could not find this order</h1>
            <p className="mt-2 text-sm text-gray-600">The confirmation code does not match an order placed on this site.</p>
          </>
        )}
      </div>
    </SupplierShell>
  )
}
