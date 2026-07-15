// dashboard/shared/analytics.ts
// Núcleo analítico — funções puras, sem I/O.
// Portado de Dashboard Monitoramento Mercado Financeiro/src/analytics.js
//
// Entrada padrão: `bars` = array de candles diários em ordem cronológica
//   [{ time, open, high, low, close, date?, partial? }, ...]
//   - time: unix seconds (opcional se `date` vier)
//   - date: "YYYY-MM-DD" (opcional; se ausente, derivado de time em UTC)
//   - partial: true se a última barra é do pregão em andamento (não fechou)
//
// Disciplina de linguagem: `score` e `bias` são LEITURA DE ESTADO atual,
// nunca previsão de preço nem probabilidade calibrada.

import type { Quality } from "./types";

export const METHODOLOGY_VERSION = "1.0.0";

export interface Bar {
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  date?: string;
  partial?: boolean;
}

export interface SymbolMeta {
  symbol: string;
  name: string;
  type: string;
  kind: string;
  sector?: string | null;
}

export interface BuildItemCtx {
  expectedBars?: number;
  expectedMarketDate?: string | null;
  alertThresholds?: Record<string, number>;
}

export interface BiasResult {
  label: string;
  strength: string;
}

export interface RegimeResult {
  regime: string;
  alert: boolean;
}

export interface AnalyticsItem {
  symbol: string;
  name: string;
  type: string;
  kind: string;
  sector: string | null;
  last: number | null;
  // `Metrics | NullMetrics` dizia "ou tudo preenchido, ou tudo nulo", mas `computeMetrics` devolve
  // cada campo independentemente nulo (série curta preenche ret_1d e não ret_120d). O tipo antigo
  // nunca bateu com a função; ninguém viu porque o tsconfig do worker só incluía `src/**`, e este
  // arquivo vivia em `shared/` — fora do typecheck.
  metrics: ComputedMetrics;
  score: number | null;
  bias: BiasResult;
  regime: string;
  alert: boolean;
  quality: Quality;
}

export type NullMetrics = {
  ret_1d: null;
  ret_5d: null;
  ret_20d: null;
  ret_60d: null;
  ret_120d: null;
  rangePos_60d: null;
  upDays_5: null;
};

const EXPECTED_BARS = 120; // janela mínima desejada para leitura de regime
const RANGE_WINDOW = 60; // janela da posição-na-faixa

// ---------- helpers ----------

function round(n: number | null | undefined, dp = 2): number | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function retPct(bars: Bar[], n: number): number | null {
  if (!Array.isArray(bars) || bars.length < n + 1) return null;
  const last = bars[bars.length - 1].close;
  const prev = bars[bars.length - 1 - n].close;
  if (typeof last !== "number" || typeof prev !== "number" || prev === 0) return null;
  return round(((last - prev) / prev) * 100);
}

function dateOf(bar: Bar | null): string | null {
  if (!bar) return null;
  if (typeof bar.date === "string") return bar.date;
  if (typeof bar.time === "number") {
    return new Date(bar.time * 1000).toISOString().slice(0, 10);
  }
  return null;
}

// média ponderada ignorando valores null; renormaliza os pesos disponíveis
function weightedAvailable(pairs: [number | null | undefined, number][]): number | null {
  let sum = 0;
  let wsum = 0;
  for (const [v, w] of pairs) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    sum += v * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  return sum / wsum;
}

// ---------- métricas ----------

export interface ComputedMetrics {
  ret_1d: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  ret_60d: number | null;
  ret_120d: number | null;
  rangePos_60d: number | null;
  upDays_5: number | null;
}

export function computeMetrics(bars: Bar[]): ComputedMetrics {
  if (!Array.isArray(bars) || bars.length === 0) {
    return {
      ret_1d: null,
      ret_5d: null,
      ret_20d: null,
      ret_60d: null,
      ret_120d: null,
      rangePos_60d: null,
      upDays_5: null,
    };
  }

  const last = bars[bars.length - 1].close;

  // posição na faixa dos últimos RANGE_WINDOW pregões (ou disponíveis, mín 2)
  let rangePos_60d: number | null = null;
  const win = bars.slice(-RANGE_WINDOW);
  if (win.length >= 2 && typeof last === "number") {
    const highs = win.map((b) => b.high).filter((x): x is number => typeof x === "number");
    const lows = win.map((b) => b.low).filter((x): x is number => typeof x === "number");
    if (highs.length && lows.length) {
      const hi = Math.max(...highs);
      const lo = Math.min(...lows);
      if (hi === lo) {
        rangePos_60d = null; // range zero — tratado como flatRange em qualityFlags
      } else {
        rangePos_60d = round(((last - lo) / (hi - lo)) * 100);
      }
    }
  }

  // pregões de alta nos últimos 5
  let upDays_5: number | null = null;
  if (bars.length >= 6) {
    upDays_5 = 0;
    for (let i = bars.length - 5; i < bars.length; i++) {
      const curr = bars[i].close;
      const prev = bars[i - 1].close;
      if (typeof curr === "number" && typeof prev === "number" && curr > prev) upDays_5++;
    }
  }

  return {
    ret_1d: retPct(bars, 1),
    ret_5d: retPct(bars, 5),
    ret_20d: retPct(bars, 20),
    ret_60d: retPct(bars, 60),
    ret_120d: retPct(bars, 120),
    rangePos_60d,
    upDays_5,
  };
}

// ---------- flags de qualidade ----------

export function qualityFlags(bars: Bar[], ctx: BuildItemCtx = {}): Quality {
  const { expectedMarketDate = null, expectedBars = EXPECTED_BARS } = ctx;

  if (!Array.isArray(bars) || bars.length === 0) {
    return {
      partialSession: false,
      missingBars: true,
      staleLastBar: false,
      flatRange: false,
      symbolError: true,
    };
  }

  const lastBar = bars[bars.length - 1];
  const partialSession = lastBar.partial === true;

  const missingBars = bars.length < expectedBars;

  let staleLastBar = false;
  const lastDate = dateOf(lastBar);
  if (expectedMarketDate && lastDate) {
    staleLastBar = lastDate < expectedMarketDate;
  }

  // flatRange: high == low na janela considerada
  let flatRange = false;
  const win = bars.slice(-RANGE_WINDOW);
  const highs = win.map((b) => b.high).filter((x): x is number => typeof x === "number");
  const lows = win.map((b) => b.low).filter((x): x is number => typeof x === "number");
  if (highs.length && lows.length) {
    flatRange = Math.max(...highs) === Math.min(...lows);
  }

  return { partialSession, missingBars, staleLastBar, flatRange, symbolError: false };
}

// ---------- score técnico (-100..100) ----------

export function computeScore(metrics: ComputedMetrics | null): number | null {
  if (!metrics) return null;
  const { ret_20d, ret_60d, ret_120d, rangePos_60d, upDays_5 } = metrics;

  // componente 1: tendência média (retornos de prazo médio/longo)
  const trendRet = weightedAvailable([
    [ret_20d, 0.5],
    [ret_60d, 0.3],
    [ret_120d, 0.2],
  ]);
  const trendComponent = trendRet === null ? null : clamp(trendRet * 5, -100, 100);
  // 20% de retorno satura em +100; -20% em -100

  // componente 2: posição na faixa (centrada em 50)
  const posComponent = rangePos_60d === null ? null : clamp((rangePos_60d - 50) * 2, -100, 100);

  // componente 3: persistência curta
  const persComponent = upDays_5 === null ? null : clamp(((upDays_5 - 2.5) / 2.5) * 100, -100, 100);

  // exige pelo menos tendência OU posição para ter score
  if (trendComponent === null && posComponent === null) return null;

  const score = weightedAvailable([
    [trendComponent, 0.5],
    [posComponent, 0.3],
    [persComponent, 0.2],
  ]);

  return score === null ? null : Math.round(clamp(score, -100, 100));
}

// ---------- viés (leitura de estado, derivada do score) ----------

export function computeBias(score: number | null): BiasResult {
  if (score === null || score === undefined) {
    return { label: "sem dado", strength: "n/d" };
  }
  if (score >= 40) return { label: "viés de alta", strength: "forte" };
  if (score >= 15) return { label: "viés de alta", strength: "moderado" };
  if (score > -15) return { label: "neutro", strength: "lateral" };
  if (score > -40) return { label: "viés de baixa", strength: "moderado" };
  return { label: "viés de baixa", strength: "forte" };
}

// ---------- regime macro + alerta ----------

export interface ClassifyInput {
  kind: string;
  last?: number | null;
  metrics?: Partial<ComputedMetrics>;
}

export function classifyRegime(item: ClassifyInput, threshold: number | null = null): RegimeResult {
  const { kind, last, metrics } = item;

  // VIX usa lógica invertida e ramo próprio
  if (kind === "vix") {
    if (typeof last !== "number") return { regime: "SEM_DADO", alert: false };
    if (last > 25) return { regime: "RISCO", alert: true };
    if (last >= 18) return { regime: "ATENCAO", alert: false };
    return { regime: "TRANQUILO", alert: false };
  }

  const m = metrics || {};
  const { ret_1d, ret_5d, ret_20d, rangePos_60d } = m;

  // sem base mínima para classificar
  if (
    ret_20d === null ||
    ret_20d === undefined ||
    rangePos_60d === null ||
    rangePos_60d === undefined
  ) {
    const alert =
      threshold !== null && typeof ret_1d === "number" ? Math.abs(ret_1d) > threshold : false;
    return {
      regime:
        (ret_20d === null || ret_20d === undefined) &&
        (rangePos_60d === null || rangePos_60d === undefined)
          ? "SEM_DADO"
          : "NEUTRO",
      alert,
    };
  }

  let regime = "NEUTRO";
  if (ret_20d > 3 && rangePos_60d > 60 && (ret_5d ?? 0) > 0) regime = "ALTA";
  else if (ret_20d < -3 && rangePos_60d < 40 && (ret_5d ?? 0) < 0) regime = "BAIXA";

  const alert =
    threshold !== null && typeof ret_1d === "number" ? Math.abs(ret_1d) > threshold : false;

  return { regime, alert };
}

// ---------- montagem do item completo ----------

export function buildItem(
  symbolMeta: SymbolMeta,
  bars: Bar[],
  ctx: BuildItemCtx = {},
): AnalyticsItem {
  const { alertThresholds = {} } = ctx;
  const kind = symbolMeta.kind || (symbolMeta.type === "acao" ? "acao" : "indice");
  const threshold = alertThresholds[kind] ?? null;

  const base = {
    symbol: symbolMeta.symbol,
    name: symbolMeta.name,
    type: symbolMeta.type,
    kind,
    sector: symbolMeta.sector ?? null,
  };

  const quality = qualityFlags(bars, ctx);

  if (quality.symbolError) {
    return {
      ...base,
      last: null,
      metrics: {
        ret_1d: null,
        ret_5d: null,
        ret_20d: null,
        ret_60d: null,
        ret_120d: null,
        rangePos_60d: null,
        upDays_5: null,
      },
      score: null,
      bias: computeBias(null),
      regime: "SEM_DADO",
      alert: false,
      quality,
    };
  }

  const last = bars[bars.length - 1].close ?? null;
  const metrics = computeMetrics(bars);
  const score = computeScore(metrics);
  const bias = computeBias(score);
  const { regime, alert } = classifyRegime({ kind, last, metrics }, threshold);

  return { ...base, last, metrics, score, bias, regime, alert, quality };
}

// ---------- elegibilidade para ranking ----------

export function isRankable(item: Partial<AnalyticsItem> | null): boolean {
  if (!item) return false;
  // Item sem `quality` é item cuja qualidade não foi apurada, e isso não é o mesmo que qualidade
  // boa. O `|| {}` antigo fazia os três testes abaixo lerem `undefined` e passarem, então um item
  // sem apuração era rankeável — falha para o lado errado, justo no gate que existe para barrar.
  const q: Partial<Quality> = item.quality ?? { symbolError: true };
  return (
    item.score !== null &&
    item.score !== undefined &&
    !q.symbolError &&
    !q.missingBars &&
    !q.partialSession
  );
}

// ---------- ranking cross-sectional ----------

export function assignCrossRanks(items: AnalyticsItem[]): void {
  const rankable = items.filter(isRankable) as (AnalyticsItem & { crossRankScore?: number })[];
  if (rankable.length < 2) return;
  rankable.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const n = rankable.length;
  rankable.forEach((item, i) => {
    item.crossRankScore = Math.round(((n - 1 - i) / (n - 1)) * 200 - 100);
  });
}
