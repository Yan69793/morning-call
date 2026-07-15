/**
 * Baselines do dia: B&H, null, Focus (consenso).
 * Denominador do placar Portão 1.
 */
import type { MarketSnapshot } from "../schemas/data.js";
import { isOK } from "../schemas/data.js";
import { SNAPSHOT_KEYS } from "../data/keys.js";

export interface DayBaselines {
  trade_date: string;
  /** proxy: se tiver série; aqui só nível Focus vs spot quando ambos OK */
  bh_note: string;
  null_pct: number;
  focus_selic: number | null;
  focus_ipca: number | null;
  focus_cambio: number | null;
  spot_usdbrl: number | null;
  selic_meta: number | null;
}

export function extractDayBaselines(snapshot: MarketSnapshot): DayBaselines {
  const byKey = new Map(snapshot.points.filter(isOK).map((p) => [p.key, p.quantity.value]));
  return {
    trade_date: snapshot.trade_date,
    bh_note: "B&H por ativo calculado no mark com série de preços; snapshot só ancora níveis",
    null_pct: 0,
    focus_selic: byKey.get(SNAPSHOT_KEYS.FOCUS_SELIC_ANO) ?? null,
    focus_ipca: byKey.get(SNAPSHOT_KEYS.FOCUS_IPCA_ANO) ?? null,
    focus_cambio: byKey.get(SNAPSHOT_KEYS.FOCUS_CAMBIO_ANO) ?? null,
    spot_usdbrl: byKey.get(SNAPSHOT_KEYS.USDBRL) ?? null,
    selic_meta: byKey.get(SNAPSHOT_KEYS.SELIC_META) ?? null,
  };
}
