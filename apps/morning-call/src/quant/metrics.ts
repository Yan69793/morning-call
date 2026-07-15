/**
 * Métricas por ativo respeitando Venue / as_of (PC-1 / T2).
 *
 * Retorno 1D que cruza praças sem flag explícita falha em código — não em prosa.
 * Números vêm de core.ts; este módulo só monta AssetMetrics com rastreio de janela.
 */
import {
  maxDrawdown,
  momentum,
  periodReturn,
  realizedVol,
  simpleReturn,
  zscore,
} from "./core.js";
import type { AssetMetrics, ReturnWindow, WindowReturn } from "../schemas/quant.js";
import type { Quantity, Unit, Venue } from "../schemas/common.js";

export interface PriceBar {
  /** InstantUTC ISO-8601 com Z. */
  t: string;
  price: number;
  venue: Venue;
}

export interface ComputeAssetMetricsInput {
  key: string;
  venue: Venue;
  unit: Unit;
  series: readonly PriceBar[];
  /**
   * Se true, permite d1 com pontas em venues diferentes (ex.: proxy explícito).
   * Default false: cruza praça → throw.
   */
  allowCrossVenue?: boolean;
}

function assertChronological(series: readonly PriceBar[]): void {
  for (let i = 1; i < series.length; i++) {
    if (series[i]!.t < series[i - 1]!.t) {
      throw new Error(`série fora de ordem cronológica em índice ${i}`);
    }
  }
}

function pricesOf(series: readonly PriceBar[]): number[] {
  return series.map((b) => b.price);
}

function windowReturn(
  window: ReturnWindow,
  de: PriceBar,
  ate: PriceBar,
  observacoes: number,
  allowCrossVenue: boolean,
): WindowReturn {
  if (!allowCrossVenue && de.venue !== ate.venue) {
    throw new Error(
      `retorno ${window} cruza venues (${de.venue} → ${ate.venue}) sem allowCrossVenue`,
    );
  }
  return {
    window,
    retorno: { value: simpleReturn(de.price, ate.price), unit: "pct" },
    janela_as_of: { de: de.t, ate: ate.t },
    observacoes,
  };
}

/**
 * Resolve pontas para cada janela. Série curta: omite a janela (não inventa).
 * mtd/ytd usam primeiro ponto do mês/ano civil da última barra (aprox. pregão).
 */
function buildWindows(
  series: readonly PriceBar[],
  allowCrossVenue: boolean,
): WindowReturn[] {
  if (series.length < 2) return [];
  const last = series[series.length - 1]!;
  const out: WindowReturn[] = [];

  // d1: última vs penúltima
  const prev = series[series.length - 2]!;
  out.push(windowReturn("d1", prev, last, 2, allowCrossVenue));

  // d5: 5 passos para trás se existir
  if (series.length >= 6) {
    const de = series[series.length - 6]!;
    out.push(windowReturn("d5", de, last, 6, allowCrossVenue));
  }

  const lastDate = last.t.slice(0, 10); // YYYY-MM-DD
  const y = lastDate.slice(0, 4);
  const ym = lastDate.slice(0, 7);

  const firstOfMonth = series.find((b) => b.t.startsWith(ym));
  if (firstOfMonth && firstOfMonth.t !== last.t) {
    const slice = series.filter((b) => b.t >= firstOfMonth.t);
    out.push(windowReturn("mtd", firstOfMonth, last, slice.length, allowCrossVenue));
  }

  const firstOfYear = series.find((b) => b.t.startsWith(y));
  if (firstOfYear && firstOfYear.t !== last.t) {
    const slice = series.filter((b) => b.t >= firstOfYear.t);
    out.push(windowReturn("ytd", firstOfYear, last, slice.length, allowCrossVenue));
  }

  // m12: ~252 pregões; se menos, usa primeiro ponto disponível com flag de observacoes
  if (series.length >= 2) {
    const lookback = Math.min(252, series.length - 1);
    const de = series[series.length - 1 - lookback]!;
    out.push(windowReturn("m12", de, last, lookback + 1, allowCrossVenue));
  }

  return out;
}

/** Vol 21 pregões (22 preços). */
function vol21(series: readonly PriceBar[]): Quantity | null {
  if (series.length < 22) return null;
  const slice = pricesOf(series.slice(-22));
  return { value: realizedVol(slice, true), unit: "pct" };
}

function drawdown12m(series: readonly PriceBar[]): Quantity | null {
  if (series.length < 2) return null;
  const lookback = Math.min(252, series.length);
  const slice = pricesOf(series.slice(-lookback));
  return { value: maxDrawdown(slice), unit: "pct" };
}

/**
 * Z-score do retorno d1 vs distribuição de retornos d1 dos últimos ~12m.
 */
function zscoreD1(series: readonly PriceBar[]): Quantity | null {
  if (series.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < series.length; i++) {
    rets.push(simpleReturn(series[i - 1]!.price, series[i]!.price));
  }
  const lastRet = rets[rets.length - 1]!;
  const hist = rets.slice(0, -1);
  if (hist.length < 2) return null;
  return { value: zscore(hist, lastRet), unit: "ratio" };
}

export function computeAssetMetrics(input: ComputeAssetMetricsInput): AssetMetrics {
  const { key, venue, unit, series, allowCrossVenue = false } = input;
  if (series.length === 0) throw new Error(`série vazia para ${key}`);
  assertChronological(series);

  // Venue declarado do ativo deve bater com a série (salvo cross explícito)
  if (!allowCrossVenue) {
    for (const b of series) {
      if (b.venue !== venue) {
        throw new Error(
          `barra ${b.t} venue ${b.venue} ≠ venue do ativo ${venue} (key=${key})`,
        );
      }
    }
  }

  const last = series[series.length - 1]!;
  return {
    key,
    venue,
    ultimo: { value: last.price, unit },
    retornos: buildWindows(series, allowCrossVenue),
    vol_realizada_21d: vol21(series),
    drawdown_12m: drawdown12m(series),
    zscore_d1_vs_12m: zscoreD1(series),
  };
}

/** Helpers reexportados para testes / baselines. */
export { periodReturn, momentum };
