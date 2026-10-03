// Placeholder until the dashboard step. Links to the demo supplier websites.
import Link from 'next/link'
import { suppliers } from '@/lib/suppliers'

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Supply Run</h1>
      <p className="mt-2 text-muted">Dashboard coming next. Demo supplier websites:</p>
      <ul className="mt-6 space-y-2">
        {suppliers.map((s) => (
          <li key={s.slug}>
            <Link href={`/supplier/${s.slug}`} className="font-medium text-brand hover:underline">
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
