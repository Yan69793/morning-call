import { useEffect, useState, type FormEvent } from 'react'
import { useApi } from '../hooks/useApi'
import { AssetCard } from '../components/AssetCard'
import { Watchlist } from '../components/Watchlist'
import { TradingViewChart } from '../components/TradingViewChart'
import { GenerateSignalPanel } from '../components/GenerateSignalPanel'
import { SkeletonAssetCard } from '../components/SkeletonAssetCard'
import { SkeletonWatchlistItem } from '../components/SkeletonWatchlistItem'
import { Skeleton } from '../components/Skeleton'
import type { ScanDocument } from '../types'

const MACRO_TYPES = ['macro', 'rates', 'fx', 'commodity', 'cripto', 'indice', 'vix']
const MANUAL_TICKERS_KEY = 'radar.manualTickers'

export function Dashboard() {
  const { data, loading, error } = useApi<ScanDocument>('/api/radar/latest')
  const [selected, setSelected] = useState<string>('')
  const [tickerInput, setTickerInput] = useState('')
  const [manualTickers, setManualTickers] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(MANUAL_TICKERS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (selected || !data) return
    const acao = data.items.find(i => i.type === 'acao')
    const first = acao ?? data.items[0]
    if (first) setSelected(first.symbol)
  }, [data, selected])

  useEffect(() => {
    window.localStorage.setItem(MANUAL_TICKERS_KEY, JSON.stringify(manualTickers))
  }, [manualTickers])

  function normalizeTicker(value: string) {
    const symbol = value.trim().toUpperCase()
    if (!symbol) return ''
    return symbol.includes(':') ? symbol : `BMFBOVESPA:${symbol}`
  }

  function addTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const symbol = normalizeTicker(tickerInput)
    if (!symbol) return
    setManualTickers(current => current.includes(symbol) ? current : [...current, symbol])
    setSelected(symbol)
    setTickerInput('')
  }

  function removeTicker(symbol: string) {
    setManualTickers(current => current.filter(item => item !== symbol))
    if (selected === symbol) setSelected('')
  }

  function explainWarning(warning: string) {
    const [symbol, flag] = warning.split(': ')
    if (flag === 'staleLastBar') return `${symbol}: ultima barra esta defasada em relacao ao pregao esperado`
    if (flag === 'missingBars') return `${symbol}: faltam barras no historico recebido`
    if (flag === 'symbolError') return `${symbol}: sem dados para o simbolo`
    if (flag === 'flatRange') return `${symbol}: variacao zerada ou inconsistente`
    return warning
  }

  if (loading) return (
    <div className="space-y-6">
      {/* Cabeçalho skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      {/* Layout principal skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Coluna esquerda: watchlist skeleton */}
        <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-3 space-y-2">
          <Skeleton className="h-3 w-16" />
          {[1, 2, 3, 4, 5].map(i => (
            <SkeletonWatchlistItem key={i} />
          ))}
          <Skeleton className="h-3 w-20 mt-2" />
          {[1, 2, 3, 4].map(i => (
            <SkeletonWatchlistItem key={`acao-${i}`} />
          ))}
        </div>

        {/* Coluna direita: gráfico + detalhe skeleton */}
        <div className="space-y-4">
          <div className="h-[480px] bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border overflow-hidden">
            <Skeleton className="h-full w-full" />
          </div>
          <SkeletonAssetCard />
        </div>
      </div>
    </div>
  )
  if (error) return (
    <div className="text-accent-red text-sm p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
      Erro ao carregar: {error}
    </div>
  )
  if (!data) return null

  const macros = data.items.filter(i => MACRO_TYPES.includes(i.type))
  const acoes  = [...data.items.filter(i => i.type === 'acao')].sort((a, b) => b.score - a.score)
  const alerts = data.items.filter(i => i.alert)
  const selectedItem = data.items.find(i => i.symbol === selected)
  const manualOnlyTickers = manualTickers.filter(symbol => !data.items.some(item => item.symbol === symbol))

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">Radar de Mercado</h1>
          <p className="text-xs text-text-muted dark:text-dark-text-muted mt-0.5">
            {data.marketDate} · {data.items.length} ativos · schema {data.schemaVersion}
          </p>
        </div>
        {alerts.length > 0 && (
          <div className="flex items-center gap-1.5 text-accent-yellow bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-full text-xs font-semibold">
            <span>▲</span>
            <span>{alerts.length} alerta{alerts.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Layout principal: watchlist + gráfico */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Coluna esquerda: watchlist */}
        <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border max-h-[calc(100vh-180px)] lg:max-h-[calc(100vh-180px)] overflow-y-auto order-2 lg:order-1">
          <form onSubmit={addTicker} className="p-3 border-b border-bg-border dark:border-dark-bg-border">
            <label className="block text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-2">
              Adicionar ticker
            </label>
            <div className="flex gap-2">
              <input
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value)}
                placeholder="PETR4 ou NASDAQ:AAPL"
                className="min-w-0 flex-1 rounded-lg border border-bg-border dark:border-dark-bg-border bg-white dark:bg-dark-bg px-3 py-2 text-xs text-text-primary dark:text-dark-text-primary outline-none focus:border-accent-blue"
              />
              <button
                type="submit"
                className="rounded-lg bg-accent-blue px-3 py-2 text-xs font-semibold text-white hover:bg-accent-blue/90 transition-colors"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-[10px] text-text-dim dark:text-dark-text-dim">
              Sem prefixo, assumo B3: PETR4 vira BMFBOVESPA:PETR4.
            </p>
          </form>
          {manualOnlyTickers.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
                Meus tickers
              </div>
              <div className="flex flex-col">
                {manualOnlyTickers.map(symbol => (
                  <div
                    key={symbol}
                    className={`flex items-center border-l-2 transition-colors ${
                      symbol === selected
                        ? 'bg-accent-blue/10 border-accent-blue'
                        : 'border-transparent hover:bg-bg-card dark:hover:bg-dark-bg-card'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(symbol)}
                      className="min-w-0 flex-1 text-left px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-text-primary dark:text-dark-text-primary font-mono leading-tight">
                          {symbol.split(':')[1] ?? symbol}
                        </div>
                        <div className="text-[10px] text-text-dim dark:text-dark-text-dim truncate leading-tight">
                          {symbol}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTicker(symbol)}
                      className="text-text-dim dark:text-dark-text-dim hover:text-accent-red px-3 py-2"
                      aria-label={`Remover ${symbol}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
            Macro
          </div>
          <Watchlist items={macros} selected={selected} onSelect={setSelected} />
          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest border-t border-bg-border dark:border-dark-bg-border mt-1">
            Ações <span className="text-text-dim dark:text-dark-text-dim font-normal">({acoes.length})</span>
          </div>
          <Watchlist items={acoes} selected={selected} onSelect={setSelected} />
        </div>

        {/* Coluna direita: gráfico + detalhe */}
        <div className="space-y-4 min-w-0 order-1 lg:order-2">
          {selected && (
            <div className="h-[300px] lg:h-[480px] bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border overflow-hidden">
              <TradingViewChart symbol={selected} />
            </div>
          )}
          {selectedItem && (
            <div className="space-y-3">
              <AssetCard item={selectedItem} />
              {selected && <GenerateSignalPanel symbol={selected} />}
            </div>
          )}
          {selected && !selectedItem && (
            <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-4 text-sm text-text-muted dark:text-dark-text-muted">
              {selected} foi adicionado manualmente. O grafico abre pelo TradingView, mas esse ticker ainda nao faz parte do radar calculado.
            </div>
          )}
        </div>
      </div>

      {/* Avisos de qualidade */}
      {data.warnings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-[11px] text-amber-700 dark:text-amber-300">
          <div className="font-semibold mb-1">Avisos de qualidade dos dados</div>
          <div>{data.warnings.map(explainWarning).join(' · ')}</div>
        </div>
      )}

      {/* Notícias */}
      {(data.news?.macro?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-3">Notícias Macro</h2>
          <div className="space-y-2">
            {data.news.macro.map((n, i) => {
              const cls = "bg-white dark:bg-dark-bg-card border border-bg-border dark:border-dark-bg-border rounded-xl p-3 flex items-start justify-between gap-3"
              const inner = (
                <>
                  <span className="text-sm text-text-primary dark:text-dark-text-primary">{n.title}</span>
                  <span className="text-[10px] text-text-muted dark:text-dark-text-muted whitespace-nowrap shrink-0">{n.source}</span>
                </>
              )
              return n.url ? (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:shadow-md transition-shadow`}>
                  {inner}
                </a>
              ) : (
                <div key={i} className={cls}>{inner}</div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
