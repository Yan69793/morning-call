/**
 * Contratos de saída dos agentes de runtime. Ver docs/RUNTIME_AGENTS.md.
 * Sem JSON válido contra estes schemas, a etapa falha. Não improvisa.
 */
import { z } from "zod";
import { InstantUTC, Provenance, Rationale, Source } from "./common.js";
import { ND_MARKER } from "./data.js";

/** Um fato só é fato com fonte e horário. Sem isso é hipótese, e vai para outra seção do §18. */
export const Fact = z.object({
  claim: z.string().min(1),
  source: Source,
  happened_at: InstantUTC,
});
export type Fact = z.infer<typeof Fact>;

export const ResearchOutput = z.object({
  facts: z.array(Fact),
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
