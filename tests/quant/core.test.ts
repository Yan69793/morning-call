import { describe, expect, it } from "vitest";
import {
  TRADING_DAYS,
  breakevenInflation,
  correlation,
  curveButterfly,
  curveSlope,
  logReturns,
  maxDrawdown,
  momentum,
  periodReturn,
  realizedVol,
  riskReward,
  simpleReturn,
  zscore,
} from "../../src/quant/core.js";

/**
 * Golden tests: os valores abaixo são os mesmos assertados em quant.py `_tests()`. Se o TS
 * divergir do Python, um dos dois está errado — e o número errado sai publicado como fato.
 */
describe("core quant — golden (espelha quant.py)", () => {
  it("retorno simples e de período", () => {
    expect(simpleReturn(100, 110)).toBeCloseTo(0.1, 12);
    expect(periodReturn([100, 105, 110])).toBeCloseTo(0.1, 12);
  });

  it("drawdown máximo pico-a-vale", () => {
    expect(maxDrawdown([100, 120, 60, 80])).toBeCloseTo(60 / 120 - 1, 12); // -0.5
  });

  it("momentum numa janela", () => {
    expect(momentum([10, 11, 12, 13], 2)).toBeCloseTo(13 / 11 - 1, 12);
  });

  it("correlação perfeita positiva e negativa", () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
  });

  it("z-score do ponto central de série simétrica é 0", () => {
    expect(zscore([1, 2, 3, 4, 5], 3)).toBeCloseTo(0, 9);
  });

  it("inclinação e curvatura em bps", () => {
    expect(curveSlope(14.25, 15.25)).toBeCloseTo(100, 9);
    expect(curveButterfly(14, 15, 14)).toBeCloseTo(200, 9);
  });

  it("breakeven de inflação", () => {
    expect(breakevenInflation(0.14, 0.07)).toBeCloseTo(1.14 / 1.07 - 1, 12);
  });

  it("risco-retorno 3:1", () => {
    expect(riskReward(100, 130, 90)).toBeCloseTo(3, 12);
  });

  it("vol de série constante é 0", () => {
    expect(realizedVol([100, 100, 100])).toBe(0);
  });
});

describe("core quant — propriedades e bordas", () => {
  it("logReturns tem tamanho n-1 e soma = log-retorno total", () => {
    const p = [100, 110, 99, 105];
    const lr = logReturns(p);
    expect(lr).toHaveLength(3);
    expect(lr.reduce((a, b) => a + b, 0)).toBeCloseTo(Math.log(105 / 100), 12);
  });

  it("logReturns de série curta é vazio", () => {
    expect(logReturns([100])).toEqual([]);
  });

  it("vol anualizada = vol diária × sqrt(252)", () => {
    const p = [100, 101, 99, 102, 98, 103];
    expect(realizedVol(p, true)).toBeCloseTo(realizedVol(p, false) * Math.sqrt(TRADING_DAYS), 12);
  });

  it("z-score do último ponto quando value é omitido", () => {
    // série [1..5], último = 5, média 3, desvio amostral ~1.5811 → z ~1.2649
    expect(zscore([1, 2, 3, 4, 5])).toBeCloseTo(1.264911, 5);
  });

  it("correlação de série constante é 0 (denominador zero, sem NaN)", () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
  });

  it("lança em entradas inválidas", () => {
    expect(() => simpleReturn(0, 10)).toThrow();
    expect(() => periodReturn([100])).toThrow();
    expect(() => maxDrawdown([])).toThrow();
    expect(() => momentum([1, 2], 5)).toThrow();
    expect(() => correlation([1, 2, 3], [1, 2])).toThrow();
    expect(() => riskReward(100, 130, 100)).toThrow();
  });
});
