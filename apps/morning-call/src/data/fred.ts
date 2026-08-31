/**
 * FRED — requer FRED_API_KEY. Sem key → todos ND (não inventa).
 */
import type { DataPoint } from "../schemas/data.js";
import type { Unit } from "../schemas/common.js";
import { SNAPSHOT_KEYS } from "./keys.js";
import type { DataProvider, DataProviderContext } from "./types.js";
import { fetchWithTimeout } from "./http.js";

const SERIES: { id: string; key: string; unit: Unit; venue: "US" | "GLOBAL_24H" }[] = [
  { id: "DGS2", key: SNAPSHOT_KEYS.UST_2Y, unit: "pct", venue: "US" },
  { id: "DGS10", key: SNAPSHOT_KEYS.UST_10Y, unit: "pct", venue: "US" },
  { id: "DGS30", key: SNAPSHOT_KEYS.UST_30Y, unit: "pct", venue: "US" },
  { id: "VIXCLS", key: SNAPSHOT_KEYS.VIX, unit: "index_points", venue: "US" },
  { id: "DTWEXBGS", key: SNAPSHOT_KEYS.DXY_PROXY, unit: "index_points", venue: "US" },
  { id: "DCOILBRENTEU", key: SNAPSHOT_KEYS.BRENT, unit: "USD", venue: "GLOBAL_24H" },
  { id: "DCOILWTICO", key: SNAPSHOT_KEYS.WTI, unit: "USD", venue: "GLOBAL_24H" },
];

export function parseFredObservations(raw: unknown): { date: string; value: string }[] {
  const obs = (raw as { observations?: unknown })?.observations;
  if (!Array.isArray(obs)) throw new Error("FRED: observations ausente");
  return obs.map((o) => {
    const r = o as Record<string, unknown>;
    return { date: String(r.date), value: String(r.value) };
  });
}

export function lastValidFred(
  rows: { date: string; value: string }[],
): { date: string; value: number } | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.value === ".") continue;
    const n = Number(row.value);
    if (Number.isFinite(n)) return { date: row.date, value: n };
  }
  return null;
}

function nd(
  key: string,
  reason: string,
  observedAt: string,
  venue: "US" | "GLOBAL_24H",
): DataPoint {
  return { status: "ND", key, venue, reason, observed_at: observedAt };
}

export const fredProvider: DataProvider = {
  name: "fred",
  async fetch(ctx: DataProviderContext): Promise<DataPoint[]> {
    const key = ctx.secrets?.fredApiKey;
    if (!key) {
      return SERIES.map((s) =>
        nd(s.key, "FRED_API_KEY ausente — N/D — REQUER VERIFICAÇÃO", ctx.observedAt, s.venue),
      );
    }
    const fetchFn = ctx.fetchFn ?? fetchWithTimeout;
    const points: DataPoint[] = [];
    for (const s of SERIES) {
      try {
        const url =
          `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}` +
          `&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=5`;
        const res = await fetchFn(url);
        if (!res.ok) {
          points.push(nd(s.key, `FRED ${s.id} HTTP ${res.status}`, ctx.observedAt, s.venue));
          continue;
        }
        const rows = parseFredObservations(await res.json());
        // sort_order=desc: first valid is latest
        const latest = lastValidFred([...rows].reverse());
        if (!latest) {
          points.push(nd(s.key, `FRED ${s.id}: sem valor`, ctx.observedAt, s.venue));
          continue;
        }
        points.push({
          status: "OK",
          key: s.key,
          quantity: { value: latest.value, unit: s.unit },
          venue: s.venue,
          source: {
            name: `FRED ${s.id}`,
            tier: 1,
            url: `https://fred.stlouisfed.org/series/${s.id}`,
            retrieved_at: ctx.observedAt,
          },
          as_of: `${latest.date}T18:00:00.000Z`,
          observed_at: ctx.observedAt,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        points.push(nd(s.key, msg, ctx.observedAt, s.venue));
      }
    }
    return points;
  },
};
