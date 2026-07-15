/**
 * Contratos de saída dos agentes de runtime. Ver docs/RUNTIME_AGENTS.md.
 * Sem JSON válido contra estes schemas, a etapa falha. Não improvisa.
 */
import { z } from "zod";
import { InstantUTC, Provenance, Quantity, Rationale, Source } from "./common.js";
import { ND_MARKER } from "./data.js";

/** Um fato só é fato com fonte e horário. Sem isso é hipótese, e vai para outra seção do §18. */
export const Fact = z.object({
  claim: z.string().min(1),
  source: Source,
  happened_at: InstantUTC,
});
export type Fact = z.infer<typeof Fact>;

/**
 * Afirmação quantitativa estruturada, não prosa. É o que torna o cross-check numérico
 * (PLANO_ESTRATEGICO §4, mecanismos 3 e 4) implementável: `snapshot_key` liga o número a uma chave
 * do snapshot gravado em D1 e `valor_citado` é o que o modelo declarou. Um validador em código
 * (src/committee/crossCheck) compara os dois. Sem isto, "zero alucinação" é promessa, não mecanismo.
 */
export const QuantClaim = z.object({
  snapshot_key: z.string().min(1),
  valor_citado: Quantity,
  contexto: z.string().optional(),
});
export type QuantClaim = z.infer<typeof QuantClaim>;

export const ResearchOutput = z.object({
  facts: z.array(Fact),
  /** Afirmações numéricas conferidas contra o snapshot pelo cross-check. Vazio é válido. */
  quant_claims: z.array(QuantClaim).default([]),
  market_consensus: z.array(z.string()),
  possible_mispricings: z.array(z.string()),
  uncertainties: z.array(z.string()),
  /** Lacunas admitidas explicitamente. Melhor um buraco declarado que um número inventado. */
  data_gaps: z.array(z.string().startsWith(ND_MARKER)),
  provenance: Provenance,
});
export type ResearchOutput = z.infer<typeof ResearchOutput>;

export const Regime = z.enum([
  "goldilocks",
  "reflacionario",
  "estagflacionario",
  "desinflacionario",
  "recessivo",
  "risk_on_especulativo",
  "risk_off_sistemico",
  "transicao",
]);
export type Regime = z.infer<typeof Regime>;

export const Bias = z.enum(["comprador", "vendedor", "neutro", "long_vol", "short_vol"]);
export type Bias = z.infer<typeof Bias>;

/**
 * Uma tese, antes de virar operação. §"PAPEL E MISSÃO": não confunda boa narrativa com bom
 * trade. Por isso `ja_precificado` é campo obrigatório, e não um comentário no meio do texto.
 */
export const Thesis = z.object({
  id: z.uuid(),
  titulo: z.string().min(1),
  regime: Regime,
  argumento: Rationale,
  erro_precificacao: Rationale,
  o_que_o_consenso_acredita: Rationale,
  ja_precificado: z.boolean(),
  catalisador: Rationale,
  o_que_invalida: Rationale,
  conviccao: z.number().min(0).max(10),
  /** Aponta para AssetMetrics.key ou Source.name usados. Rastreabilidade §18. */
  evidencias: z.array(z.string().min(1)).min(1),
  provenance: Provenance,
});
export type Thesis = z.infer<typeof Thesis>;

export const ThesisList = z.array(Thesis);
