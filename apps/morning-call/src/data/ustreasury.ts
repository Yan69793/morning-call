/**
 * U.S. Treasury par yield — feed XML oficial (sem chave).
 * Parse dos campos BC_2YEAR / BC_10YEAR / BC_30YEAR do pregão mais recente do feed.
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

export interface TreasuryRow {
  date: string;
  y2: number;
  y10: number;
  y30: number;
}

/** Um <m:properties> por pregão. Feed sem blocos → o XML inteiro vira bloco único. */
function propertyBlocks(xml: string): string[] {
  return xml.match(/<m:properties>[\s\S]*?<\/m:properties>/gi) ?? [];
}

function parseBlock(block: string): TreasuryRow | null {
  const date =
    extractTag(block, "d:NEW_DATE") ??
    extractTag(block, "NEW_DATE") ??
    extractTag(block, "d:Date") ??
    null;
  const y2s = extractTag(block, "d:BC_2YEAR") ?? extractTag(block, "BC_2YEAR");
  const y10s = extractTag(block, "d:BC_10YEAR") ?? extractTag(block, "BC_10YEAR");
  const y30s = extractTag(block, "d:BC_30YEAR") ?? extractTag(block, "BC_30YEAR");
  if (!date || !y2s || !y10s || !y30s) return null;
  const y2 = Number(y2s);
  const y10 = Number(y10s);
  const y30 = Number(y30s);
  if (![y2, y10, y30].every(Number.isFinite)) return null;
  return { date: date.slice(0, 10), y2, y10, y30 };
}

/**
 * Escolhe o pregão mais recente do feed, por DATA e não por posição.
 *
 * O feed do Treasury é ascendente: o primeiro bloco é 2 de janeiro. A versão anterior desta
 * função rodava `xml.match()` sobre o documento inteiro, que casa a PRIMEIRA ocorrência — e
 * publicava o rendimento de janeiro como se fosse o de hoje, com `status: OK` e `tier: 1`.
 * Verificado no feed real de 2026-07-15: 2Y de 3,47 (02/01) no lugar de 4,18 (14/07), 71 bps de
 * erro. Ordenar por data em vez de confiar na ordem também sobrevive a uma inversão do feed.
 *
 * `maxDate` (o pregão de referência) barra dado posterior: sem ele um replay histórico leria o
 * futuro e o placar do Portão 1 mentiria a favor (CLAUDE.md §3, look-ahead bias).
 */
export function parseTreasuryXml(xml: string, maxDate?: string): TreasuryRow | null {
  const rows = parseTreasuryRows(xml, maxDate);
  return rows.length === 0 ? null : rows[rows.length - 1]!;
}

/**
 * Toda a série do feed, em ordem cronológica crescente e sem dado posterior ao pregão.
 *
 * O feed anual já traz um bloco por pregão (133 em 15/07), então a curva histórica sai da mesma
 * requisição que o nível do dia: não custa fetch novo. É o insumo de `delta_1d` e da correlação.
 */
export function parseTreasuryRows(xml: string, maxDate?: string): TreasuryRow[] {
  const blocks = propertyBlocks(xml);
  return (blocks.length > 0 ? blocks : [xml])
    .map(parseBlock)
    .filter((r): r is TreasuryRow => r !== null)
    .filter((r) => (maxDate ? r.date <= maxDate : true))
    .sort((a, b) => a.date.localeCompare(b.date));
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
        return [SNAPSHOT_KEYS.UST_2Y, SNAPSHOT_KEYS.UST_10Y, SNAPSHOT_KEYS.UST_30Y].map((k) =>
          nd(k, `UST XML HTTP ${res.status}`, ctx.observedAt),
        );
      }
      const xml = await res.text();
      const parsed = parseTreasuryXml(xml, ctx.tradeDate);
      if (!parsed) {
        return [SNAPSHOT_KEYS.UST_2Y, SNAPSHOT_KEYS.UST_10Y, SNAPSHOT_KEYS.UST_30Y].map((k) =>
          nd(k, "UST XML: parse falhou", ctx.observedAt),
        );
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
