/**
 * BCB Focus / Expectativas — Olinda OData.
 * Baseline de consenso do Portão 1.
 */
import type { DataPoint } from "../../schemas/data.js";
import { SNAPSHOT_KEYS } from "../keys.js";
import type { DataProvider, DataProviderContext } from "../types.js";

interface FocusRow {
  Indicador?: string;
  Data?: string;
  DataReferencia?: string;
  Media?: number;
  Mediana?: number;
}

function nd(key: string, reason: string, observedAt: string): DataPoint {
  return { status: "ND", key, venue: "BR", reason, observed_at: observedAt };
}

export function pickLatestMedian(
  rows: FocusRow[],
  indicador: string,
): { value: number; asOf: string } | null {
  const filtered = rows.filter((r) => r.Indicador === indicador && typeof r.Mediana === "number");
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => (a.Data ?? "").localeCompare(b.Data ?? ""));
  const last = filtered[filtered.length - 1]!;
  const asOf = last.Data ? `${last.Data.slice(0, 10)}T18:00:00.000Z` : "1970-01-01T00:00:00.000Z";
  return { value: last.Mediana as number, asOf };
}

export function parseFocusPayload(raw: unknown): FocusRow[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { value?: unknown }).value)) {
    return (raw as { value: FocusRow[] }).value;
  }
  if (Array.isArray(raw)) return raw as FocusRow[];
  throw new Error("Focus: payload inesperado");
}

const INDICATORS: { indicador: string; key: string }[] = [
  { indicador: "IPCA", key: SNAPSHOT_KEYS.FOCUS_IPCA_ANO },
  { indicador: "Selic", key: SNAPSHOT_KEYS.FOCUS_SELIC_ANO },
  { indicador: "Câmbio", key: SNAPSHOT_KEYS.FOCUS_CAMBIO_ANO },
];

export const bcbFocusProvider: DataProvider = {
  name: "bcb-focus",
  async fetch(ctx: DataProviderContext): Promise<DataPoint[]> {
    const fetchFn = ctx.fetchFn ?? fetch;
    const url =
      "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/" +
      "ExpectativasMercadoAnuais?$format=json&$top=50&$orderby=Data%20desc";
    try {
      const res = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        return INDICATORS.map((i) => nd(i.key, `Focus HTTP ${res.status}`, ctx.observedAt));
      }
      const rows = parseFocusPayload(await res.json());
      return INDICATORS.map(({ indicador, key }) => {
        const picked = pickLatestMedian(rows, indicador);
        if (!picked) return nd(key, `Focus sem mediana para ${indicador}`, ctx.observedAt);
        const unit = key === SNAPSHOT_KEYS.FOCUS_CAMBIO_ANO ? "BRL_por_USD" : "pct";
        return {
          status: "OK" as const,
          key,
          quantity: { value: picked.value, unit },
          venue: "BR" as const,
          source: {
            name: "BCB Focus",
            tier: 1 as const,
            url,
            retrieved_at: ctx.observedAt,
          },
          as_of: picked.asOf,
          observed_at: ctx.observedAt,
        };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return INDICATORS.map((i) => nd(i.key, msg, ctx.observedAt));
    }
  },
};
