import { Hono } from 'hono'
import { requireIngestSecret } from '../lib/auth'

type Bindings = { KV: KVNamespace; INGEST_SECRET: string }

export const watchlistRoutes = new Hono<{ Bindings: Bindings }>()

const KV_KEY = 'watchlist:requested'
const MAX_SYMBOLS = 50
// EXCHANGE:TICKER, só maiúsculas/números/ponto/hífen em cada lado. Mesmo formato que o
// TradingView usa e que a pipeline de scan (fora deste repo) já espera receber.
const SYMBOL_RE = /^[A-Z0-9._-]{1,20}:[A-Z0-9._-]{1,20}$/

function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase()
  return s.includes(':') ? s : `BMFBOVESPA:${s}`
}

async function readList(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(KV_KEY, 'text')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

watchlistRoutes.get('/', async (c) => {
  const list = await readList(c.env.KV)
  return c.json({ symbols: list })
})

// RQ-21 (14/08/2026): escrita na watchlist era publica, qualquer um
// alterava o universo que o scan diario coleta. Agora exige o secret.
watchlistRoutes.post('/', requireIngestSecret, async (c) => {
  let body: { symbol?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (typeof body.symbol !== 'string' || !body.symbol.trim()) {
    return c.json({ error: 'Invalid payload: symbol required' }, 400)
  }

  const symbol = normalizeSymbol(body.symbol)
  if (!SYMBOL_RE.test(symbol)) {
    return c.json({ error: 'Invalid payload: symbol must look like EXCHANGE:TICKER' }, 400)
  }

  const current = await readList(c.env.KV)
  if (current.includes(symbol)) return c.json({ ok: true, symbols: current })
  if (current.length >= MAX_SYMBOLS) {
    return c.json({ error: `Limite de ${MAX_SYMBOLS} tickers manuais atingido` }, 429)
  }

  const next = [...current, symbol]
  await c.env.KV.put(KV_KEY, JSON.stringify(next))
  return c.json({ ok: true, symbols: next })
})

watchlistRoutes.post('/remove', requireIngestSecret, async (c) => {
  let body: { symbol?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (typeof body.symbol !== 'string' || !body.symbol.trim()) {
    return c.json({ error: 'Invalid payload: symbol required' }, 400)
  }

  const symbol = normalizeSymbol(body.symbol)
  const current = await readList(c.env.KV)
  const next = current.filter((s) => s !== symbol)
  await c.env.KV.put(KV_KEY, JSON.stringify(next))
  return c.json({ ok: true, symbols: next })
})
