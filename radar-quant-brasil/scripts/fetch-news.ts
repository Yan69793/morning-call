/**
 * Busca noticias via Finnhub (categorias gratuitas: general/forex/merger) e
 * fontes brasileiras (RSS InfoMoney, G1 Economia, Poder360) e gera news.json
 * para o build-scan.ts. Independente do TradingView — so HTTP.
 *
 * Uso: FINNHUB_TOKEN=... npx tsx fetch-news.ts [out=news.json] [days=2]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))

const token = process.env.FINNHUB_TOKEN
const outPath = process.argv[2] ?? join(__dir, 'news.json')
const days = Math.max(1, parseInt(process.argv[3] ?? '2', 10))

if (!token) {
  console.error('ERRO: variável FINNHUB_TOKEN obrigatória (obtenha em https://finnhub.io/register).')
  process.exit(1)
}

interface SymbolMeta {
  symbol: string
  name: string
}

interface NewsItem {
  title: string
  source: string
  url: string
  publishedAt: string | null
  summary?: string
}

interface FinnhubRaw {
  headline?: string
  url?: string
  source?: string
  datetime?: number
  summary?: string
}

const universe = JSON.parse(readFileSync(join(__dir, 'universe.json'), 'utf8')) as { symbols: SymbolMeta[] }

const BASE = 'https://finnhub.io/api/v1'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function apiFetch(path: string): Promise<FinnhubRaw[] | null> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}token=${token}`
  const r = await fetch(url)
  if (r.status === 429) {
    console.warn('  WARN 429 rate-limit — aguardando 10s...')
    await sleep(10000)
    return apiFetch(path)
  }
  if (!r.ok) {
    console.warn(`  WARN HTTP ${r.status}: ${path.split('?')[0]}`)
    return null
  }
  return (await r.json()) as FinnhubRaw[]
}

function toItem(raw: FinnhubRaw): NewsItem | null {
  if (!raw?.headline || !raw.url) return null
  let source = raw.source ?? ''
  if (!source) {
    try {
      source = new URL(raw.url).hostname.replace(/^www\./, '')
    } catch {
      source = '—'
    }
  }
  const item: NewsItem = {
    title: raw.headline.trim(),
    source,
    url: raw.url.trim(),
    publishedAt: raw.datetime ? new Date(raw.datetime * 1000).toISOString() : null,
  }
  if (raw.summary?.trim()) item.summary = raw.summary.trim()
  return item
}

async function main(): Promise<void> {
  const now = new Date()
  const cutoff = now.getTime() - days * 24 * 3600 * 1000

  const CATEGORIES = ['general', 'forex', 'merger']

/** Feed RSS brasileiro — complementa Finnhub com cobertura local. */
interface RssSource {
  name: string
  url: string
}
const RSS_FEEDS: RssSource[] = [
  { name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/' },
  { name: 'G1 Economia', url: 'https://g1.globo.com/rss/g1/economia/' },
  { name: 'Poder360', url: 'https://www.poder360.com.br/feed/' },
]

/**
 * Faz GET e parseia RSS 2.0 basico (regex, sem dependencia de parser XML).
 * Devolve array de NewsItem com source = nome do feed.
 */
async function fetchRss(source: RssSource): Promise<NewsItem[]> {
  const items: NewsItem[] = []
  try {
    const resp = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) {
      console.warn(`  RSS ${source.name}: HTTP ${resp.status}`)
      return items
    }
    const xml = await resp.text()
    // Extrai blocos <item>...</item> com regex simples (RSS 2.0)
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []
    for (const block of itemBlocks) {
      const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([^<\]>]*?)(?:\]\]>)?<\/title>/i)
      const linkMatch = block.match(/<link>(.*?)<\/link>/i)
      const dateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/i)
      if (!titleMatch?.[1] || !linkMatch?.[1]) continue
      const title = titleMatch[1].trim()
      const url = linkMatch[1].trim()
      if (!title || !url) continue
      items.push({
        title,
        source: source.name,
        url,
        publishedAt: dateMatch?.[1] ? new Date(dateMatch[1]).toISOString() : null,
      })
    }
  } catch (err) {
    console.warn(`  RSS ${source.name}: erro — ${(err as Error).message}`)
  }
  return items
}
  console.log(`Buscando notícias por categoria (janela: ${days}d)...`)
  const allItems: NewsItem[] = []
  for (const cat of CATEGORIES) {
    await sleep(220)
    const raw = await apiFetch(`/news?category=${cat}&minId=0`)
    const items = (raw ?? [])
      .map(toItem)
      .filter((it): it is NewsItem => it !== null)
      .filter((it) => it.publishedAt && Date.parse(it.publishedAt) >= cutoff)
    console.log(`  categoria "${cat}": ${items.length} itens`)
    allItems.push(...items)
  }

  const seen = new Set<string>()
  const pool = allItems.filter((it) => {
    const key = it.url.replace(/[?#].*$/, '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`\n  Pool Finnhub: ${pool.length} itens unicos`)

  // ---- Buscar RSS brasileiro e mesclar ao pool ----
  console.log(`\nBuscando noticias RSS brasileiro (${RSS_FEEDS.length} fontes)...`)
  for (const feed of RSS_FEEDS) {
    await sleep(300)
    const rssItems = await fetchRss(feed)
    console.log(`  RSS ${feed.name}: ${rssItems.length} itens`)
    for (const item of rssItems) {
      const key = item.url.replace(/[?#].*$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      pool.push(item)
    }
  }
  console.log(`  Pool total (Finnhub + RSS BR): ${pool.length} itens unicos`)

  // Macro: top 30 depois da mescla (inclui fontes BR)
  const macro = pool.slice(0, 30)

  const b3List = universe.symbols.filter((s) => s.symbol.startsWith('BMFBOVESPA:'))
  const bySymbol: Record<string, NewsItem[]> = {}
  for (const meta of b3List) {
    const ticker = meta.symbol.replace('BMFBOVESPA:', '').toLowerCase()
    const keywords = [ticker, meta.name.split(' ')[0].toLowerCase(), meta.name.toLowerCase()]
    const matched = pool.filter((it) => {
      const hay = `${it.title} ${it.summary ?? ''}`.toLowerCase()
      return keywords.some((kw) => kw.length >= 4 && hay.includes(kw))
    })
    if (matched.length) {
      bySymbol[meta.symbol] = matched.slice(0, 5)
      console.log(`  ${meta.symbol.padEnd(28)} ${matched.length} notícias`)
    }
  }

  writeFileSync(outPath, JSON.stringify({ macro, bySymbol }, null, 2))
  console.log(`\nnews.json gravado em: ${outPath}`)
  console.log(`  macro:  ${macro.length} itens`)
  console.log(`  ativos: ${Object.keys(bySymbol).length} com notícia`)
}

main().catch((err) => {
  console.error('FATAL', err)
  process.exit(1)
})
