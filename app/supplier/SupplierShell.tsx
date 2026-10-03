// Shared frame for the demo supplier websites. Deliberately styled differently from
// Supply Run (green, not blue) so it reads as "someone else's website" in the demo.
import type { Supplier } from '@/lib/suppliers'

export function SupplierShell({ supplier, children }: { supplier: Supplier; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3f7f2]">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
        Demo supplier website for the Supply Run hackathon project. Orders are not fulfilled and nothing is charged.
      </div>
      <header className="border-b border-emerald-900/10 bg-emerald-800 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-white/15 text-sm font-bold">{supplier.prefix}</div>
          <div>
            <div className="text-lg font-semibold leading-tight">{supplier.name}</div>
            <div className="text-xs text-emerald-100">{supplier.tagline}</div>
          </div>
          <div className="ml-auto text-xs text-emerald-100">Wholesale ordering portal</div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
