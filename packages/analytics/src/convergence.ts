/**
 * Motor de convergência entre leitura macro (Morning Call) e radar técnico (Radar Quant).
 *
 * As regras de negócio estão documentadas em PLANO_DEFINITIVO.md e incluem:
 * - Piso de convicção macro (>= 6)
 * - Tabela MACRO_REGIME_LEAN (8 regimes → directional lean)
 * - Prevalência de `vies` sobre `regime` quando divergem
 * - Limiar técnico |score| >= 40
 *
 * `MacroRegime` e `MacroBias` são duplicados aqui em vez de importados de
 * `apps/morning-call/src/schemas/agents.ts`: o pacote não pode depender de um app,
 * e o app depende do pacote. Os enums são literais idênticos mantidos em sincronia
 * manual — a direção de dependência do monorepo prevalece sobre DRY.
 */

import type { RadarItem } from "./types.js";

// Duplicação deliberada dos enums de apps/morning-call/src/schemas/agents.ts.
// Ver comentário no cabeçalho do arquivo.
export type MacroRegime =
  | "goldilocks"
  | "reflacionario"
  | "estagflacionario"
  | "desinflacionario"
  | "recessivo"
  | "risk_on_especulativo"
  | "risk_off_sistemico"
  | "transicao";

export type MacroBias = "comprador" | "vendedor" | "neutro" | "long_vol" | "short_vol";

export type DirectionalLean = "risk_on" | "risk_off" | "neutro";

/**
 * Mapeamento dos 8 regimes macro para inclinação direcional.
 * Validado com Yan em 2026-07-15. Não reabrir sem evidência nova.
 */
export const MACRO_REGIME_LEAN: Record<MacroRegime, DirectionalLean> = {
  goldilocks: "risk_on",
  reflacionario: "risk_on",
  estagflacionario: "risk_off",
  desinflacionario: "risk_on",
  recessivo: "risk_off",
  risk_on_especulativo: "risk_on",
  risk_off_sistemico: "risk_off",
  transicao: "neutro",
};

export interface MacroContext {
  regime: MacroRegime;
  vies: MacroBias;
  conviccao: number;
}

export interface ConvergenceResult {
  symbol: string;
  name: string;
  aligned: boolean;
  direction: DirectionalLean;
  reasons: string[];
}

const CONVICCAO_FLOOR = 6;
const SCORE_THRESHOLD = 40;

/**
 * Resolve a inclinação direcional a partir do viés + regime.
 * Regra: `vies` prevalece sobre `MACRO_REGIME_LEAN[regime]` quando divergem.
 * - comprador / long_vol → risk_on
 * - vendedor / short_vol → risk_off
 * - neutro → usa o lean do regime
 */
function resolveLean(regime: MacroRegime, vies: MacroBias): DirectionalLean {
  switch (vies) {
    case "comprador":
    case "long_vol":
      return "risk_on";
    case "vendedor":
    case "short_vol":
      return "risk_off";
    case "neutro":
      return MACRO_REGIME_LEAN[regime];
  }
}

/**
 * Decide se um RadarItem está alinhado com a direção macro resolvida.
 *
 * Regras:
 * 1. `item.regime === "SEM_DADO"` ou `item.quality.symbolError` → `aligned: false`, nunca exceção.
 * 2. `TRANQUILO` e os estados exclusivos de VIX (`RISCO`, `ATENCAO` — tratados como regime "TRANQUILO"
 *    no Radar Quant) nunca contam como alinhados por si só; entram apenas via score.
 * 3. Alinhado quando `|score| >= 40` E a direção do score bate com a direção macro resolvida:
 *    - `risk_on` + score positivo (>= 40) → alinhado
 *    - `risk_off` + score negativo (<= -40) → alinhado
 *    - `neutro` → nunca alinhado (não há direção para bater)
 */
export function evaluateConvergence(macro: MacroContext, item: RadarItem): ConvergenceResult {
  const reasons: string[] = [];

  // Piso de convicção
  if (macro.conviccao < CONVICCAO_FLOOR) {
    return {
      symbol: item.symbol,
      name: item.name,
      aligned: false,
      direction: resolveLean(macro.regime, macro.vies),
      reasons: [`conviccao macro ${macro.conviccao} abaixo do piso ${CONVICCAO_FLOOR}`],
    };
  }

  // Symbol error → nunca alinhado
  if (item.quality.symbolError) {
    return {
      symbol: item.symbol,
      name: item.name,
      aligned: false,
      direction: resolveLean(macro.regime, macro.vies),
      reasons: ["symbolError"],
    };
  }

  // SEM_DADO → nunca alinhado
  if (item.regime === "SEM_DADO" as never) {
    return {
      symbol: item.symbol,
      name: item.name,
      aligned: false,
      direction: resolveLean(macro.regime, macro.vies),
      reasons: ["regime tecnico SEM_DADO"],
    };
  }

  const lean = resolveLean(macro.regime, macro.vies);

  // Neutro → sem direção, não pode alinhar
  if (lean === "neutro") {
    return {
      symbol: item.symbol,
      name: item.name,
      aligned: false,
      direction: "neutro",
      reasons: ["macro com inclinacao neutra, sem direcao para convergir"],
    };
  }

  // Estados técnicos que não contam como alinhados por si só
  // TRANQUILO, RISCO, ATENCAO — só entram via score
  const nonAligningRegimes = ["TRANQUILO", "RISCO", "ATENCAO"];

  // Score abaixo do limiar
  if (Math.abs(item.score) < SCORE_THRESHOLD) {
    return {
      symbol: item.symbol,
      name: item.name,
      aligned: false,
      direction: lean,
      reasons: [`|score| ${Math.abs(item.score)} abaixo do limiar ${SCORE_THRESHOLD}`],
    };
  }

  // Determinar direção a partir do score
  if (lean === "risk_on" && item.score >= SCORE_THRESHOLD) {
    // Regime técnico precisa ser compatível com alta OU o score é forte o suficiente
    if (nonAligningRegimes.includes(item.regime)) {
      reasons.push(`regime ${item.regime} nao bloqueia score>=${SCORE_THRESHOLD}`);
    }
    if (item.regime === "ALTA") reasons.push("regime ALTA");
    if (item.regime === "BAIXA") reasons.push("regime BAIXA diverge da macro risk_on");
    reasons.push(`score>=${SCORE_THRESHOLD}`);
    reasons.push(`macro ${lean}`);
    return { symbol: item.symbol, name: item.name, aligned: true, direction: lean, reasons };
  }

  if (lean === "risk_off" && item.score <= -SCORE_THRESHOLD) {
    if (nonAligningRegimes.includes(item.regime)) {
      reasons.push(`regime ${item.regime} nao bloqueia score<=-${SCORE_THRESHOLD}`);
    }
    if (item.regime === "BAIXA") reasons.push("regime BAIXA");
    if (item.regime === "ALTA") reasons.push("regime ALTA diverge da macro risk_off");
    reasons.push(`score<=-${SCORE_THRESHOLD}`);
    reasons.push(`macro ${lean}`);
    return { symbol: item.symbol, name: item.name, aligned: true, direction: lean, reasons };
  }

  // Direção do score não bate com lean (ex.: risk_on com score <= -40)
  return {
    symbol: item.symbol,
    name: item.name,
    aligned: false,
    direction: lean,
    reasons: [
      `direcao do score (${item.score >= 0 ? "positivo" : "negativo"}) nao bate com macro ${lean}`,
    ],
  };
}

/**
 * Encontra todas as convergências do dia entre macro e itens do scan técnico.
 * `macro.conviccao < 6` retorna array vazio (sem convergências possíveis).
 */
export function findDailyConvergences(
  macro: MacroContext,
  items: RadarItem[],
): ConvergenceResult[] {
  return items.map((item) => evaluateConvergence(macro, item)).filter((r) => r.aligned);
}
