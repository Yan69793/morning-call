/**
 * Séries históricas para o motor quant.
 *
 * O snapshot responde "quanto é agora"; retorno, vol, drawdown, z-score e correlação precisam de
 * "como chegou até aqui". Sem esta camada o quant fica escrito e desligado — que era o estado
 * anterior (`ativos: []` no orquestrador).
 *
 * Custo zero de requisição nova em cima do snapshot: o SGS já é consultado por período (a mesma
 * URL só muda o `lookbackDays`) e o feed anual do Treasury já traz um bloco por pregão.
 */
import { fetchSgsPeriodo, parseSgsDateToIso, sgsPeriodUrl } from "./bcb/sgs.js";
import { SGS_CODES, SNAPSHOT_KEYS } from "./keys.js";
import type { DataProviderContext } from "./types.js";
import { parseTreasuryRows } from "./ustreasury.js";
import { fetchWithTimeout } from "./http.js";
import type { AssetSeries, CurveSeries } from "../quant/build.js";
import type { PriceBar } from "../quant/metrics.js";

/**
 * ~1,5 ano de calendário. Cobre os 252 pregões que `m12`, drawdown e z-score querem, com folga
 * para fim de semana e feriado — o SGS devolve dias corridos, não pregões.
 */
const LOOKBACK_DIAS = 550;

/** Janela de correlação (63 pregões) + margem; não precisa da série inteira. */
export const JANELA_CORRELACAO = 63;

export interface SeriesBundle {
  ativos: AssetSeries[];
  curvas: CurveSeries[];
  /** Chaves que não renderam série utilizável. Vão para `faltantes` do QuantMetrics. */
  semSerie: string[];
}

function sgsToBars(obs: readonly { data: string; valor: string }[], tradeDate: string): PriceBar[] {
  return obs
    .map((o) => ({
      t: parseSgsDateToIso(o.data),
      price: Number(o.valor.replace(",", ".")),
      venue: "BR" as const,
    }))
    .filter((b) => Number.isFinite(b.price) && b.t.slice(0, 10) <= tradeDate)
    .sort((a, b) => a.t.localeCompare(b.t));
}

/**
 * Coleta as séries que o dado público gratuito sustenta hoje: USD/BRL (SGS 1) como preço e a
 * curva UST (2/10/30) como taxa.
 *
 * O que NÃO entra, e por quê: Selic/CDI diários são taxas overnight — "retorno" delas não é
 * informação de mercado, é o carrego; Focus são expectativas, não preço; IPCA é mensal. VIX, DXY,
 * Brent e WTI seriam ativos legítimos, mas dependem de `FRED_API_KEY`, que hoje não está
 * configurada: sem ela viram N/D em vez de série inventada.
 */
export async function fetchSeriesBundle(ctx: DataProviderContext): Promise<SeriesBundle> {
  const fetchFn = ctx.fetchFn ?? fetchWithTimeout;
  const ativos: AssetSeries[] = [];
  const curvas: CurveSeries[] = [];
  const semSerie: string[] = [];

  // --- USD/BRL: preço ---
  try {
    const url = sgsPeriodUrl(SGS_CODES.USDBRL, ctx.tradeDate, LOOKBACK_DIAS);
    const bars = sgsToBars(await fetchSgsPeriodo(url, fetchFn), ctx.tradeDate);
    if (bars.length >= 2) {
      ativos.push({
        key: SNAPSHOT_KEYS.USDBRL,
        venue: "BR",
        unit: "BRL_por_USD",
        kind: "price",
        series: bars,
      });
    } else {
      semSerie.push(SNAPSHOT_KEYS.USDBRL);
    }
  } catch {
    semSerie.push(SNAPSHOT_KEYS.USDBRL);
  }

  // --- Curva UST: taxa. Um fetch traz o ano inteiro, um bloco por pregão. ---
  try {
    const year = ctx.tradeDate.slice(0, 4);
    const url =
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml" +
      `?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`UST HTTP ${res.status}`);
    const rows = parseTreasuryRows(await res.text(), ctx.tradeDate);
    if (rows.length >= 2) {
      const barsDe = (pick: (r: (typeof rows)[number]) => number): PriceBar[] =>
        rows.map((r) => ({ t: `${r.date}T18:00:00.000Z`, price: pick(r), venue: "US" as const }));

      const y2 = barsDe((r) => r.y2);
      const y10 = barsDe((r) => r.y10);
      const y30 = barsDe((r) => r.y30);

      curvas.push({
        curva: "UST",
        vertices: [
          { rotulo: SNAPSHOT_KEYS.UST_2Y, prazo_du: 504, series: y2 },
          { rotulo: SNAPSHOT_KEYS.UST_10Y, prazo_du: 2520, series: y10 },
          { rotulo: SNAPSHOT_KEYS.UST_30Y, prazo_du: 7560, series: y30 },
        ],
      });

      // Os vértices também entram como ativos para a matriz de correlação: o gate compara
      // instrumentos de trades, e um trade de juro americano cita UST_10Y, não "curva UST".
      ativos.push(
        { key: SNAPSHOT_KEYS.UST_2Y, venue: "US", unit: "pct", kind: "rate", series: y2 },
        { key: SNAPSHOT_KEYS.UST_10Y, venue: "US", unit: "pct", kind: "rate", series: y10 },
        { key: SNAPSHOT_KEYS.UST_30Y, venue: "US", unit: "pct", kind: "rate", series: y30 },
      );
    } else {
      semSerie.push(SNAPSHOT_KEYS.UST_2Y, SNAPSHOT_KEYS.UST_10Y, SNAPSHOT_KEYS.UST_30Y);
    }
  } catch {
    semSerie.push(SNAPSHOT_KEYS.UST_2Y, SNAPSHOT_KEYS.UST_10Y, SNAPSHOT_KEYS.UST_30Y);
  }

  return { ativos, curvas, semSerie };
}
