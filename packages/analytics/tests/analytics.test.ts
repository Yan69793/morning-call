// Testes do núcleo analítico — portado de analytics.test.mjs para Vitest/TS
import { describe, it, expect } from 'vitest'
import {
  computeMetrics,
  computeScore,
  computeBias,
  classifyRegime,
  qualityFlags,
  buildItem,
  isRankable,
  type Bar,
} from '../src/index.js'

// ---------- helpers de construção de séries ----------

interface MakeBarsOpts {
  startTime?: number
  stepDays?: number
  partialLast?: boolean
  flat?: boolean
}

// Gera `n` candles a partir de uma curva de closes. high/low derivados do close.
function makeBars(closes: number[], opts: MakeBarsOpts = {}): Bar[] {
  const { startTime = 1700000000, stepDays = 1, partialLast = false, flat = false } = opts
  return closes.map((c, i) => {
    const close = flat ? closes[0] : c
    const open = close
    const high = flat ? close : close * 1.01
    const low = flat ? close : close * 0.99
    const bar: Bar = { time: startTime + i * stepDays * 86400, open, high, low, close }
    if (partialLast && i === closes.length - 1) bar.partial = true
    return bar
  })
}

// série crescente: alta clara
function risingCloses(n: number, start = 100, stepPct = 0.5): number[] {
  const out: number[] = []
  let v = start
  for (let i = 0; i < n; i++) {
    v = v * (1 + stepPct / 100)
    out.push(Number(v.toFixed(4)))
  }
  return out
}

// série decrescente: baixa clara
function fallingCloses(n: number, start = 100, stepPct = 0.5): number[] {
  const out: number[] = []
  let v = start
  for (let i = 0; i < n; i++) {
    v = v * (1 - stepPct / 100)
    out.push(Number(v.toFixed(4)))
  }
  return out
}

// ---------- métricas ----------

describe('computeMetrics', () => {
  it('retornos e posição na faixa em série de alta', () => {
    const bars = makeBars(risingCloses(130))
    const m = computeMetrics(bars)
    expect(m.ret_1d).toBeGreaterThan(0)
    expect(m.ret_20d).toBeGreaterThan(0)
    expect(m.ret_120d).toBeGreaterThan(0)
    expect(m.rangePos_60d).toBeGreaterThan(80)
    expect(m.upDays_5).toBe(5)
  })

  it('janela curta retorna nulls nos prazos longos', () => {
    const bars = makeBars(risingCloses(10))
    const m = computeMetrics(bars)
    expect(m.ret_1d).not.toBeNull()
    expect(m.ret_5d).not.toBeNull()
    expect(m.ret_20d).toBeNull()
    expect(m.ret_120d).toBeNull()
  })

  it('array vazio retorna tudo null', () => {
    const m = computeMetrics([])
    expect(m.ret_1d).toBeNull()
    expect(m.rangePos_60d).toBeNull()
    expect(m.upDays_5).toBeNull()
  })

  it('range zero não divide por zero', () => {
    const m = computeMetrics(makeBars(risingCloses(130), { flat: true }))
    expect(m.rangePos_60d).toBeNull()
  })
})

// ---------- score ----------

describe('computeScore', () => {
  it('série de alta gera score alto positivo', () => {
    const m = computeMetrics(makeBars(risingCloses(130)))
    const s = computeScore(m)
    expect(s).toBeGreaterThan(40)
  })

  it('série de baixa gera score negativo', () => {
    const m = computeMetrics(makeBars(fallingCloses(130)))
    const s = computeScore(m)
    expect(s).toBeLessThan(-40)
  })

  it('sem tendência e sem posição retorna null', () => {
    const s = computeScore({
      ret_20d: null, ret_60d: null, ret_120d: null, rangePos_60d: null, upDays_5: null,
      ret_1d: null, ret_5d: null
    })
    expect(s).toBeNull()
  })

  it('nunca extrapola -100..100', () => {
    const m = computeMetrics(makeBars(risingCloses(130, 100, 5))) // alta muito forte
    const s = computeScore(m)
    expect(s).not.toBeNull()
    expect(s!).toBeLessThanOrEqual(100)
    expect(s!).toBeGreaterThanOrEqual(-100)
  })
})

// ---------- viés ----------

describe('computeBias', () => {
  it('mapeamento por faixa de score', () => {
    expect(computeBias(70)).toEqual({ label: 'viés de alta', strength: 'forte' })
    expect(computeBias(25)).toEqual({ label: 'viés de alta', strength: 'moderado' })
    expect(computeBias(0)).toEqual({ label: 'neutro', strength: 'lateral' })
    expect(computeBias(-25)).toEqual({ label: 'viés de baixa', strength: 'moderado' })
    expect(computeBias(-70)).toEqual({ label: 'viés de baixa', strength: 'forte' })
    expect(computeBias(null)).toEqual({ label: 'sem dado', strength: 'n/d' })
  })
})

// ---------- regime + alerta ----------

describe('classifyRegime', () => {
  it('ALTA quando tendência, posição e curtíssimo prazo alinham', () => {
    const metrics = { ret_1d: 1, ret_5d: 2, ret_20d: 8, rangePos_60d: 75, ret_60d: null, ret_120d: null, upDays_5: null }
    const r = classifyRegime({ kind: 'acao', last: 50, metrics }, 4)
    expect(r.regime).toBe('ALTA')
    expect(r.alert).toBe(false)
  })

  it('BAIXA simétrica', () => {
    const metrics = { ret_1d: -1, ret_5d: -2, ret_20d: -8, rangePos_60d: 25, ret_60d: null, ret_120d: null, upDays_5: null }
    const r = classifyRegime({ kind: 'acao', last: 50, metrics }, 4)
    expect(r.regime).toBe('BAIXA')
  })

  it('alerta dispara acima do limiar de ret_1d', () => {
    const metrics = { ret_1d: -6, ret_5d: -2, ret_20d: -1, rangePos_60d: 45, ret_60d: null, ret_120d: null, upDays_5: null }
    const r = classifyRegime({ kind: 'acao', last: 50, metrics }, 4)
    expect(r.alert).toBe(true)
    expect(r.regime).toBe('NEUTRO')
  })

  it('VIX invertido: três faixas', () => {
    expect(classifyRegime({ kind: 'vix', last: 30 })).toEqual({ regime: 'RISCO', alert: true })
    expect(classifyRegime({ kind: 'vix', last: 20 })).toEqual({ regime: 'ATENCAO', alert: false })
    expect(classifyRegime({ kind: 'vix', last: 12 })).toEqual({ regime: 'TRANQUILO', alert: false })
    expect(classifyRegime({ kind: 'vix', last: null })).toEqual({ regime: 'SEM_DADO', alert: false })
  })

  it('sem base retorna SEM_DADO', () => {
    const r = classifyRegime({
      kind: 'acao',
      last: null,
      metrics: { ret_1d: null, ret_5d: null, ret_20d: null, rangePos_60d: null, ret_60d: null, ret_120d: null, upDays_5: null }
    }, 4)
    expect(r.regime).toBe('SEM_DADO')
  })
})

// ---------- flags de qualidade ----------

describe('qualityFlags', () => {
  it('missingBars quando série abaixo do esperado', () => {
    const q = qualityFlags(makeBars(risingCloses(50)), { expectedBars: 120 })
    expect(q.missingBars).toBe(true)
    expect(q.symbolError).toBe(false)
  })

  it('partialSession quando última barra é parcial', () => {
    const q = qualityFlags(makeBars(risingCloses(130), { partialLast: true }), { expectedBars: 120 })
    expect(q.partialSession).toBe(true)
  })

  it('flatRange quando high==low', () => {
    const q = qualityFlags(makeBars(risingCloses(130), { flat: true }), { expectedBars: 120 })
    expect(q.flatRange).toBe(true)
  })

  it('staleLastBar quando última data anterior ao pregão esperado', () => {
    const bars = makeBars(risingCloses(130))
    // força a data da última barra para um dia conhecido no passado
    bars[bars.length - 1].date = '2026-06-10'
    const q = qualityFlags(bars, { expectedBars: 1, expectedMarketDate: '2026-06-15' })
    expect(q.staleLastBar).toBe(true)
  })

  it('array vazio => symbolError + missingBars', () => {
    const q = qualityFlags([], { expectedBars: 120 })
    expect(q.symbolError).toBe(true)
    expect(q.missingBars).toBe(true)
  })
})

// ---------- buildItem (integração) ----------

describe('buildItem', () => {
  it('ação em alta vira item completo e rankável', () => {
    const meta = { symbol: 'BMFBOVESPA:PRIO3', name: 'PRIO ON', type: 'acao', kind: 'acao', sector: 'Energia' }
    const item = buildItem(meta, makeBars(risingCloses(130)), {
      expectedBars: 120, alertThresholds: { acao: 4.0 }, expectedMarketDate: null
    })
    expect(item.symbol).toBe('BMFBOVESPA:PRIO3')
    expect(item.regime).toBe('ALTA')
    expect(item.bias.label).toBe('viés de alta')
    expect(isRankable(item)).toBe(true)
  })

  it('symbolError produz item neutro não-rankável', () => {
    const meta = { symbol: 'BMFBOVESPA:VALE3', name: 'Vale ON', type: 'acao', kind: 'acao' }
    const item = buildItem(meta, [], { expectedBars: 120, alertThresholds: { acao: 4.0 } })
    expect(item.quality.symbolError).toBe(true)
    expect(item.score).toBeNull()
    expect(item.regime).toBe('SEM_DADO')
    expect(isRankable(item)).toBe(false)
  })

  it('VIX usa kind correto e regime invertido', () => {
    const meta = { symbol: 'TVC:VIX', name: 'VIX', type: 'macro', kind: 'vix' }
    const bars = makeBars(risingCloses(130))
    bars[bars.length - 1].close = 30 // VIX alto
    const item = buildItem(meta, bars, { expectedBars: 120, alertThresholds: {} })
    expect(item.regime).toBe('RISCO')
    expect(item.alert).toBe(true)
  })
})

// ---------- isRankable ----------

describe('isRankable', () => {
  it('exclui missingBars e partialSession', () => {
    const good = { score: 10, quality: { symbolError: false, missingBars: false, partialSession: false, staleLastBar: false, flatRange: false } }
    const missing = { score: 10, quality: { symbolError: false, missingBars: true, partialSession: false, staleLastBar: false, flatRange: false } }
    const partial = { score: 10, quality: { symbolError: false, missingBars: false, partialSession: true, staleLastBar: false, flatRange: false } }
    expect(isRankable(good)).toBe(true)
    expect(isRankable(missing)).toBe(false)
    expect(isRankable(partial)).toBe(false)
  })
})
