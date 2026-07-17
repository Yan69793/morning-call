import { Skeleton } from './Skeleton'

export type MacroRegimeLabel =
  | 'goldilocks'
  | 'reflacionario'
  | 'estagflacionario'
  | 'desinflacionario'
  | 'recessivo'
  | 'risk_on_especulativo'
  | 'risk_off_sistemico'
  | 'transicao'

export type MacroBiasLabel = 'comprador' | 'vendedor' | 'neutro' | 'long_vol' | 'short_vol'

export interface MacroSummaryData {
  regime: MacroRegimeLabel
  vies: MacroBiasLabel
  conviccao: number
  tensaoMacroDominante: string
}

const REGIME_LABELS: Record<MacroRegimeLabel, string> = {
  goldilocks: 'Goldilocks',
  reflacionario: 'Reflacionário',
  estagflacionario: 'Estagflacionário',
  desinflacionario: 'Desinflacionário',
  recessivo: 'Recessivo',
  risk_on_especulativo: 'Risk-On Especulativo',
  risk_off_sistemico: 'Risk-Off Sistêmico',
  transicao: 'Transição',
}

const REGIME_STYLES: Record<MacroRegimeLabel, string> = {
  goldilocks: 'bg-green-50 text-accent-green border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400',
  reflacionario: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400',
  estagflacionario: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
  desinflacionario: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400',
  recessivo: 'bg-red-50 text-accent-red border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
  risk_on_especulativo: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400',
  risk_off_sistemico: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300',
  transicao: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400',
}

const BIAS_LABELS: Record<MacroBiasLabel, string> = {
  comprador: 'Comprador',
  vendedor: 'Vendedor',
  neutro: 'Neutro',
  long_vol: 'Long Vol',
  short_vol: 'Short Vol',
}

function BiasBadge({ vies }: { vies: MacroBiasLabel }) {
  const isRisk = vies === 'comprador' || vies === 'long_vol'
  const isHedge = vies === 'vendedor' || vies === 'short_vol'

  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide'
  const style = isRisk
    ? 'bg-green-50 text-accent-green dark:bg-green-900/20 dark:text-green-400'
    : isHedge
      ? 'bg-red-50 text-accent-red dark:bg-red-900/20 dark:text-red-400'
      : 'bg-gray-100 text-text-muted dark:bg-gray-700 dark:text-gray-400'

  return <span className={`${base} ${style}`}>{BIAS_LABELS[vies] ?? vies}</span>
}

function ConviccaoBar({ value }: { value: number }) {
  const pct = Math.round((value / 10) * 100)
  const color = value >= 8 ? 'bg-accent-green' : value >= 6 ? 'bg-accent-yellow' : 'bg-accent-red'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-semibold text-text-muted dark:text-dark-text-muted w-6 text-right">
        {value}/10
      </span>
    </div>
  )
}

interface MacroSummaryPanelProps {
  macro: MacroSummaryData | null
  loading?: boolean
}

export function MacroSummaryPanel({ macro, loading }: MacroSummaryPanelProps) {
  if (loading) {
    return (
      <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-3 sm:p-4 space-y-2 sm:space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="h-4 sm:h-5 w-20 sm:w-24 rounded-full" />
          <Skeleton className="h-4 sm:h-5 w-16 sm:w-20 rounded-full" />
        </div>
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-3/4" />
      </div>
    )
  }

  if (!macro) {
    return (
      <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-3 sm:p-4">
        <div className="flex items-center gap-2 text-text-muted dark:text-dark-text-muted text-[10px] sm:text-xs">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
          Resumo macro indisponível — Morning Call ainda não rodou hoje ou o endpoint está fora do ar.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-3 sm:p-4 space-y-2.5 sm:space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] sm:text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
          Cenário Macro
        </h2>
        <BiasBadge vies={macro.vies} />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span
          className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold tracking-wide border ${REGIME_STYLES[macro.regime] ?? 'bg-gray-100 text-text-muted border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'}`}
        >
          {REGIME_LABELS[macro.regime] ?? macro.regime}
        </span>
      </div>

      <ConviccaoBar value={macro.conviccao} />

      <p className="text-[11px] sm:text-xs text-text-primary dark:text-dark-text-primary leading-relaxed">
        {macro.tensaoMacroDominante}
      </p>
    </div>
  )
}
