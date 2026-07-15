/**
 * Cross-check numérico — PLANO_ESTRATEGICO §4, mecanismos 3 e 4.
 *
 * Todo número que um agente declara referenciando o snapshot precisa bater com o valor gravado em
 * D1 antes de qualquer LLM tocar no dado. Aqui não há LLM: é comparação em código. Uma chave que
 * não existe, uma unidade trocada, ou um valor fora da tolerância derrubam a afirmação. É o que
 * transforma "zero alucinação" de promessa em invariante — e pega o erro mais caro e mais comum,
 * a transcrição de ordem de grandeza (Selic 15,00 virando 1,50).
 *
 * Este módulo é branch-independente das duas naturezas de P1 (máquina de calls ou brief): serve às
 * duas, e por isso é a única peça de execução autorizada antes do Portão 1.
 */
import type { Quantity } from "../schemas/common.js";
import type { QuantClaim } from "../schemas/agents.js";
import { isOK, type MarketSnapshot } from "../schemas/data.js";

export type SnapshotIndex = ReadonlyMap<string, Quantity>;

/**
 * Índice chave→grandeza a partir dos pontos OK do snapshot. Pontos N/D ficam de fora de propósito:
 * não têm valor, e citar um dado ausente tem de cair como chave inexistente, não passar batido.
 */
export function buildSnapshotIndex(snapshot: MarketSnapshot): SnapshotIndex {
  const index = new Map<string, Quantity>();
  for (const point of snapshot.points) {
    if (isOK(point)) index.set(point.key, point.quantity);
  }
  return index;
}

export type ViolationKind = "chave_ausente" | "unidade_divergente" | "valor_divergente";

export interface Violation {
  snapshot_key: string;
  kind: ViolationKind;
  citado: Quantity;
  /** null quando a chave nem existe no snapshot. */
  esperado: Quantity | null;
  motivo: string;
}

export interface CrossCheckOptions {
  /**
   * Tolerância relativa ao valor esperado. Default 0,5%: derruba erro de ordem de grandeza (10x) e
   * ainda tolera o arredondamento de exibição (5,07 contra 5,0742). Aperte para exigir citação exata.
   */
  relTol?: number;
  /** Tolerância absoluta mínima, para não punir ruído de ponto flutuante perto de zero. */
  absTol?: number;
}

export interface CrossCheckResult {
  ok: boolean;
  verificados: number;
  violations: Violation[];
}

const DEFAULT_REL_TOL = 0.005;
const DEFAULT_ABS_TOL = 1e-9;

/**
 * Confere cada afirmação quantitativa contra o snapshot. Retorna todas as violações (não pára na
 * primeira): o objetivo é dar ao chamador a lista inteira para a seção §18 ou para o log de bug.
 */
export function crossCheckClaims(
  claims: readonly QuantClaim[],
  index: SnapshotIndex,
  options: CrossCheckOptions = {},
): CrossCheckResult {
  const relTol = options.relTol ?? DEFAULT_REL_TOL;
  const absTol = options.absTol ?? DEFAULT_ABS_TOL;
  const violations: Violation[] = [];

  for (const claim of claims) {
    const esperado = index.get(claim.snapshot_key);

    if (esperado === undefined) {
      violations.push({
        snapshot_key: claim.snapshot_key,
        kind: "chave_ausente",
        citado: claim.valor_citado,
        esperado: null,
        motivo: `chave "${claim.snapshot_key}" não existe no snapshot`,
      });
      continue;
    }

    if (esperado.unit !== claim.valor_citado.unit) {
      violations.push({
        snapshot_key: claim.snapshot_key,
        kind: "unidade_divergente",
        citado: claim.valor_citado,
        esperado,
        motivo: `unidade citada "${claim.valor_citado.unit}" ≠ "${esperado.unit}" do snapshot`,
      });
      continue;
    }

    const diff = Math.abs(claim.valor_citado.value - esperado.value);
    const tol = Math.max(absTol, relTol * Math.abs(esperado.value));
    if (diff > tol) {
      violations.push({
        snapshot_key: claim.snapshot_key,
        kind: "valor_divergente",
        citado: claim.valor_citado,
        esperado,
        motivo: `valor citado ${claim.valor_citado.value} diverge de ${esperado.value} (tolerância ${tol})`,
      });
    }
  }

  return { ok: violations.length === 0, verificados: claims.length, violations };
}
