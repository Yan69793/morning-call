export interface Filters {
  minTrades: number
  minProfitFactor: number
  sortBy: 'profit_factor' | 'pnl_pct' | 'max_dd_pct' | 'win_rate'
  sortDir: 'asc' | 'desc'
  useVwap: 'all' | 'true' | 'false'
  allowSh: 'all' | 'true' | 'false'
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  total: number
  filtered: number
}

const inputCls = 'border border-bg-border rounded-lg px-3 py-1.5 text-xs bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue'
const labelCls = 'block text-[10px] text-text-muted uppercase tracking-wide mb-1'

export function OptimizationFilters({ filters, onChange, total, filtered }: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...filters, [k]: v })

  return (
    <div className="flex flex-wrap gap-3 sm:gap-4 p-3 sm:p-4 bg-white border border-bg-border rounded-xl">
      <div>
        <label className={labelCls}>Ordenar por</label>
        <select className={inputCls} value={filters.sortBy} onChange={e => set('sortBy', e.target.value as Filters['sortBy'])}>
          <option value="profit_factor">Profit Factor</option>
          <option value="pnl_pct">PnL %</option>
          <option value="max_dd_pct">Drawdown</option>
          <option value="win_rate">Win Rate</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Direção</label>
        <select className={inputCls} value={filters.sortDir} onChange={e => set('sortDir', e.target.value as Filters['sortDir'])}>
          <option value="desc">↓ Maior</option>
          <option value="asc">↑ Menor</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Mín. trades</label>
        <input type="number" min={0} className={`${inputCls} w-20`} value={filters.minTrades}
          onChange={e => set('minTrades', Number(e.target.value))} />
      </div>
      <div>
        <label className={labelCls}>Mín. PF</label>
        <input type="number" step={0.1} min={0} className={`${inputCls} w-20`} value={filters.minProfitFactor}
          onChange={e => set('minProfitFactor', Number(e.target.value))} />
      </div>
      <div>
        <label className={labelCls}>VWAP</label>
        <select className={inputCls} value={filters.useVwap} onChange={e => set('useVwap', e.target.value as Filters['useVwap'])}>
          <option value="all">Todos</option>
          <option value="true">Com VWAP</option>
          <option value="false">Sem VWAP</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Short</label>
        <select className={inputCls} value={filters.allowSh} onChange={e => set('allowSh', e.target.value as Filters['allowSh'])}>
          <option value="all">Todos</option>
          <option value="true">Com Short</option>
          <option value="false">Só Long</option>
        </select>
      </div>
      <div className="ml-auto self-end">
        <span className="text-[11px] text-text-muted">{filtered.toLocaleString('pt-BR')}/{total.toLocaleString('pt-BR')} combinações</span>
      </div>
    </div>
  )
}
