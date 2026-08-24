import type { Regime } from '../types'

const MAP: Record<string, { bg: string; text: string; label: string }> = {
  ALTA:      { bg: 'bg-green-50',  text: 'text-accent-green',  label: 'Alta' },
  BAIXA:     { bg: 'bg-red-50',    text: 'text-accent-red',    label: 'Baixa' },
  NEUTRO:    { bg: 'bg-gray-100',  text: 'text-text-muted',    label: 'Neutro' },
  TRANQUILO: { bg: 'bg-blue-50',   text: 'text-accent-blue',   label: 'Tranquilo' },
  ATENCAO:   { bg: 'bg-amber-50',  text: 'text-accent-yellow', label: 'Atenção' },
  RISCO:     { bg: 'bg-red-50',    text: 'text-accent-red',    label: 'Risco' },
}

const FALLBACK = { bg: 'bg-gray-100', text: 'text-text-muted', label: '—' }

export function RegimeBadge({ regime }: { regime: Regime }) {
  const { bg, text, label } = MAP[regime] ?? FALLBACK
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${bg} ${text}`}>
      {label}
    </span>
  )
}
