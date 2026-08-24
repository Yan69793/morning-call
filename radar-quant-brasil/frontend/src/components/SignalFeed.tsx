import type { SignalDocument, SignalMode } from '../types'
import { SignalCard } from './SignalCard'

export function SignalFeed({ signals, mode }: { signals: SignalDocument[]; mode: SignalMode }) {
  if (signals.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 space-y-2">
        <p className="text-xs sm:text-sm font-semibold text-amber-800">Nenhum sinal {mode} disponível</p>
        <p className="text-[10px] sm:text-xs text-amber-700">Gere um na sessão Claude Code:</p>
        <code className="block text-[9px] sm:text-[10px] bg-amber-100 rounded-lg px-3 py-2 text-amber-900 font-mono">
          /signal {mode} &lt;SÍMBOLO&gt;
        </code>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {signals.map(s => <SignalCard key={s.signalId} signal={s} />)}
    </div>
  )
}
