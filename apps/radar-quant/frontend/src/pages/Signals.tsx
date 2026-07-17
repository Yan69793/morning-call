import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { SignalFeed } from '../components/SignalFeed'
import type { SignalDocument, SignalMode } from '../types'

export function Signals() {
  const [mode, setMode] = useState<SignalMode>('swing')
  const { data, loading, error } = useApi<SignalDocument[]>('/api/signals/latest', 60_000)

  const signals = (data ?? []).filter(s => s.mode === mode)

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-semibold text-text-primary dark:text-dark-text-primary">Sinais</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(['swing', 'intraday'] as SignalMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                mode === m ? 'bg-white dark:bg-gray-700 text-text-primary dark:text-dark-text-primary shadow-sm' : 'text-text-muted dark:text-dark-text-muted'
              }`}
            >
              {m === 'swing' ? 'Swing' : 'Intraday'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-text-muted dark:text-dark-text-muted text-xs sm:text-sm">Carregando sinais...</div>}
      {error && <div className="text-accent-red text-xs sm:text-sm">Erro: {error}</div>}
      {!loading && !error && <SignalFeed signals={signals} mode={mode} />}
    </div>
  )
}
