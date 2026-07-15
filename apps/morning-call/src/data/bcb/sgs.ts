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
): DataPoint {
  return {
    status: "OK",
    key,
    quantity: { value, unit },
    venue,
    source: {
      name: `BCB SGS ${seriesCode}`,
      tier: 1,
      url: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/1?formato=json`,
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

const SERIES: {
  code: number;
  key: string;
  unit: Unit;
}[] = [
  { code: SGS_CODES.USDBRL, key: SNAPSHOT_KEYS.USDBRL, unit: "BRL_por_USD" },
  { code: SGS_CODES.SELIC_META, key: SNAPSHOT_KEYS.SELIC_META, unit: "pct" },
  { code: SGS_CODES.SELIC_DIARIA, key: SNAPSHOT_KEYS.SELIC_DIARIA, unit: "pct" },
  { code: SGS_CODES.CDI_DIARIA, key: SNAPSHOT_KEYS.CDI_DIARIA, unit: "pct" },
  { code: SGS_CODES.IPCA_12M, key: SNAPSHOT_KEYS.IPCA_12M, unit: "pct" },
];

export async function fetchSgsUltimos(
  code: number,
  n: number,
  fetchFn: typeof fetch,
): Promise<SgsObservation[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/${n}?formato=json`;
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SGS ${code}: HTTP ${res.status}`);
  return parseSgsJson(await res.json());
}

export function observationsToPoint(
  key: string,
  unit: Unit,
  code: number,
  obs: SgsObservation[],
  observedAt: string,
): DataPoint {
  if (obs.length === 0) return ndPoint(key, `SGS ${code}: série vazia`, observedAt);
  const last = obs[obs.length - 1]!;
  const value = Number(last.valor.replace(",", "."));
  if (!Number.isFinite(value)) {
    return ndPoint(key, `SGS ${code}: valor não numérico "${last.valor}"`, observedAt);
  }
  return okPoint(key, value, unit, "BR", parseSgsDateToIso(last.data), observedAt, code);
}

export const bcbSgsProvider: DataProvider = {
  name: "bcb-sgs",
  async fetch(ctx: DataProviderContext): Promise<DataPoint[]> {
    const fetchFn = ctx.fetchFn ?? fetch;
    const points: DataPoint[] = [];
    for (const s of SERIES) {
      try {
        const obs = await fetchSgsUltimos(s.code, 1, fetchFn);
        points.push(observationsToPoint(s.key, s.unit, s.code, obs, ctx.observedAt));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        points.push(ndPoint(s.key, msg, ctx.observedAt));
      }
    }
    return points;
  },
};
