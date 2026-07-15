// dashboard/shared/types.ts

export interface Quality {
  partialSession: boolean
  missingBars: boolean
  staleLastBar: boolean
  flatRange: boolean
  symbolError: boolean
}

export interface Metrics {
  ret_1d: number
  ret_5d: number
  ret_20d: number
  ret_60d: number
  ret_120d: number
  rangePos_60d: number
  upDays_5: number
}

export type Regime = 'ALTA' | 'NEUTRO' | 'BAIXA' | 'TRANQUILO'
export type BiasStrength = 'forte' | 'moderado' | 'lateral'

export interface RadarItem {
  symbol: string
  name: string
  type: 'macro' | 'acao' | 'rates' | 'fx' | 'commodity' | 'cripto' | 'indice' | 'vix'
  kind: string
  sector?: string
  last: number
  metrics: Metrics
  score: number
  bias: { label: string; strength: BiasStrength }
  regime: Regime
  alert: boolean
  quality: Quality
}

export interface NewsItem {
  title: string
  source: string
  url?: string
  publishedAt: string
  summary?: string
}

export interface ScanDocument {
  scanId: string
  schemaVersion: string
  marketDate: string
  generatedAt: string
  items: RadarItem[]
  news: { macro: NewsItem[]; [key: string]: NewsItem[] }
  warnings: string[]
}

export interface OptimizationResult {
  or_bars: number
  stop_pct: number
  rr: number
  use_vwap: boolean
  allow_sh: boolean
  mode_24h: boolean
  profit_factor: number
  win_rate: number
  win_trades: number
  total_trades: number
  pnl_pct: number
  max_dd_pct: number
}

export interface OperatorSnapshot {
  symbol: string
  timestamp: string
  last: number
  vwap: number
  orHigh: number
  orLow: number
  signal: 'LONG' | 'SHORT' | 'FLAT'
  stopPrice: number
  targetPrice: number
  orbActive: boolean
}

// ---- Signal Intelligence ----

export type SignalVerdict = 'COMPRAR' | 'AGUARDAR' | 'VENDER'
export type SignalMode = 'intraday' | 'swing'
export type SignalConviction = 'ALTA' | 'MEDIA' | 'BAIXA'

export interface SignalPlan {
  verdict: SignalVerdict
  entry: number
  stop: number
  target1: number
  target2: number | null
  conviction: SignalConviction
  riskReward: number
  indicatorsUsed: string[]
  justification: string
}

export interface SignalMacroContext {
  ibovRegime: Regime
  ibovScore: number
  vixLast: number
  vixRegime: Regime
  usdbrlLast: number
}

export interface SignalDocument {
  signalId: string
  schemaVersion: string
  symbol: string
  name: string
  mode: SignalMode
  marketDate: string
  generatedAt: string
  plan: SignalPlan
  setupReasons: string[]
  macro: SignalMacroContext
}
