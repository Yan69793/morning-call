/**
 * Gates booleanos do comitê (AD-7). Sem média ponderada inventada.
 */
import { buildSnapshotIndex, crossCheckClaims, type CrossCheckResult } from "./crossCheck.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { QuantClaim } from "../schemas/agents.js";
import type { TradeCard } from "../schemas/trade.js";

export interface GateResult {
  ok: boolean;
  reasons: string[];
  crossCheck: CrossCheckResult;
}

const MIN_RISCO_RETORNO = 1.5;

/**
 * Aprova ou rejeita o conjunto de claims + cada trade individualmente.
 */
export function runGates(opts: {
  snapshot: MarketSnapshot;
  claims: readonly QuantClaim[];
  trades: readonly TradeCard[];
}): GateResult {
  const reasons: string[] = [];
  const index = buildSnapshotIndex(opts.snapshot);
  const crossCheck = crossCheckClaims(opts.claims, index);
  if (!crossCheck.ok) {
    for (const v of crossCheck.violations) {
      reasons.push(`crossCheck: ${v.motivo}`);
    }
  }

  for (const t of opts.trades) {
    const d = t.draft;
    if (d.fontes.length === 0) reasons.push(`trade ${d.nome}: sem fonte`);
    if (d.invalidacao.descricao.length < 20) {
      reasons.push(`trade ${d.nome}: invalidação vaga`);
    }
    if (t.risco_retorno.value < MIN_RISCO_RETORNO) {
      reasons.push(
        `trade ${d.nome}: risco_retorno ${t.risco_retorno.value} < ${MIN_RISCO_RETORNO}`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons, crossCheck };
}

/** Filtra trades que passam gates individuais (claims globais já ok). */
export function filterPublishableTrades(
  trades: readonly TradeCard[],
  claimsOk: boolean,
): { published: TradeCard[]; rejected: { trade: TradeCard; motivo: string }[] } {
  const published: TradeCard[] = [];
  const rejected: { trade: TradeCard; motivo: string }[] = [];
  if (!claimsOk) {
    for (const t of trades) {
      rejected.push({ trade: t, motivo: "claims quantitativos rejeitados pelo cross-check" });
    }
    return { published, rejected };
  }
  for (const t of trades) {
    const d = t.draft;
    if (d.fontes.length === 0) {
      rejected.push({ trade: t, motivo: "sem fonte" });
      continue;
    }
    if (t.risco_retorno.value < MIN_RISCO_RETORNO) {
      rejected.push({
        trade: t,
        motivo: `risco_retorno ${t.risco_retorno.value} < ${MIN_RISCO_RETORNO}`,
      });
      continue;
    }
    published.push(t);
  }
  // ranking por assimetria desc
  published.sort((a, b) => b.risco_retorno.value - a.risco_retorno.value);
  return { published, rejected };
}
