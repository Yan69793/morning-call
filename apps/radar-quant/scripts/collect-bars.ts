/**
 * Coletor standalone: conecta no TradingView Desktop via CDP (porta 9222) e puxa
 * as barras diárias de todo o universo + da watchlist dinâmica (pedidos manuais
 * de ticker feitos pela tela do Radar Quant), gravando bars.json.
 *
 * Não usa MCP nem sessão interativa — é o mesmo mecanismo que o MCP usa por baixo
 * (Chrome DevTools Protocol), só que num script que roda sozinho via Task Scheduler.
 *
 * Uso: npx tsx collect-bars.ts <out=bars.json>
 */
import CDP from 'chrome-remote-interface'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))

const HOST = 'localhost'
const PORT = 9222
const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()'
const BARS_PATH = `${CHART_API}._chartWidget.model().mainSeries().bars()`
const COUNT = 130

const WORKER_URL = process.env.WORKER_URL ?? 'https://radar-quant-brasil.prospects-intel.workers.dev'
const outPath = process.argv[2] ?? join(__dir, 'bars.json')

interface SymbolMeta {
  symbol: string
  name: string
  type: string
  kind: string
  sector?: string
}

interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function loadSymbols(): Promise<SymbolMeta[]> {
  const universe = JSON.parse(readFileSync(join(__dir, 'universe.json'), 'utf8')) as {
    symbols: SymbolMeta[]
  }
  const known = new Set(universe.symbols.map((s) => s.symbol))

  let extra: string[] = []
  try {
    const res = await fetch(`${WORKER_URL}/api/watchlist`)
    if (res.ok) {
      const body = (await res.json()) as { symbols: string[] }
      extra = body.symbols
    }
  } catch (err) {
    console.warn(`aviso: não consegui buscar a watchlist dinâmica (${(err as Error).message}); seguindo só com o universo fixo.`)
  }

  const extraMeta: SymbolMeta[] = extra
    .filter((s) => !known.has(s))
    .map((s) => ({ symbol: s, name: s, type: 'acao', kind: 'acao' }))

  return [...universe.symbols, ...extraMeta]
}

async function findTarget(): Promise<{ id: string } | null> {
  const resp = await fetch(`http://${HOST}:${PORT}/json/list`)
  const targets = (await resp.json()) as Array<{ type: string; url: string; id: string }>
  return (
    targets.find((t) => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url)) ??
    targets.find((t) => t.type === 'page' && /tradingview/i.test(t.url)) ??
    null
  )
}

let client: Awaited<ReturnType<typeof CDP>>

async function evaluate(expression: string, awaitPromise = false): Promise<unknown> {
  const r = await client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'eval error')
  }
  return r.result?.value
}

async function setSymbol(symbol: string): Promise<void> {
  await evaluate(
    `
    (function() {
      var chart = ${CHART_API};
      return new Promise(function(resolve) {
        chart.setSymbol(${JSON.stringify(symbol)}, {});
        setTimeout(resolve, 600);
      });
    })()
  `,
    true,
  )
}

async function setResolution(tf: string): Promise<void> {
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setResolution(${JSON.stringify(tf)}, {});
    })()
  `)
}

async function waitReady(symbol: string, timeout = 15000): Promise<boolean> {
  const wantSym = symbol.split(':').pop()!.toUpperCase()
  const start = Date.now()
  let lastCount = -1
  let stable = 0
  while (Date.now() - start < timeout) {
    const st = (await evaluate(`
      (function() {
        try {
          var chart = ${CHART_API};
          var sym = '';
          try { sym = chart.symbolExt().symbol || chart.symbol() || ''; } catch(e) { try { sym = chart.symbol(); } catch(e2){} }
          var bars = ${BARS_PATH};
          var n = (bars && typeof bars.size === 'function') ? bars.size() : -1;
          var spinner = document.querySelector('[class*="loader"]');
          var loading = spinner && spinner.offsetParent !== null;
          return { sym: String(sym).toUpperCase(), n: n, loading: !!loading };
        } catch(e) { return { sym:'', n:-1, loading:true }; }
      })()
    `)) as { sym: string; n: number; loading: boolean } | null
    if (st && !st.loading && st.n > 0 && st.sym.includes(wantSym)) {
      if (st.n === lastCount) stable++
      else stable = 0
      lastCount = st.n
      if (stable >= 2) return true
    } else {
      stable = 0
      if (st) lastCount = st.n
    }
    await sleep(250)
  }
  return false
}

async function getBars(): Promise<Bar[]> {
  const data = await evaluate(`
    (function() {
      var bars = ${BARS_PATH};
      if (!bars || typeof bars.lastIndex !== 'function') return null;
      var result = [];
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - ${COUNT} + 1);
      for (var i = start; i <= end; i++) {
        var v = bars.valueAt(i);
        if (v) result.push({time: v[0], open: v[1], high: v[2], low: v[3], close: v[4]});
      }
      return result;
    })()
  `)
  return Array.isArray(data) ? (data as Bar[]) : []
}

async function main(): Promise<void> {
  const symbols = await loadSymbols()
  console.log(`Universo: ${symbols.length} símbolos (fixo + watchlist dinâmica)`)

  const target = await findTarget()
  if (!target) throw new Error('Nenhuma aba do TradingView encontrada via CDP — o app está aberto e logado?')
  client = await CDP({ host: HOST, port: PORT, target: target.id })
  await client.Runtime.enable()
  await client.Page.enable()

  const out: Record<string, Bar[]> = {}
  const report: Array<{ symbol: string; bars: number; note: string }> = []

  for (const { symbol } of symbols) {
    let bars: Bar[] = []
    let note = 'ok'
    try {
      await setSymbol(symbol)
      await setResolution('D')
      const ready = await waitReady(symbol)
      bars = await getBars()
      if (!ready && bars.length === 0) note = 'empty (not ready)'
      else if (bars.length === 0) note = 'empty'
    } catch (err) {
      bars = []
      note = `error: ${(err as Error).message}`
    }
    out[symbol] = bars
    report.push({ symbol, bars: bars.length, note })
    console.log(`${symbol}: ${bars.length} bars (${note})`)
  }

  writeFileSync(outPath, JSON.stringify(out))
  console.log('---REPORT-JSON---')
  console.log(JSON.stringify(report))

  try {
    await client.close()
  } catch {
    // conexão já pode ter caído; não é fatal
  }
}

main().catch((err) => {
  console.error('FATAL', err)
  process.exit(1)
})
