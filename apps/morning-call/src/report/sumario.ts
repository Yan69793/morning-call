/**
 * Monta o resumo macro que o Morning Call envia ao Radar Quant para o motor de convergência.
 *
 * Payload deliberadamente mínimo: regime, viés, convicção, tensão dominante.
 * Sem `trades[]` (não expõe tese proprietária), sem `cenarios[]`.
 *
 * Convenção: os tipos `MacroRegime` e `MacroBias` espelham os enums de
 * `packages/analytics/src/convergence.ts` e de `../schemas/agents.ts`. Mantidos iguais
 * literalmente; divergência é bug.
 */
import type { MorningCall } from "../schemas/report.js";

/** Duplicação deliberada de @sz/analytics — ver comentário no cabeçalho. */
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

export interface MacroSummary {
  tradeDate: string;
  generatedAt: string;
  regime: MacroRegime;
  vies: MacroBias;
  conviccao: number;
  tensaoMacroDominante: string;
}

/**
 * Extrai o resumo macro de um MorningCall validado.
 * Função pura, testável isolada.
 */
export function buildMacroSummary(morningCall: MorningCall): MacroSummary {
  return {
    tradeDate: morningCall.trade_date,
    generatedAt: morningCall.generated_at,
    regime: morningCall.abertura.regime,
    vies: morningCall.abertura.vies,
    conviccao: morningCall.abertura.conviccao,
    tensaoMacroDominante: morningCall.abertura.tensao_macro_dominante,
  };
}
