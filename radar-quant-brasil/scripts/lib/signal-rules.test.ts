import { describe, it, expect } from 'vitest'
import { evaluateSwingSetup, type SwingInput } from './signal-rules'

const base: SwingInput = {
  score: 52, regime: 'ALTA', ret_20d: 4, rangePos_60d: 70, upDays_5: 4,
  ibovScore: 10, vixRiscoOff: false, symbolError: false,
}

describe('evaluateSwingSetup', () => {
  it('aprova LONG quando todas as condições passam', () => {
    const r = evaluateSwingSetup(base)
    expect(r.valid).toBe(true)
    expect(r.direction).toBe('LONG')
  })

  it('bloqueia quando VIX em RISCO', () => {
    const r = evaluateSwingSetup({ ...base, vixRiscoOff: true })
    expect(r.valid).toBe(false)
  })

  it('marca neutro quando score na banda -15..15', () => {
    const r = evaluateSwingSetup({ ...base, score: 5, regime: 'NEUTRO', ret_20d: 0, rangePos_60d: 50, upDays_5: 2 })
    expect(r.valid).toBe(false)
    expect(r.direction).toBe('NEUTRO')
  })

  it('bloqueia com symbolError', () => {
    const r = evaluateSwingSetup({ ...base, symbolError: true })
    expect(r.valid).toBe(false)
  })
})
