/**
 * Motor quantitativo — núcleo puro (src/quant). Sem rede, sem LLM.
 *
 * Todo número que aparece no Morning Call nasce aqui ou num DataPoint (CLAUDE.md §3). Este módulo
 * é a versão de produção, em TypeScript, do `skill/morning-call/scripts/quant.py`: o Python deixa
 * de ser runtime e passa a ser a referência dos golden tests (fecha PC-2 / AD-1).
 *
 * Convenções: preços em ordem cronológica crescente; base 252 dias úteis para anualização;
 * log-retornos para agregação temporal; variância amostral (n-1) em vol e z-score.
 */

export const TRADING_DAYS = 252;

/** Retorno simples de p0 para p1. */
export function simpleReturn(p0: number, p1: number): number {
  if (p0 === 0) throw new Error("preço inicial zero");
  return p1 / p0 - 1;
}

/** Retorno simples do período (primeiro → último). */
export function periodReturn(prices: readonly number[]): number {
  if (prices.length < 2) throw new Error("mínimo 2 preços");
  return simpleReturn(prices[0]!, prices[prices.length - 1]!);
}

/** Log-retornos consecutivos. Série com < 2 pontos devolve []. */
export function logReturns(prices: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) out.push(Math.log(prices[i]! / prices[i - 1]!));
  return out;
}

/** Vol realizada (desvio amostral dos log-retornos), anualizada por padrão. */
export function realizedVol(prices: readonly number[], annualize = true): number {
  const lr = logReturns(prices);
  if (lr.length < 2) return 0;
  const mean = lr.reduce((a, b) => a + b, 0) / lr.length;
  const variance = lr.reduce((a, b) => a + (b - mean) ** 2, 0) / (lr.length - 1);
  const vol = Math.sqrt(variance);
  return annualize ? vol * Math.sqrt(TRADING_DAYS) : vol;
}

/** Drawdown máximo pico-a-vale (≤ 0). */
export function maxDrawdown(prices: readonly number[]): number {
  if (prices.length === 0) throw new Error("série vazia");
  let peak = prices[0]!;
  let mdd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = p / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}

/** Retorno acumulado nos últimos `window` passos. */
export function momentum(prices: readonly number[], window: number): number {
  if (window < 1 || prices.length < window + 1) throw new Error("janela maior que a série");
  return simpleReturn(prices[prices.length - 1 - window]!, prices[prices.length - 1]!);
}

/** Z-score de `value` (ou do último ponto) vs. a distribuição da série (desvio amostral). */
export function zscore(series: readonly number[], value?: number): number {
  if (series.length < 2) return 0;
  const x = value ?? series[series.length - 1]!;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / (series.length - 1);
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : (x - mean) / sd;
}

/** Correlação de Pearson sobre duas séries de MESMO tamanho (alinhar por data antes). */
export function correlation(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length < 2) throw new Error("séries de mesmo tamanho, >= 2");
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i]! - ma) * (b[i]! - mb);
    va += (a[i]! - ma) ** 2;
    vb += (b[i]! - mb) ** 2;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

/** Inclinação em bps (longo − curto). Entradas em % a.a. (ex.: 14.25). */
export function curveSlope(yShort: number, yLong: number): number {
  return (yLong - yShort) * 100;
}

/** Curvatura (butterfly) em bps: 2·meio − curto − longo. */
export function curveButterfly(yShort: number, yMid: number, yLong: number): number {
  return (2 * yMid - yShort - yLong) * 100;
}

/** Inflação implícita a partir de pré e juro real (frações, ex.: 0.14 e 0.07). */
export function breakevenInflation(pre: number, real: number): number {
  return (1 + pre) / (1 + real) - 1;
}

/** Assimetria |alvo − entrada| / |entrada − invalidação|. */
export function riskReward(entry: number, target: number, invalidation: number): number {
  const risk = Math.abs(entry - invalidation);
  if (risk === 0) throw new Error("invalidação igual à entrada");
  return Math.abs(target - entry) / risk;
}
