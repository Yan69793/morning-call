import type { SignalDocument } from '../types'
import { VerdictBadge } from './VerdictBadge'
import { fmtPrice, fmtPct } from '../lib/formatters'

export function SignalCard({ signal }: { signal: SignalDocument }) {
  const { plan } = signal
  const stopPct = ((plan.stop - plan.entry) / plan.entry) * 100
  const t1Pct = ((plan.target1 - plan.entry) / plan.entry) * 100
  const t2Pct = plan.target2 != null ? ((plan.target2 - plan.entry) / plan.entry) * 100 : null
  const time = new Date(signal.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <VerdictBadge verdict={plan.verdict} />
          <span className="text-xs sm:text-sm font-semibold text-text-primary">{signal.name}</span>
          <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-text-muted">{signal.mode}</span>
        </div>
        <span className="text-[9px] sm:text-[10px] text-text-muted">{time}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-center">
        <div>
          <div className="text-[9px] sm:text-[10px] text-text-muted">Entrada</div>
          <div className="text-xs sm:text-sm font-mono text-text-primary">{fmtPrice(plan.entry)}</div>
        </div>
        <div>
          <div className="text-[9px] sm:text-[10px] text-text-muted">Stop</div>
          <div className="text-xs sm:text-sm font-mono text-accent-red">{fmtPrice(plan.stop)} <span className="text-[8px] sm:text-[9px]">{fmtPct(stopPct)}</span></div>
        </div>
        <div>
          <div className="text-[9px] sm:text-[10px] text-text-muted">Alvo 1</div>
          <div className="text-xs sm:text-sm font-mono text-accent-green">{fmtPrice(plan.target1)} <span className="text-[8px] sm:text-[9px]">{fmtPct(t1Pct)}</span></div>
        </div>
        <div>
          <div className="text-[9px] sm:text-[10px] text-text-muted">Alvo 2</div>
          <div className="text-xs sm:text-sm font-mono text-accent-green">
            {plan.target2 != null ? <>{fmtPrice(plan.target2)} <span className="text-[8px] sm:text-[9px]">{fmtPct(t2Pct!)}</span></> : '—'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-text-muted">
        <span>R/R {plan.riskReward.toFixed(1)}:1</span>
        <span>Convicção {plan.conviction}</span>
      </div>

      <p className="text-[11px] sm:text-xs text-text-primary leading-relaxed">{plan.justification}</p>

      <div className="flex flex-wrap gap-1">
        {plan.indicatorsUsed.map((ind, i) => (
          <span key={i} className="text-[9px] sm:text-[10px] bg-gray-100 text-text-muted rounded px-1.5 py-0.5">{ind}</span>
        ))}
      </div>
    </div>
  )
}
