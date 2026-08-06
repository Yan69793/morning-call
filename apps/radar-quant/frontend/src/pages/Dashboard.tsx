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

interface WatchlistResponse {
  symbols: string[]
}

export function Dashboard() {
  const { data, loading, error } = useApi<ScanDocument>('/api/radar/latest')
  const { data: watchlistData, reload: reloadWatchlist } = useApi<WatchlistResponse>('/api/watchlist')
  const [selected, setSelected] = useState<string>('')
  const [tickerInput, setTickerInput] = useState('')
  const [tickerError, setTickerError] = useState('')
  const manualTickers = watchlistData?.symbols ?? []

  useEffect(() => {
    if (selected || !data) return
    const acao = data.items.find(i => i.type === 'acao')
    const first = acao ?? data.items[0]
    if (first) setSelected(first.symbol)
  }, [data, selected])

  async function addTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const symbol = tickerInput.trim()
    if (!symbol) return
    setTickerError('')
    try {
      const base = import.meta.env.VITE_API_URL ?? ''
      const res = await fetch(`${base}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })
      const body = await res.json()
      if (!res.ok) {
        setTickerError(body.error ?? 'Não foi possível adicionar o ticker')
        return
      }
      const normalized = symbol.toUpperCase().includes(':') ? symbol.toUpperCase() : `BMFBOVESPA:${symbol.toUpperCase()}`
      setSelected(normalized)
      setTickerInput('')
      reloadWatchlist()
    } catch {
      setTickerError('Falha de rede ao adicionar o ticker')
    }
  }

  async function removeTicker(symbol: string) {
    if (selected === symbol) setSelected('')
    const base = import.meta.env.VITE_API_URL ?? ''
    await fetch(`${base}/api/watchlist/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    })
    reloadWatchlist()
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
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 sm:gap-4">
        {/* Coluna esquerda: watchlist skeleton */}
        <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-2 sm:p-3 space-y-2 order-2 lg:order-1">
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
        <div className="space-y-3 sm:space-y-4 order-1 lg:order-2">
          <div className="h-[300px] lg:h-[480px] bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border overflow-hidden">
            <Skeleton className="h-full w-full" />
          </div>
          <SkeletonAssetCard />
        </div>
      </div>
    </div>
  )
  if (error) return (
    <div className="text-accent-red text-xs sm:text-sm p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
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
    <div className="space-y-4 sm:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-text-primary dark:text-dark-text-primary">Radar de Mercado</h1>
          <p className="text-[10px] sm:text-xs text-text-muted dark:text-dark-text-muted mt-0.5">
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
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 sm:gap-4">
        {/* Coluna esquerda: watchlist */}
        <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border max-h-[50dvh] lg:max-h-[calc(100dvh-180px)] overflow-y-auto order-2 lg:order-1">
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
            {tickerError && (
              <p className="mt-2 text-[10px] text-accent-red">{tickerError}</p>
            )}
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
              {selected} foi registrado para acompanhamento. O gráfico já abre pelo TradingView; os indicadores calculados (score, regime, alertas) entram assim que a próxima varredura do radar rodar.
            </div>
          )}
        </div>
      </div>

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
