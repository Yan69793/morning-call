import { Skeleton } from './Skeleton'

export interface ConvergenceItem {
  symbol: string
  name: string
  aligned: boolean
  direction: 'risk_on' | 'risk_off' | 'neutro'
  reasons: string[]
}

interface ConvergenceListProps {
  items: ConvergenceItem[]
  loading?: boolean
}

function DirectionBadge({ direction }: { direction: ConvergenceItem['direction'] }) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide'

  if (direction === 'risk_on') {
    return <span className={`${base} bg-green-50 text-accent-green dark:bg-green-900/20 dark:text-green-400`}>Long</span>
  }
  if (direction === 'risk_off') {
    return <span className={`${base} bg-red-50 text-accent-red dark:bg-red-900/20 dark:text-red-400`}>Short</span>
  }
  return <span className={`${base} bg-gray-100 text-text-muted dark:bg-gray-700 dark:text-gray-400`}>Neutro</span>
}

export function ConvergenceList({ items, loading }: ConvergenceListProps) {
  if (loading) {
    return (
      <section className="space-y-2">
        <Skeleton className="h-3 w-40" />
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-3">
          Convergências do Dia
        </h2>
        <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-4">
          <p className="text-xs text-text-muted dark:text-dark-text-muted">
            Nenhuma convergência hoje entre o cenário macro e o radar técnico.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest mb-3">
        Convergências do Dia
        <span className="text-text-dim dark:text-dark-text-dim font-normal ml-1">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.symbol}
            className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-3 hover:border-accent-blue/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold font-mono text-text-primary dark:text-dark-text-primary">
                  {item.symbol}
                </span>
                <span className="text-[11px] text-text-muted dark:text-dark-text-muted">
                  {item.name}
                </span>
              </div>
              <DirectionBadge direction={item.direction} />
            </div>
            <div className="flex flex-wrap gap-1">
              {item.reasons.map((reason, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-text-muted dark:text-gray-400"
                >
                  {reason}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
