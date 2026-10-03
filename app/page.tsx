import { inventory, sales } from '@/lib/data'
import { Dashboard } from './Dashboard'

export default function Home() {
  return <Dashboard inventory={inventory} sales={sales} />
}
