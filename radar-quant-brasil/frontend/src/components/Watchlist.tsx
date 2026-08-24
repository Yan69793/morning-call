import type { RadarItem } from '../types'
import { RegimeBadge } from './RegimeBadge'
import { Tooltip } from './Tooltip'
import { fmtPct, fmtPrice, pctColor } from '../lib/formatters'

interface Props {
  items: RadarItem[]
  selected: string
  onSelect: (symbol: string) => void
}

export function Watchlist({ items, selected, onSelect }: Props) {
  return (
    <div className="flex flex-col">
      {items.map(item => {
        const ticker = item.symbol.split(':')[1] ?? item.symbol
        const isSelected = item.symbol === selected
        return (
          <button
            key={item.symbol}
            type="button"
            onClick={() => onSelect(item.symbol)}
            className={`flex items-center gap-2 w-full text-left px-3 py-2 border-l-2 transition-colors ${
              isSelected
                ? 'bg-accent-blue/10 border-accent-blue'
                : 'border-transparent hover:bg-bg-card dark:hover:bg-dark-bg-card'
            }`}
          >
            {/* Ticker + nome */}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-text-primary dark:text-dark-text-primary font-mono leading-tight">
                {ticker}
              </div>
              <div className="text-[10px] text-text-dim dark:text-dark-text-dim truncate leading-tight">
                {item.name}
              </div>
            </div>

            {/* Regime */}
            <RegimeBadge regime={item.regime} />

            {/* Preço + 1D */}
            <div className="flex flex-col items-end shrink-0 w-16">
              <span className="text-[11px] font-mono text-text-primary dark:text-dark-text-primary leading-tight">
                {fmtPrice(item.last)}
              </span>
              <span className={`text-[10px] font-mono leading-tight ${pctColor(item.metrics.ret_1d)}`}>
                {fmtPct(item.metrics.ret_1d, 1)}
              </span>
            </div>

            {/* Score */}
            <Tooltip content="Score composto: combinação de momentum, volatilidade e regime do ativo.">
              <span className="text-[11px] font-mono text-text-muted dark:text-dark-text-muted w-7 text-right shrink-0">
                {item.score > 0 ? '+' : ''}{item.score}
              </span>
            </Tooltip>
          </button>
        )
      })}
    </div>
  )
}
