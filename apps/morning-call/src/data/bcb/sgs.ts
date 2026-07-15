/**
 * BCB SGS — séries públicas. Endpoint verificado em skill data-sources.
 * Resposta: [{"data":"14/07/2026","valor":"0.052531"}]
 */
import type { DataPoint } from "../../schemas/data.js";
import type { Unit, Venue } from "../../schemas/common.js";
import { SGS_CODES, SNAPSHOT_KEYS } from "../keys.js";
import type { DataProvider, DataProviderContext } from "../types.js";

export interface SgsObservation {
  data: string; // dd/MM/yyyy
  valor: string;
}

export function parseSgsDateToIso(data: string, hourUtc = "18:00:00.000Z"): string {
  const [dd, mm, yyyy] = data.split("/");
  if (!dd || !mm || !yyyy) throw new Error(`data SGS inválida: ${data}`);
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hourUtc}`;
}

export function parseSgsJson(raw: unknown): SgsObservation[] {
  if (!Array.isArray(raw)) throw new Error("SGS: resposta não é array");
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    if (typeof r.data !== "string" || typeof r.valor !== "string") {
      throw new Error("SGS: linha sem data/valor string");
    }
    return { data: r.data, valor: r.valor };
  });
}

function okPoint(
  key: string,
  value: number,
  unit: Unit,
  venue: Venue,
  asOf: string,
  observedAt: string,
  seriesCode: number,
  url: string,
): DataPoint {
  return {
    status: "OK",
    key,
    quantity: { value, unit },
    venue,
    source: {
      // A url é a consulta que de fato produziu este valor — colar no navegador reproduz o
      // número. Apontar para um endpoint genérico que devolve outra coisa é fonte fabricada.
      name: `BCB SGS ${seriesCode}`,
      tier: 1,
      url,
      retrieved_at: observedAt,
    },
    as_of: asOf,
    observed_at: observedAt,
  };
}

function ndPoint(key: string, reason: string, observedAt: string): DataPoint {
  return {
    status: "ND",
    key,
    venue: "BR",
    reason,
    observed_at: observedAt,
  };
}

/**
 * `lookbackDays`: janela para trás a partir do pregão, suficiente para conter ao menos uma
 * observação da série. Diárias precisam cobrir feriado emendado; o IPCA 12m é mensal e
 * referenciado ao 1º do mês (em 15/07 o dado corrente é 01/06), então precisa de bem mais.
 */
const SERIES: {
  code: number;
  key: string;
  unit: Unit;
  lookbackDays: number;
}[] = [
  { code: SGS_CODES.USDBRL, key: SNAPSHOT_KEYS.USDBRL, unit: "BRL_por_USD", lookbackDays: 15 },
  { code: SGS_CODES.SELIC_META, key: SNAPSHOT_KEYS.SELIC_META, unit: "pct", lookbackDays: 15 },
  { code: SGS_CODES.SELIC_DIARIA, key: SNAPSHOT_KEYS.SELIC_DIARIA, unit: "pct", lookbackDays: 15 },
  { code: SGS_CODES.CDI_DIARIA, key: SNAPSHOT_KEYS.CDI_DIARIA, unit: "pct", lookbackDays: 15 },
  { code: SGS_CODES.IPCA_12M, key: SNAPSHOT_KEYS.IPCA_12M, unit: "pct", lookbackDays: 200 },
];

function toSgsDate(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Consulta por período, com `dataFinal` fixada no pregão.
 *
 * `ultimos/N` não serve, e o motivo não é estilo: a série 432 (meta Selic) projeta a meta vigente
 * até a próxima reunião do Copom, então a PONTA DA SÉRIE É FUTURA. Verificado em 2026-07-15:
 * `ultimos/1` devolvia 05/08/2026 — as_of 21 dias à frente do pregão, violando o contrato de
 * schemas/data.ts ("as_of < observed_at sempre") e envenenando qualquer cálculo de idade. Nem
 * aumentar o N resolve (`ultimos/12` ainda vem inteiro no futuro), e o teto do parâmetro é 20.
 * Com `dataFinal` no pregão, o look-ahead fica impossível por construção, para toda série.
 */
export function sgsPeriodUrl(code: number, tradeDate: string, lookbackDays: number): string {
  const fim = Date.UTC(
    Number(tradeDate.slice(0, 4)),
    Number(tradeDate.slice(5, 7)) - 1,
    Number(tradeDate.slice(8, 10)),
  );
  const ini = fim - lookbackDays * 86_400_000;
  return (
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json` +
    `&dataInicial=${toSgsDate(ini)}&dataFinal=${toSgsDate(fim)}`
  );
}

export async function fetchSgsPeriodo(
  url: string,
  fetchFn: typeof fetch,
): Promise<SgsObservation[]> {
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SGS: HTTP ${res.status}`);
  return parseSgsJson(await res.json());
}

/**
 * Última observação com data <= pregão. O filtro repete a garantia que a `dataFinal` da URL já
 * dá — de propósito: se o SGS um dia ignorar o parâmetro, o dado futuro morre aqui em vez de
 * virar as_of adiantado no snapshot.
 */
export function observationsToPoint(
  key: string,
  unit: Unit,
  code: number,
  obs: SgsObservation[],
  observedAt: string,
  url: string,
  tradeDate?: string,
): DataPoint {
  if (obs.length === 0) return ndPoint(key, `SGS ${code}: série vazia`, observedAt);
  const elegiveis = tradeDate
    ? obs.filter((o) => parseSgsDateToIso(o.data).slice(0, 10) <= tradeDate)
    : obs;
  if (elegiveis.length === 0) {
    return ndPoint(
      key,
      `SGS ${code}: só há observação posterior ao pregão ${tradeDate}`,
      observedAt,
    );
  }
  const last = elegiveis[elegiveis.length - 1]!;
  const value = Number(last.valor.replace(",", "."));
  if (!Number.isFinite(value)) {
    return ndPoint(key, `SGS ${code}: valor não numérico "${last.valor}"`, observedAt);
  }
  return okPoint(key, value, unit, "BR", parseSgsDateToIso(last.data), observedAt, code, url);
}

export const bcbSgsProvider: DataProvider = {
  name: "bcb-sgs",
  async fetch(ctx: DataProviderContext): Promise<DataPoint[]> {
    const fetchFn = ctx.fetchFn ?? fetch;
    const points: DataPoint[] = [];
    for (const s of SERIES) {
      const url = sgsPeriodUrl(s.code, ctx.tradeDate, s.lookbackDays);
      try {
        const obs = await fetchSgsPeriodo(url, fetchFn);
        points.push(
          observationsToPoint(s.key, s.unit, s.code, obs, ctx.observedAt, url, ctx.tradeDate),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        points.push(ndPoint(s.key, msg, ctx.observedAt));
      }
    }
    return points;
  },
};
