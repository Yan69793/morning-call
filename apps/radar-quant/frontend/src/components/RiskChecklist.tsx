import { useState } from 'react'

const ITEMS = [
  'Tamanho da posição calculado (1R = 1% do capital)',
  'Stop definido antes da entrada',
  'Não operar contra o regime do IBOV',
  'VWAP confirmando a direção (se filtro ativo)',
  'Abertura fora do OR — aguardar breakout confirmado',
  'VIX acima de 25 — reduzir risco pela metade',
  'Não operar nos 15 min antes do fechamento',
]

export function RiskChecklist() {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
      } else {
        next.add(i)
      }
      return next
    })

  const allOk = checked.size === ITEMS.length

  return (
    <div className="bg-bg-card rounded-xl border border-bg-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Checklist de Risco</h3>
        <span className="text-[10px] text-text-muted">{checked.size}/{ITEMS.length}</span>
      </div>

      <div className="space-y-2">
        {ITEMS.map((item, i) => (
          <label key={i} className="flex items-start gap-3 cursor-pointer group">
            <div
              onClick={() => toggle(i)}
              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                checked.has(i)
                  ? 'bg-accent-green border-accent-green'
                  : 'border-bg-border bg-white group-hover:border-accent-green'
              }`}
            >
              {checked.has(i) && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span
              onClick={() => toggle(i)}
              className={`text-xs leading-relaxed transition-colors ${
                checked.has(i) ? 'text-text-dim line-through' : 'text-text-primary'
              }`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>

      {allOk && (
        <div className="pt-3 border-t border-bg-border flex items-center gap-2">
          <span className="text-accent-green font-semibold text-xs">✓ Liberado para operar</span>
        </div>
      )}
    </div>
  )
}
