/**
 * Preço de fechamento para marcação a mercado (cron 18:30, ver report/run-mark.ts).
 *
 * Só cobre os instrumentos com fonte configurada abaixo. Instrumento sem entrada aqui volta ND
 * explícito (CLAUDE.md §3): a marcação pula o trade e loga o motivo, nunca inventa preço.
 */
import { fetchSgsPeriodo, observationsToPoint, sgsPeriodUrl } from "./bcb/sgs.js";
import { SGS_CODES, SNAPSHOT_KEYS } from "./keys.js";
import type { DataPoint } from "../schemas/data.js";
import type { Unit } from "../schemas/common.js";

interface SgsInstrumentSource {
  provider: "sgs";
  code: number;
  key: string;
  unit: Unit;
}

/**
 * Mapa instrumento -> fonte. Hoje só USDBRL, o único instrumento que aparece nos trades
 * publicados em produção (conferido em 17/08/2026 via D1: 2/2 trades abertos são "preco",
 * um deles é EURUSD, que ainda não tem fonte configurada e por isso fica ND até alguém
 * decidir o provedor).
 */
const INSTRUMENT_SOURCES: Record<string, SgsInstrumentSource> = {
  USDBRL: { provider: "sgs", code: SGS_CODES.USDBRL, key: SNAPSHOT_KEYS.USDBRL, unit: "BRL_por_USD" },
};

/** Busca o preço mais recente até `tradeDate` para `instrumento`. Nunca lança, sempre DataPoint. */
export async function fetchInstrumentPrice(
  instrumento: string,
  tradeDate: string,
  observedAt: string,
  fetchFn: typeof fetch = fetch,
): Promise<DataPoint> {
  const src = INSTRUMENT_SOURCES[instrumento];
  if (!src) {
    return {
      status: "ND",
      key: instrumento,
      venue: "BR",
      reason: `sem fonte de preço configurada para "${instrumento}"`,
      observed_at: observedAt,
    };
  }
  const url = sgsPeriodUrl(src.code, tradeDate, 15);
  try {
    const obs = await fetchSgsPeriodo(url, fetchFn);
    return observationsToPoint(src.key, src.unit, src.code, obs, observedAt, url, tradeDate);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "ND", key: instrumento, venue: "BR", reason: msg, observed_at: observedAt };
  }
}
