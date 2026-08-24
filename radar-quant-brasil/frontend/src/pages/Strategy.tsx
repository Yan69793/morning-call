import { useState, useMemo } from 'react'
import { useApi } from '../hooks/useApi'
import { OptimizationTable } from '../components/OptimizationTable'
import { OptimizationFilters, type Filters } from '../components/OptimizationFilters'
import type { OptimizationResult } from '../types'

const DEFAULT_FILTERS: Filters = {
  minTrades: 50,
  minProfitFactor: 0,
  sortBy: 'profit_factor',
  sortDir: 'desc',
  useVwap: 'all',
  allowSh: 'all',
}

export function Strategy() {
  const { data, loading, error } = useApi<OptimizationResult[]>('/api/optimization')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const filtered = useMemo(() => {
    if (!data) return []
    return data
      .filter(r => r.total_trades >= filters.minTrades)
      .filter(r => r.profit_factor >= filters.minProfitFactor)
      .filter(r => filters.useVwap === 'all' || String(r.use_vwap) === filters.useVwap)
      .filter(r => filters.allowSh === 'all' || String(r.allow_sh) === filters.allowSh)
      .sort((a, b) => {
        const diff = a[filters.sortBy] - b[filters.sortBy]
        return filters.sortDir === 'desc' ? -diff : diff
      })
  }, [data, filters])

  if (loading) return <div className="flex items-center justify-center h-48 text-text-muted text-xs sm:text-sm">Carregando...</div>
  if (error) return <div className="text-accent-red text-xs sm:text-sm p-3 sm:p-4 bg-red-50 border border-red-100 rounded-xl">Erro: {error}</div>

  const top3 = filtered.slice(0, 3)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-base sm:text-lg font-semibold text-text-primary">Estratégia ORB + VWAP</h1>
        <p className="text-[10px] sm:text-xs text-text-muted mt-0.5">
          {data?.length?.toLocaleString('pt-BR')} combinações · {filtered.length.toLocaleString('pt-BR')} após filtros
        </p>
      </div>

      {/* Top 3 */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {top3.map((r, i) => (
            <div key={i} className="bg-white border border-bg-border rounded-xl p-3 sm:p-4 space-y-2">
              <div className="text-[9px] sm:text-[10px] text-text-muted uppercase tracking-widest">#{i + 1} melhor</div>
              <div className="font-mono text-sm sm:text-base font-semibold text-accent-green">PF {r.profit_factor.toFixed(3)}</div>
              <div className="text-[10px] sm:text-[11px] text-text-muted leading-relaxed">
                OR{r.or_bars} · Stop {r.stop_pct}% · RR {r.rr}
                <br />
                {r.use_vwap ? 'Com VWAP' : 'Sem VWAP'} · {r.allow_sh ? 'Long + Short' : 'Só Long'}
              </div>
              <div className={`font-mono text-sm font-semibold ${r.pnl_pct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                PnL {r.pnl_pct >= 0 ? '+' : ''}{r.pnl_pct.toFixed(2)}%
              </div>
              <div className="text-[10px] text-text-muted">WR {r.win_rate.toFixed(1)}% · {r.total_trades} trades</div>
            </div>
          ))}
        </div>
      )}

      <OptimizationFilters filters={filters} onChange={setFilters} total={data?.length ?? 0} filtered={filtered.length} />

      <div className="bg-white border border-bg-border rounded-xl overflow-hidden">
        <OptimizationTable rows={filtered} />
      </div>
    </div>
  )
}
