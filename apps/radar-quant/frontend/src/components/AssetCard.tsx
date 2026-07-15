import type { RadarItem } from '../types'
import { ScoreMeter } from './ScoreMeter'
import { RegimeBadge } from './RegimeBadge'
import { QualityDot } from './QualityDot'
import { Tooltip } from './Tooltip'
import { fmtPct, fmtPrice, pctColor } from '../lib/formatters'

const PERIODS: Array<[keyof RadarItem['metrics'], string]> = [
  ['ret_1d',  '1D'],
  ['ret_5d',  '5D'],
  ['ret_20d', '20D'],
  ['ret_60d', '60D'],
]

export function AssetCard({ item }: { item: RadarItem }) {
  const ticker = item.symbol.split(':')[1] ?? item.symbol

  return (
    <div
      className={`bg-bg-card dark:bg-dark-bg-card rounded-xl border p-4 flex flex-col gap-3 transition-shadow hover:shadow-md ${
        item.alert ? 'border-accent-yellow' : 'border-bg-border dark:border-dark-bg-border'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-text-muted dark:text-dark-text-muted truncate">{item.name}</div>
          <div className="text-sm font-semibold text-text-primary dark:text-dark-text-primary font-mono">{ticker}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Tooltip content={`Regime: ${item.regime} - estado atual do mercado baseado em tendência e volatilidade.`}>
            <RegimeBadge regime={item.regime} />
          </Tooltip>
          <Tooltip content="Qualidade dos dados: indica se há problemas como sessão parcial, barras faltando ou dados obsoletos.">
            <QualityDot quality={item.quality} />
          </Tooltip>
        </div>
      </div>

      {/* Preço */}
      <div className="font-mono text-lg font-semibold text-text-primary dark:text-dark-text-primary">
        {fmtPrice(item.last)}
      </div>

      {/* Score */}
      <Tooltip content="Score composto: combinação de momentum, volatilidade e regime do ativo. Valores positivos indicam tendência de alta.">
        <ScoreMeter score={item.score} />
      </Tooltip>
      <Tooltip content={`Bias: ${item.bias.label} (${item.bias.strength}) - direção predominante do ativo baseada em indicadores técnicos.`}>
        <div className="text-[10px] text-text-muted dark:text-dark-text-muted">{item.bias.label} · {item.bias.strength}</div>
      </Tooltip>

      {/* Variações */}
      <div className="grid grid-cols-4 gap-1 pt-1 border-t border-bg-border dark:border-dark-bg-border">
        {PERIODS.map(([key, label]) => (
          <div key={key} className="flex flex-col items-center">
            <span className="text-[9px] text-text-dim dark:text-dark-text-dim uppercase tracking-wide">{label}</span>
            <span className={`font-mono text-[11px] font-semibold ${pctColor(item.metrics[key])}`}>
              {fmtPct(item.metrics[key], 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
