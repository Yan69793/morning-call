/**
 * Contrato do relatório final e do validador. Ver MORNING_CALL_OTIMIZADO.md §1, §13, §18, §19.
 */
import { z } from "zod";
import { CalendarDate, InstantUTC, Provenance, Rationale } from "./common.js";
import { Bias, Regime } from "./agents.js";
import { TradeCard } from "./trade.js";

/** §13: probabilidades somam 100%. Verificado abaixo, não pedido por favor no prompt. */
export const Scenario = z.object({
  nome: z.enum(["base", "bull", "bear", "cisne_cinza"]),
  probabilidade_pct: z.number().min(0).max(100),
  gatilhos_observaveis: z.array(z.string().min(1)).min(1),
  vencedores: z.array(z.string()),
  perdedores: z.array(z.string()),
  operacao_preferida: z.string().min(1),
  hedge: z.string().min(1),
  sinal_confirmacao: z.string().min(1),
  sinal_invalidacao: z.string().min(1),
});
export type Scenario = z.infer<typeof Scenario>;

export const ScenarioSet = z
  .array(Scenario)
  .length(4)
  // Tolerância de 0.01 por causa de ponto flutuante, não por causa de arredondamento do modelo:
  // 33,3 + 33,3 + 33,3 = 99,9 continua sendo rejeitado, como deve.
  .refine((ss) => Math.abs(ss.reduce((acc, s) => acc + s.probabilidade_pct, 0) - 100) < 0.01, {
    message: "probabilidades dos cenários precisam somar 100%",
  })
  .refine((ss) => new Set(ss.map((s) => s.nome)).size === 4, {
    message: "os quatro cenários precisam ser distintos (base, bull, bear, cisne cinza)",
  });

/** §1: abertura executiva. */
export const ExecutiveSummary = z.object({
  tensao_macro_dominante: Rationale,
  regime: Regime,
  vies: Bias,
  conviccao: z.number().min(0).max(10),
  premissa_que_sustenta_precos: Rationale,
  fato_que_quebraria: Rationale,
});

/** §18: a separação rigorosa entre o que é fato, leitura, aposta e buraco. */
export const Traceability = z.object({
  fatos_verificados: z.array(z.string()),
  interpretacoes: z.array(z.string()),
  hipoteses: z.array(z.string()),
  dados_incompletos: z.array(z.string()),
});

export const MorningCall = z.object({
  run_id: z.uuid(),
  trade_date: CalendarDate,
  generated_at: InstantUTC,
  abertura: ExecutiveSummary,
  /** §11: entre 3 e 7 operações. Vazio é legítimo e significa "NÃO OPERAR É A MELHOR OPERAÇÃO". */
  trades: z.array(TradeCard).max(7),
  /** Ordem do §12: índices em `trades`, do melhor para o pior. */
  ranking: z.array(z.number().int().nonnegative()),
  cenarios: ScenarioSet,
  rastreabilidade: Traceability,
  provenance: Provenance,
  disclaimer: z.literal(
    "Este material apresenta cenários e estruturas para análise profissional. A execução depende " +
      "de suitability, mandato, liquidez, custos, tributação e limites individuais de risco.",
  ),
});
export type MorningCall = z.infer<typeof MorningCall>;

/** §19 proíbe estas construções: elas descrevem o mundo sem instruir ação nenhuma. */
export const FRASES_VAGAS_PROIBIDAS = [
  "monitorar o cenário",
  "manter cautela",
  "mercado segue atento",
  "pode haver volatilidade",
  "cautela é recomendada",
  "acompanhar de perto",
] as const;

/**
 * Relatório do validador. Diferente do original, isto é produzido por código (src/committee),
 * não por um LLM: as sete checagens abaixo são todas decidíveis sem opinião.
 */
export const ValidationReport = z.object({
  run_id: z.uuid(),
  probabilidades_somam_100: z.boolean(),
  trades_sem_invalidacao: z.array(z.string()),
  trades_sem_fonte: z.array(z.string()),
  trades_com_risco_retorno_divergente: z.array(z.string()),
  trades_correlacionados_sem_justificativa: z.array(z.string()),
  numeros_conflitantes: z.array(z.string()),
  frases_vagas: z.array(z.string()),
  fontes_ausentes: z.array(z.string()),
  aprovado: z.boolean(),
});
export type ValidationReport = z.infer<typeof ValidationReport>;
