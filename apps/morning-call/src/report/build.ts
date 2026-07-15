/**
 * Monta MorningCall mínimo (Portão 1).
 */
import { MorningCall, type Scenario } from "../schemas/report.js";
import type { StrategistRaw } from "../agents/strategist.js";
import type { TradeCard } from "../schemas/trade.js";
import type { Provenance } from "../schemas/common.js";
import { rankTrades } from "./validate.js";

const DISCLAIMER =
  "Este material apresenta cenários e estruturas para análise profissional. A execução depende de suitability, mandato, liquidez, custos, tributação e limites individuais de risco." as const;

export function buildMorningCall(opts: {
  runId: string;
  tradeDate: string;
  generatedAt: string;
  raw: StrategistRaw;
  trades: TradeCard[];
  provenance: Provenance;
}): MorningCall {
  const cenarios = opts.raw.cenarios as Scenario[];
  return MorningCall.parse({
    run_id: opts.runId,
    trade_date: opts.tradeDate,
    generated_at: opts.generatedAt,
    abertura: opts.raw.abertura,
    trades: opts.trades,
    ranking: rankTrades(opts.trades),
    cenarios,
    rastreabilidade: opts.raw.rastreabilidade,
    provenance: opts.provenance,
    disclaimer: DISCLAIMER,
  });
}
