/**
 * ValidationReport em código (não LLM).
 *
 * `numeros_conflitantes` e `trades_correlacionados_sem_justificativa` eram literais `[]`. Isso não
 * é "nenhum conflito encontrado": é o relatório afirmando que conferiu sem ter conferido — a mesma
 * classe de mentira que o sistema existe para impedir. Agora os dois vêm de quem de fato apurou:
 * o `crossCheck` e os gates do comitê.
 */
import { FRASES_VAGAS_PROIBIDAS, ValidationReport, type MorningCall } from "../schemas/report.js";
import type { CrossCheckResult } from "../committee/crossCheck.js";
import type { TradeCard } from "../schemas/trade.js";

function textBlob(mc: MorningCall): string {
  const parts: string[] = [
    mc.abertura.tensao_macro_dominante,
    mc.abertura.premissa_que_sustenta_precos,
    mc.abertura.fato_que_quebraria,
    ...mc.rastreabilidade.fatos_verificados,
    ...mc.rastreabilidade.interpretacoes,
    ...mc.rastreabilidade.hipoteses,
  ];
  for (const t of mc.trades) {
    const d = t.draft;
    parts.push(
      d.tese,
      d.erro_precificacao,
      d.catalisador,
      d.por_que_agora,
      d.invalidacao.descricao,
    );
  }
  return parts.join("\n").toLowerCase();
}

export interface ValidateInput {
  /** Resultado do cross-check numérico da rodada. Ver `src/committee/crossCheck.ts`. */
  crossCheck?: CrossCheckResult;
  /** Nomes dos trades barrados por redundância, vindos de `runGates`. */
  correlacionados?: readonly string[];
}

export function validateMorningCall(mc: MorningCall, input: ValidateInput = {}): ValidationReport {
  const trades_sem_invalidacao: string[] = [];
  const trades_sem_fonte: string[] = [];
  const trades_com_risco_retorno_divergente: string[] = [];
  const frases_vagas: string[] = [];

  for (const t of mc.trades) {
    const d = t.draft;
    if (!d.invalidacao.descricao || d.invalidacao.descricao.length < 20) {
      trades_sem_invalidacao.push(d.nome);
    }
    if (d.fontes.length === 0) trades_sem_fonte.push(d.nome);
    const expected = d.retorno_potencial.value / d.perda_maxima.value;
    if (Math.abs(expected - t.risco_retorno.value) > 1e-9) {
      trades_com_risco_retorno_divergente.push(d.nome);
    }
  }

  const blob = textBlob(mc);
  for (const f of FRASES_VAGAS_PROIBIDAS) {
    if (blob.includes(f)) frases_vagas.push(f);
  }

  const probOk = Math.abs(mc.cenarios.reduce((a, s) => a + s.probabilidade_pct, 0) - 100) < 0.01;

  const rankingOk =
    mc.ranking.length === mc.trades.length &&
    mc.ranking.every((i) => i >= 0 && i < mc.trades.length);

  // Cada violação do cross-check é um número que o modelo disse ter lido do snapshot e não bate
  // com o que está gravado. É a definição operacional de "número conflitante".
  const numeros_conflitantes = (input.crossCheck?.violations ?? []).map(
    (v) => `${v.snapshot_key}: ${v.motivo}`,
  );

  const trades_correlacionados_sem_justificativa = [...(input.correlacionados ?? [])];

  const aprovado =
    probOk &&
    rankingOk &&
    trades_sem_invalidacao.length === 0 &&
    trades_sem_fonte.length === 0 &&
    trades_com_risco_retorno_divergente.length === 0 &&
    numeros_conflitantes.length === 0 &&
    trades_correlacionados_sem_justificativa.length === 0 &&
    frases_vagas.length === 0;

  return ValidationReport.parse({
    run_id: mc.run_id,
    probabilidades_somam_100: probOk,
    trades_sem_invalidacao,
    trades_sem_fonte,
    trades_com_risco_retorno_divergente,
    trades_correlacionados_sem_justificativa,
    numeros_conflitantes,
    frases_vagas,
    fontes_ausentes: trades_sem_fonte,
    aprovado,
  });
}

/** Ranking por risco_retorno desc → índices. */
export function rankTrades(trades: readonly TradeCard[]): number[] {
  return trades
    .map((t, i) => ({ i, rr: t.risco_retorno.value }))
    .sort((a, b) => b.rr - a.rr)
    .map((x) => x.i);
}
