import type { OptimizationResult } from '../types'
import { fmtPct, pctColor } from '../lib/formatters'

interface Props { rows: OptimizationResult[] }

export function OptimizationTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-text-muted text-sm p-8 text-center">
        Nenhuma combinação corresponde aos filtros.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bg-border">
            {['OR', 'Stop%', 'RR', 'VWAP', 'Short', 'PF', 'WR%', 'Trades', 'PnL%', 'MaxDD%'].map(h => (
              <th key={h} className="text-[10px] text-text-muted uppercase tracking-wide px-3 py-2.5 text-right first:text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-bg-border">
          {rows.map((r, i) => (
            <tr key={i} className={`hover:bg-bg-hover transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-bg'}`}>
              <td className="font-mono px-3 py-2 text-left text-text-primary">{r.or_bars}</td>
              <td className="font-mono px-3 py-2 text-right text-text-muted">{r.stop_pct}%</td>
              <td className="font-mono px-3 py-2 text-right text-text-muted">{r.rr}</td>
              <td className="px-3 py-2 text-right text-text-muted">{r.use_vwap ? '✓' : '–'}</td>
              <td className="px-3 py-2 text-right text-text-muted">{r.allow_sh ? '✓' : '–'}</td>
              <td className={`font-mono px-3 py-2 text-right font-semibold ${r.profit_factor >= 1 ? 'text-accent-green' : 'text-accent-red'}`}>
                {r.profit_factor.toFixed(3)}
              </td>
              <td className="font-mono px-3 py-2 text-right text-text-muted">{r.win_rate.toFixed(1)}%</td>
              <td className="font-mono px-3 py-2 text-right text-text-muted">{r.total_trades}</td>
              <td className={`font-mono px-3 py-2 text-right font-semibold ${pctColor(r.pnl_pct)}`}>
                {fmtPct(r.pnl_pct)}
              </td>
              <td className="font-mono px-3 py-2 text-right text-accent-yellow">{r.max_dd_pct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
