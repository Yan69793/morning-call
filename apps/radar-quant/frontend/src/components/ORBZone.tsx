import type { OperatorSnapshot } from '../types'
import { fmtPrice } from '../lib/formatters'

export function ORBZone({ snap }: { snap: OperatorSnapshot }) {
  const range = snap.orHigh - snap.orLow
  const pctInRange = range > 0 ? ((snap.last - snap.orLow) / range) * 100 : 50
  const clampedPct = Math.max(2, Math.min(98, pctInRange))

  const signalStyle =
    snap.signal === 'LONG'  ? 'text-accent-neon bg-green-950' :
    snap.signal === 'SHORT' ? 'text-accent-red bg-red-950'   :
    'text-text-muted bg-slate-800'

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Opening Range</h3>
        <span className={`text-xs font-bold px-3 py-1 rounded-full font-mono ${signalStyle}`}>
          {snap.signal}
        </span>
      </div>

      {/* Visualização da zona */}
      <div className="relative h-14 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="absolute inset-x-0 top-1/4 h-1/2 bg-blue-500/10 border-y border-blue-500/20" />
        <div
          className="absolute w-0.5 h-full bg-slate-300/80 transition-all duration-300"
          style={{ left: `${clampedPct}%` }}
        />
        <span className="absolute left-2 top-1 text-[9px] text-green-400 font-mono">{fmtPrice(snap.orHigh)}</span>
        <span className="absolute left-2 bottom-1 text-[9px] text-red-400 font-mono">{fmtPrice(snap.orLow)}</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-blue-400 font-mono">
          VWAP {fmtPrice(snap.vwap)}
        </span>
      </div>

      {/* Grid de preços */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Stop</div>
          <div className="font-mono text-sm font-semibold text-red-400">{fmtPrice(snap.stopPrice)}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Atual</div>
          <div className="font-mono text-sm font-semibold text-slate-200">{fmtPrice(snap.last)}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Alvo</div>
          <div className="font-mono text-sm font-semibold text-green-400">{fmtPrice(snap.targetPrice)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${snap.orbActive ? 'bg-accent-neon animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-[10px] text-slate-400">
          ORB {snap.orbActive ? 'ativo' : 'aguardando'}
        </span>
      </div>
    </div>
  )
}
