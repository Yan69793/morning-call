/**
 * U.S. Treasury par yield — feed XML oficial (sem chave).
 * Parse mínimo dos campos BC_2YEAR / BC_10YEAR / BC_30YEAR do dia mais recente no XML.
 * Se o parse falhar → ND (FRED já cobre o mesmo dado com key).
 */
import type { DataPoint } from "../schemas/data.js";
import { SNAPSHOT_KEYS } from "./keys.js";
import type { DataProvider, DataProviderContext } from "./types.js";

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

/** Pega o primeiro DailyTreasuryYieldCurveRateData block. */
export function parseTreasuryXml(xml: string): {
  date: string;
  y2: number;
  y10: number;
  y30: number;
} | null {
  const date =
    extractTag(xml, "d:NEW_DATE") ??
    extractTag(xml, "NEW_DATE") ??
    extractTag(xml, "d:Date") ??
    null;
  const y2s = extractTag(xml, "d:BC_2YEAR") ?? extractTag(xml, "BC_2YEAR");
  const y10s = extractTag(xml, "d:BC_10YEAR") ?? extractTag(xml, "BC_10YEAR");
  const y30s = extractTag(xml, "d:BC_30YEAR") ?? extractTag(xml, "BC_30YEAR");
  if (!date || !y2s || !y10s || !y30s) return null;
  const y2 = Number(y2s);
  const y10 = Number(y10s);
  const y30 = Number(y30s);
  if (![y2, y10, y30].every(Number.isFinite)) return null;
  const day = date.slice(0, 10);
  return { date: day, y2, y10, y30 };
}

function nd(key: string, reason: string, observedAt: string): DataPoint {
  return { status: "ND", key, venue: "US", reason, observed_at: observedAt };
}

export const usTreasuryProvider: DataProvider = {
  name: "us-treasury",
  async fetch(ctx: DataProviderContext): Promise<DataPoint[]> {
    const year = ctx.tradeDate.slice(0, 4);
    const url =
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml" +
      `?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
    const fetchFn = ctx.fetchFn ?? fetch;
    try {
      const res = await fetchFn(url);
      if (!res.ok) {
        return [
          SNAPSHOT_KEYS.UST_2Y,
          SNAPSHOT_KEYS.UST_10Y,
          SNAPSHOT_KEYS.UST_30Y,
        ].map((k) => nd(k, `UST XML HTTP ${res.status}`, ctx.observedAt));
      }
      const xml = await res.text();
      const parsed = parseTreasuryXml(xml);
      if (!parsed) {
        return [
          SNAPSHOT_KEYS.UST_2Y,
          SNAPSHOT_KEYS.UST_10Y,
          SNAPSHOT_KEYS.UST_30Y,
        ].map((k) => nd(k, "UST XML: parse falhou", ctx.observedAt));
      }
      const asOf = `${parsed.date}T18:00:00.000Z`;
      const mk = (key: string, value: number): DataPoint => ({
        status: "OK",
        key,
        quantity: { value, unit: "pct" },
        venue: "US",
        source: { name: "U.S. Treasury", tier: 1, url, retrieved_at: ctx.observedAt },
        as_of: asOf,
        observed_at: ctx.observedAt,
      });
      return [
        mk(SNAPSHOT_KEYS.UST_2Y, parsed.y2),
        mk(SNAPSHOT_KEYS.UST_10Y, parsed.y10),
        mk(SNAPSHOT_KEYS.UST_30Y, parsed.y30),
      ];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return [SNAPSHOT_KEYS.UST_2Y, SNAPSHOT_KEYS.UST_10Y, SNAPSHOT_KEYS.UST_30Y].map((k) =>
        nd(k, msg, ctx.observedAt),
      );
    }
  },
};
