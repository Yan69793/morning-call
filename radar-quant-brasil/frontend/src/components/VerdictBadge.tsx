import type { SignalVerdict } from '../types'

const MAP: Record<SignalVerdict, { bg: string; text: string; label: string }> = {
  COMPRAR:  { bg: 'bg-green-50', text: 'text-accent-green', label: 'Comprar' },
  AGUARDAR: { bg: 'bg-amber-50', text: 'text-accent-yellow', label: 'Aguardar' },
  VENDER:   { bg: 'bg-red-50',   text: 'text-accent-red',   label: 'Vender' },
}

export function VerdictBadge({ verdict }: { verdict: SignalVerdict }) {
  const { bg, text, label } = MAP[verdict]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${bg} ${text}`}>
      {label}
    </span>
  )
}
