import { useApi } from '../hooks/useApi'
import { ORBZone } from '../components/ORBZone'
import { RiskChecklist } from '../components/RiskChecklist'
import type { OperatorSnapshot } from '../types'

export function Operator() {
  const { data, loading, error } = useApi<OperatorSnapshot>('/api/operator', 30_000)

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-text-muted text-xs sm:text-sm">
      Aguardando snapshot ao vivo...
    </div>
  )

  if (error) return (
    <div className="space-y-3 sm:space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 space-y-2">
        <p className="text-xs sm:text-sm font-semibold text-amber-800">Sem snapshot ao vivo</p>
        <p className="text-[10px] sm:text-xs text-amber-700">Execute o script local durante o pregão:</p>
        <code className="block text-[9px] sm:text-[10px] bg-amber-100 rounded-lg px-3 py-2 text-amber-900 font-mono">
          npx tsx scripts/push-operator-snapshot.ts '{'{...}'}'
        </code>
      </div>
      <RiskChecklist />
    </div>
  )

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-text-primary">Modo Operador</h1>
          <p className="text-[10px] sm:text-xs text-text-muted mt-0.5">
            {data!.symbol} · atualizado {new Date(data!.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} BRT
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-accent-green">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          Ao vivo
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <ORBZone snap={data!} />
        <RiskChecklist />
      </div>
    </div>
  )
}
