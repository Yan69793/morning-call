/**
 * Monta o ScanDocument a partir de bars.json + universe.json, usando o núcleo
 * analítico compartilhado (@sz/analytics — o mesmo em produção), anexa
 * notícias (news.json, opcional) e publica via POST /api/ingest/scan.
 *
 * Uso: npx tsx build-scan.ts [--no-post]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildItem,
  assignCrossRanks,
  METHODOLOGY_VERSION,
  curateNews,
  MACRO_NEWS_CAP,
  ASSET_NEWS_CAP,
  type SymbolMeta,
  type Bar,
  type AnalyticsItem,
} from '@sz/analytics'

const __dir = dirname(fileURLToPath(import.meta.url))

const WORKER_URL = process.env.WORKER_URL ?? 'https://radar-quant-brasil.prospects-intel.workers.dev'
const INGEST_SECRET = process.env.INGEST_SECRET
const noPost = process.argv.includes('--no-post')

interface Universe {
  version: string
  alertThresholds: Record<string, number>
  symbols: SymbolMeta[]
}

interface NewsPayload {
  macro: unknown[]
  bySymbol: Record<string, unknown[]>
}

const universe = JSON.parse(readFileSync(join(__dir, 'universe.json'), 'utf8')) as Universe
const bars = JSON.parse(readFileSync(join(__dir, 'bars.json'), 'utf8')) as Record<string, Bar[]>

// bars.json pode ter símbolos além do universo fixo (watchlist dinâmica) — inclui todos.
const knownSymbols = new Set(universe.symbols.map((s) => s.symbol))
const dynamicSymbols: SymbolMeta[] = Object.keys(bars)
  .filter((s) => !knownSymbols.has(s))
  .map((s) => ({ symbol: s, name: s, type: 'acao', kind: 'acao' }))
const allSymbols = [...universe.symbols, ...dynamicSymbols]

const now = new Date()
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
const spDate = `${parts.year}-${parts.month}-${parts.day}`
const spTime = `${parts.hour}${parts.minute}`

function lastBarDate(arr: Bar[] | undefined): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null
  const b = arr[arr.length - 1]
  if (typeof b.date === 'string') return b.date
  if (typeof b.time === 'number') return new Date(b.time * 1000).toISOString().slice(0, 10)
  return null
}

// Mesma lógica de calendário por classe de ativo do pipeline legado: cada grupo
// compara staleness contra a referência do SEU próprio pregão, não um único
// horário global — B3, cripto 24/7, forex, Ásia e "demais" (EUA/Europa) fecham
// em horários muito diferentes.
function calendarGroup(meta: SymbolMeta): string {
  if (meta.kind === 'cripto') return 'cripto'
  if (meta.symbol.startsWith('BMFBOVESPA:')) return 'b3'
  if (meta.kind === 'fx') return 'fx'
  if (meta.symbol === 'TVC:NI225') return 'asia'
  return 'global'
}

const groupRef: Record<string, string> = {}
for (const s of allSymbols) {
  const d = lastBarDate(bars[s.symbol])
  if (!d) continue
  const g = calendarGroup(s)
  if (!groupRef[g] || d > groupRef[g]) groupRef[g] = d
}
const marketDate = groupRef.b3 ?? groupRef.global ?? groupRef.fx ?? groupRef.asia ?? groupRef.cripto ?? spDate

const items: AnalyticsItem[] = allSymbols.map((meta) => {
  const item = buildItem(meta, bars[meta.symbol] ?? [], {
    expectedBars: 120,
    expectedMarketDate: groupRef[calendarGroup(meta)] ?? marketDate,
    alertThresholds: universe.alertThresholds,
  })
  return item
})
assignCrossRanks(items)

const warnings: string[] = []
for (const it of items) {
  const q = it.quality ?? {}
  for (const [flag, on] of Object.entries(q)) {
    if (on) warnings.push(`${it.symbol}: ${flag}`)
  }
}

let news: { generatedAt: string; macro: unknown[] } | undefined
const newsPath = join(__dir, 'news.json')
try {
  const raw = JSON.parse(readFileSync(newsPath, 'utf8')) as NewsPayload
  const macro = curateNews(raw.macro ?? [], MACRO_NEWS_CAP)
  news = { generatedAt: now.toISOString(), macro }
  const bySym = raw.bySymbol ?? {}
  let attached = 0
  for (const it of items) {
    const curated = curateNews(bySym[it.symbol] ?? [], ASSET_NEWS_CAP)
    if (curated.length) {
      ;(it as AnalyticsItem & { news?: unknown[] }).news = curated
      attached++
    }
  }
  console.log(`notícias: ${macro.length} macro, ${attached} ativos com notícia`)
} catch {
  console.log('sem news.json — scan seguirá sem notícias (rode fetch-news.ts antes, se quiser notícias).')
}

const scan = {
  scanId: `${spDate}T${spTime}-0300`,
  schemaVersion: news ? '1.1.0' : '1.0.0',
  methodologyVersion: METHODOLOGY_VERSION,
  universeVersion: universe.version,
  generatedAt: now.toISOString(),
  marketDate,
  timezone: 'America/Sao_Paulo',
  warnings,
  ...(news ? { news } : {}),
  items,
}

mkdirSync(join(__dir, 'out'), { recursive: true })
const outPath = join(__dir, 'out', `radar-${marketDate}.json`)
writeFileSync(outPath, JSON.stringify(scan, null, 2))

const ok = items.filter((i) => i.score !== null).length
const err = items.filter((i) => i.quality?.symbolError).length
console.log(`scan gerado: ${items.length} itens (${ok} com score, ${err} sem dado), marketDate=${marketDate}, scanId=${scan.scanId}`)
if (warnings.length) console.log(`warnings: ${warnings.length}`)

if (noPost) {
  console.log('--no-post: pulando envio.')
  process.exit(0)
}
if (!INGEST_SECRET) {
  console.error('ERRO: variável INGEST_SECRET obrigatória para publicar. Scan gravado em out/, mas não enviado.')
  process.exit(2)
}

const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}/api/ingest/scan`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-ingest-secret': INGEST_SECRET },
  body: JSON.stringify(scan),
})
const text = await res.text()
console.log(`POST /api/ingest/scan -> HTTP ${res.status}: ${text}`)
process.exit(res.ok ? 0 : 1)
