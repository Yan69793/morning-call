import type { RadarItem } from '../types'
import { pctColor } from '../lib/formatters'

interface Props {
  a: RadarItem[]
  b: RadarItem[]
  dateA: string
  dateB: string
}

export function ScanDiff({ a, b, dateA, dateB }: Props) {
  const mapB = new Map(b.map(i => [i.symbol, i]))

  const rows = a
    .map(item => {
      const prev = mapB.get(item.symbol)
      return {
        item,
        scoreDelta: prev != null ? item.score - prev.score : null,
        regimeChanged: prev != null && item.regime !== prev.regime,
        prev,
      }
    })
    .sort((x, y) => (y.scoreDelta ?? 0) - (x.scoreDelta ?? 0))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bg-border">
            {[
              'Ativo',
              `Score ${dateA}`,
              `Score ${dateB}`,
              'Δ Score',
              `Regime ${dateA}`,
              `Regime ${dateB}`,
            ].map(h => (
              <th key={h} className="text-[10px] text-text-muted uppercase tracking-wide px-3 py-2.5 text-right first:text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-bg-border">
          {rows.map(({ item, scoreDelta, regimeChanged, prev }) => (
            <tr key={item.symbol} className="hover:bg-bg-hover transition-colors">
              <td className="px-3 py-2 text-left">
                <span className="font-medium text-text-primary">{item.name}</span>
                <span className="text-[10px] text-text-muted ml-1.5 font-mono">
                  {item.symbol.split(':')[1]}
                </span>
              </td>
              <td className="font-mono px-3 py-2 text-right text-text-primary">{item.score}</td>
              <td className="font-mono px-3 py-2 text-right text-text-muted">{prev?.score ?? '–'}</td>
              <td className={`font-mono px-3 py-2 text-right font-semibold ${scoreDelta != null ? pctColor(scoreDelta) : 'text-text-muted'}`}>
                {scoreDelta != null ? (scoreDelta >= 0 ? '+' : '') + scoreDelta : '–'}
              </td>
              <td className="px-3 py-2 text-right text-text-muted">{item.regime}</td>
              <td className={`px-3 py-2 text-right ${regimeChanged ? 'text-accent-yellow font-semibold' : 'text-text-muted'}`}>
                {prev?.regime ?? '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
