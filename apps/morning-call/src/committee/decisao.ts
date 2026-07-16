/**
 * Ponto ÚNICO onde os insumos do comitê são montados e a publicação é decidida.
 *
 * Existe por causa de um bug concreto: `run.ts` e `workflow.ts` montavam a chamada do gate cada
 * um por conta própria, e o `workflow.ts` — que é o runtime real, o que o cron dispara — passava
 * `correlacoes: []` chumbado. A matriz era calculada pelo quant e jogada fora, então `MAX_RHO`
 * nunca barrava nada em produção. Os testes dos dois lados ficavam verdes: os de `gates.ts`
 * entregavam `rho` a mão, e os de `build.ts` paravam no cálculo. O buraco era a junção.
 *
 * Com a decisão num lugar só, os dois callers compartilham o mesmo caminho testado, e "esquecer
 * de passar a correlação" deixa de ser algo que se escreve sem querer em dois arquivos.
 */
import { filterPublishableTrades, runGates, type Correlacao, type GateResult } from "./gates.js";
import type { QuantMetrics } from "../schemas/quant.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { QuantClaim } from "../schemas/agents.js";
import type { TradeCard } from "../schemas/trade.js";

export interface DecisaoInput {
  snapshot: MarketSnapshot;
  claims: readonly QuantClaim[];
  trades: readonly TradeCard[];
  /**
   * O `QuantMetrics` inteiro, não só a matriz de correlação.
   *
   * É de propósito: com `correlacoes: Correlacao[]` na assinatura, passar `[]` é um descuido de
   * uma tecla — foi o que aconteceu. Exigir as métricas obriga o caller a ter rodado o quant, e
   * "esquecer" passa a significar fabricar um QuantMetrics vazio, que é visivelmente errado.
   */
  metrics: Pick<QuantMetrics, "correlacoes_63d">;
}

export interface DecisaoResult {
  gates: GateResult;
  published: TradeCard[];
  rejected: { trade: TradeCard; motivo: string }[];
  correlacoes: readonly Correlacao[];
}

export function decidirPublicacao(input: DecisaoInput): DecisaoResult {
  const correlacoes = input.metrics.correlacoes_63d;

  const gates = runGates({
    snapshot: input.snapshot,
    claims: [...input.claims],
    trades: [...input.trades],
    correlacoes,
  });

  const { published, rejected } = filterPublishableTrades(
    [...input.trades],
    gates.crossCheck.ok,
    correlacoes,
  );

  return { gates, published, rejected, correlacoes };
}
