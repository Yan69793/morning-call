import type { Quality } from '../types'

export function QualityDot({ quality }: { quality: Quality }) {
  const issues = [
    quality.staleLastBar && 'Barra defasada',
    quality.missingBars && 'Barras faltando',
    quality.flatRange && 'Range plano',
    quality.symbolError && 'Erro de símbolo',
  ].filter(Boolean) as string[]

  if (issues.length === 0) {
    return <span title="Dados OK" className="text-accent-green text-[10px]" aria-label="Dados OK">●</span>
  }
  return (
    <span title={issues.join(', ')} className="text-accent-yellow text-[10px] cursor-help" aria-label={issues.join(', ')}>
      ▲
    </span>
  )
}
