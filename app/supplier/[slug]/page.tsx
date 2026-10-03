// A supplier's wholesale order form. A plain HTML form with stable ids/names, so the agent's
// browser (Playwright in its ZooWork sandbox) can fill it in and click "Place order".
import { notFound } from 'next/navigation'
import { supplierBySlug } from '@/lib/suppliers'
import { SupplierShell } from '../SupplierShell'

export default async function SupplierOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { slug } = await params
  const { error } = await searchParams
  const supplier = supplierBySlug(slug)
  if (!supplier) notFound()

  const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none'

  return (
    <SupplierShell supplier={supplier}>
      <h1 className="text-2xl font-semibold">Place a wholesale order</h1>
      <p className="mt-1 text-sm text-gray-600">Orders placed before 10:00 are delivered same day.</p>

      {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form id="order-form" method="post" action={`/api/supplier/${supplier.slug}/order`} className="mt-6 space-y-6">
        <section className="grid gap-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Business name</span>
            <input id="cafe_name" name="cafe_name" required className={field} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Account number</span>
            <input id="account_number" name="account_number" required placeholder="e.g. SB-1042" className={field} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Delivery date</span>
            <input id="delivery_date" name="delivery_date" type="date" required className={field} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Delivery window</span>
            <select id="delivery_window" name="delivery_window" className={field} defaultValue="asap">
              <option value="asap">Same day, as soon as possible</option>
              <option value="06-08">06:00 to 08:00</option>
              <option value="08-10">08:00 to 10:00</option>
              <option value="10-12">10:00 to 12:00</option>
            </select>
          </label>
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {supplier.products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.unit}</td>
                  <td className="px-4 py-3 text-right">${p.price_usd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      id={`qty_${p.id}`}
                      name={`qty_${p.id}`}
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={0}
                      aria-label={`Quantity of ${p.name}`}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 rounded-xl bg-white p-5 shadow-sm">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes for the driver (optional)</span>
            <textarea id="notes" name="notes" rows={2} className={field} />
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 font-medium">Payment</legend>
            <label className="flex items-center gap-2">
              <input type="radio" id="payment_account" name="payment" value="account" defaultChecked />
              Charge to account (invoice, net 30)
            </label>
          </fieldset>
        </section>

        <button
          id="place-order"
          type="submit"
          className="w-full rounded-lg bg-emerald-700 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          Place order
        </button>
      </form>
    </SupplierShell>
  )
}
