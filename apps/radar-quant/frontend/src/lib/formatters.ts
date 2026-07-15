export const fmtPct = (v: number, decimals = 2): string =>
  (v >= 0 ? '+' : '') + v.toFixed(decimals) + '%'

export const fmtPrice = (v: number): string =>
  v >= 1000
    ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toFixed(2)

export const pctColor = (v: number): string =>
  v > 0 ? 'text-accent-green' : v < 0 ? 'text-accent-red' : 'text-text-muted'
