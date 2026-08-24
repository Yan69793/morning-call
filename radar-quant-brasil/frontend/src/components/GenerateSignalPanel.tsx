import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { SignalDocument } from '../types'
import { SignalCard } from './SignalCard'

type Status = 'idle' | 'loading' | 'done' | 'error'

export function GenerateSignalPanel({ symbol }: { symbol: string }) {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<SignalDocument | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  // Reset ao trocar de ativo — permite gerar de novo
  useEffect(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
  }, [symbol])

  async function generate() {
    setStatus('loading')
    setErrorMsg('')
    try {
      const base = import.meta.env.VITE_API_URL ?? ''
      const res = await fetch(base + '/api/signals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })

      if (res.ok) {
        const doc: SignalDocument = await res.json()
        setResult(doc)
        setStatus('done')
        return
      }

      let body: { error?: string } = {}
      try {
        body = await res.json()
      } catch {
        // resposta sem corpo JSON
      }
      setErrorMsg(mapError(res.status, body.error))
      setStatus('error')
    } catch {
      setErrorMsg('Falha ao gerar sinal.')
      setStatus('error')
    }
  }

  return (
    <div className="bg-bg-card dark:bg-dark-bg-card border border-bg-border dark:border-dark-bg-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
          Sinal
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={status === 'loading'}
          className="bg-accent-blue text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {status === 'loading' ? 'Gerando...' : 'Gerar Sinal'}
        </button>
      </div>

      {status === 'error' && (
        <p className="text-xs text-accent-red bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg p-2">
          {errorMsg}
        </p>
      )}

      {status === 'done' && result && (
        <div className="space-y-2">
          <SignalCard signal={result} />
          <p className="text-[11px] text-text-muted dark:text-dark-text-muted">
            <Link to="/signals" className="text-accent-blue hover:underline">
              Veja na aba Sinais
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}

function mapError(httpStatus: number, bodyError?: string): string {
  if (httpStatus === 429) {
    if (bodyError === 'daily limit') return 'Limite diário de geração atingido.'
    return 'Aguarde alguns segundos antes de gerar de novo.'
  }
  if (httpStatus === 503) {
    return 'API da Anthropic não configurada (defina o secret ANTHROPIC_API_KEY no Worker).'
  }
  if (httpStatus === 404) {
    return 'Ativo não está no último scan do radar.'
  }
  return bodyError || 'Falha ao gerar sinal.'
}
