/**
 * Contratos de I/O do Morning Call — a fonte de verdade dos tipos.
 *
 * Princípio: todo dado carrega origem e horário; toda operação carrega entrada, alvo e
 * invalidação. A ausência de qualquer campo obrigatório INVALIDA o objeto (checado em runtime).
 * Ver AGENTS.md §3 e MORNING_CALL_OTIMIZADO.md §11 e §18.
 */
import { z } from "zod";

/** Um dado sempre rastreável. Sem fonte, use status "ND". */
export const DataPoint = z.object({
  key: z.string(),                       // ex.: "USDBRL", "DI_JAN27"
  value: z.number().nullable(),
  unit: z.string(),                      // ex.: "BRL", "%", "bps", "index"
  source: z.string(),                    // ex.: "BCB PTAX", "B3"
  url: z.string().url().optional(),
  timestamp_brt: z.string(),             // ISO em BRT
  as_of: z.string(),                     // data/hora de referência do dado
  status: z.enum(["OK", "ND"]).default("OK"), // ND = "N/D — REQUER VERIFICAÇÃO"
});
export type DataPoint = z.infer<typeof DataPoint>;

export const Horizon = z.enum(["intraday", "swing", "tatico_1_3m", "estrategico_6_12m"]);

export const TradeCategory = z.enum([
  "direcional", "valor_relativo", "carry", "convexidade",
  "hedge", "arbitragem_narrativa", "evento", "assimetria_cauda",
]);

/** Ficha de trade — contrato crítico. Todos os campos abaixo são OBRIGATÓRIOS. */
export const TradeCard = z.object({
  nome: z.string(),
  classe: z.string(),
  instrumento: z.string(),
  direcao: z.enum(["comprar", "vender", "spread", "estrutura"]),
  entrada: z.number(),
  faixa_entrada: z.tuple([z.number(), z.number()]),
  horizonte: Horizon,
  tese: z.string(),
  erro_precificacao: z.string(),
  catalisador: z.string(),
  por_que_agora: z.string(),
  por_que_nao_consensual: z.string(),
  retorno_potencial: z.string(),
  perda_maxima: z.string(),
  risco_retorno: z.number(),             // ex.: 3 => 3:1
  invalidacao: z.string(),               // stop ou condição objetiva
  alvo_1: z.number(),
  alvo_2: z.number(),
  sizing_pct_orcamento_risco: z.number(),// % do ORÇAMENTO DE RISCO, não do patrimônio
  correlacao_com_outras: z.string(),
  riscos_ocultos: z.string(),
  plano_saida: z.string(),
  estrutura_alternativa: z.string(),
  conviccao: z.number().min(0).max(10),
  categoria: TradeCategory,
  fontes: z.array(z.string()).min(1),    // sem fonte, o trade não passa
});
export type TradeCard = z.infer<typeof TradeCard>;

export const RedTeamVerdict = z.object({
  trade_nome: z.string(),
  veredito: z.enum(["aprovar", "rejeitar", "revisar"]),
  premissa_mais_fragil: z.string(),
  ja_precificado: z.boolean(),
  carry_negativo: z.boolean(),
  risco_de_gap: z.boolean(),
  hedge_destroi_retorno: z.boolean(),
  correlacao_oculta: z.string().optional(),
  evidencia_contraria: z.string(),
});
export type RedTeamVerdict = z.infer<typeof RedTeamVerdict>;

export const ValidationReport = z.object({
  probabilidades_somam_100: z.boolean(),
  trades_sem_entrada: z.array(z.string()),
  trades_sem_alvo: z.array(z.string()),
  trades_sem_invalidacao: z.array(z.string()),
  numeros_conflitantes: z.array(z.string()),
  frases_vagas: z.array(z.string()),
  fontes_ausentes: z.array(z.string()),
  aprovado: z.boolean(),
});
export type ValidationReport = z.infer<typeof ValidationReport>;
