// Market price search with Tavily. Runs on OUR server (the key never goes to ZooWork).
// The agent asks for it through the `search_market_prices` custom tool.

export interface PriceQuery {
  item_id: string
  query: string
}

export interface PriceSearchResult {
  item_id: string
  query: string
  results: { title: string; url: string; snippet: string }[]
  source: 'tavily' | 'mock'
}

export async function searchMarketPrices(queries: PriceQuery[]): Promise<PriceSearchResult[]> {
  const key = process.env.TAVILY_API_KEY
  return Promise.all(
    queries.slice(0, 8).map(async (q) => {
      if (!key || process.env.MOCK_MODE === '1') return mockResult(q)
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.query, max_results: 4, search_depth: 'basic' }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`)
        const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] }
        const results = (data.results ?? []).map((r) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          snippet: (r.content ?? '').replace(/\s+/g, ' ').slice(0, 400),
        }))
        return { ...q, results, source: 'tavily' as const }
      } catch {
        return mockResult(q)
      }
    }),
  )
}

/** Per-unit prices matching the mock snippets below (used by the mock morning check). */
export const MOCK_MARKET_PRICES: Record<string, { price: number; url: string; note: string }> = {
  'oat-milk': { price: 3.25, url: 'https://example.com/mock/oat-milk', note: 'Case of 12 at $39.00 = $3.25/carton (sample data)' },
  avocados: { price: 1.3, url: 'https://example.com/mock/avocados', note: '48-count case at $62.40 = $1.30 each (sample data)' },
  croissants: { price: 1.15, url: 'https://example.com/mock/croissants', note: '24 for $27.60 = $1.15 each (sample data)' },
  sourdough: { price: 4.7, url: 'https://example.com/mock/sourdough', note: '800g loaf at $4.70 (sample data)' },
}

// Used when Tavily is unavailable, so the demo still shows a believable market check.
const MOCK_SNIPPETS: Record<string, { title: string; url: string; snippet: string }> = {
  'oat-milk': { title: 'Barista oat milk 1 L - wholesale case of 12', url: 'https://example.com/mock/oat-milk', snippet: 'Barista oat milk 1L cartons, case of 12 for $39.00 ($3.25 per carton).' },
  avocados: { title: 'Hass avocados - foodservice, 48 count', url: 'https://example.com/mock/avocados', snippet: 'Hass avocados 48ct case $62.40, about $1.30 each.' },
  croissants: { title: 'Butter croissants, wholesale, 24 pack', url: 'https://example.com/mock/croissants', snippet: 'All-butter croissants for cafés, 24 for $27.60 ($1.15 each).' },
  sourdough: { title: 'Sourdough loaves for restaurants', url: 'https://example.com/mock/sourdough', snippet: 'Wholesale sourdough loaf 800g $4.70 each, minimum order 6.' },
}

function mockResult(q: PriceQuery): PriceSearchResult {
  const hit = MOCK_SNIPPETS[q.item_id]
  return { ...q, results: hit ? [hit] : [], source: 'mock' }
}
