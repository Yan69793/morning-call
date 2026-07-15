/**
 * Strategist closed-book Portão 1: 1 modelo, só snapshot no prompt.
 * Output: claims + drafts + abertura. TradeCard selado em código.
 */
import { z } from "zod";
import { chatCompletion } from "./openrouter.js";
import {
  Bias,
  QuantClaim,
  Regime,
  type QuantClaim as QuantClaimT,
} from "../schemas/agents.js";
import { TradeCardDraft, sealTradeCard, type TradeCard } from "../schemas/trade.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { Provenance } from "../schemas/common.js";
import { Rationale } from "../schemas/common.js";

export const PROMPT_VERSION = "strategist@2026-07-15";

export const StrategistRaw = z.object({
  abertura: z.object({
    tensao_macro_dominante: Rationale,
    regime: Regime,
    vies: Bias,
    conviccao: z.number().min(0).max(10),
    premissa_que_sustenta_precos: Rationale,
    fato_que_quebraria: Rationale,
  }),
  quant_claims: z.array(QuantClaim),
  trades: z.array(TradeCardDraft).max(7),
  cenarios: z
    .array(
      z.object({
        nome: z.enum(["base", "bull", "bear", "cisne_cinza"]),
        probabilidade_pct: z.number().min(0).max(100),
        gatilhos_observaveis: z.array(z.string().min(1)).min(1),
        vencedores: z.array(z.string()),
        perdedores: z.array(z.string()),
        operacao_preferida: z.string().min(1),
        hedge: z.string().min(1),
        sinal_confirmacao: z.string().min(1),
        sinal_invalidacao: z.string().min(1),
      }),
    )
    .length(4),
  rastreabilidade: z.object({
    fatos_verificados: z.array(z.string()),
    interpretacoes: z.array(z.string()),
    hipoteses: z.array(z.string()),
    dados_incompletos: z.array(z.string()),
  }),
});
export type StrategistRaw = z.infer<typeof StrategistRaw>;

export function buildStrategistSystemPrompt(): string {
  return [
    "Você é estrategista multimercado. Closed-book: use APENAS números do snapshot JSON.",
    "Proibido introduzir cotação, taxa, spread ou probabilidade numérica ausente do snapshot.",
    "Toda afirmação quantitativa vira quant_claims com snapshot_key e valor_citado idênticos ao snapshot.",
    "Trades: entrada/alvo/invalidação objetivos. Se não houver assimetria, trades=[].",
    "Responda só JSON válido no schema pedido.",
  ].join(" ");
}

export function buildStrategistUserPrompt(snapshot: MarketSnapshot): string {
  const okPoints = snapshot.points
    .filter((p) => p.status === "OK")
    .map((p) => ({
      key: p.key,
      value: p.quantity.value,
      unit: p.quantity.unit,
      venue: p.venue,
      as_of: p.as_of,
      source: p.source.name,
    }));
  const nd = snapshot.points.filter((p) => p.status === "ND").map((p) => p.key);
  return JSON.stringify(
    {
      trade_date: snapshot.trade_date,
      snapshot_ok: okPoints,
      snapshot_nd: nd,
      instrucao:
        "Gere abertura, quant_claims, até 7 trades, 4 cenários (prob somam 100%), rastreabilidade.",
    },
    null,
    2,
  );
}

export function parseStrategistContent(content: string): StrategistRaw {
  // remove fence se modelo embrulhar
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const json = JSON.parse(trimmed) as unknown;
  return StrategistRaw.parse(json);
}

export function sealStrategistTrades(
  raw: StrategistRaw,
  provenance: Provenance,
): TradeCard[] {
  return raw.trades.map((draft) => sealTradeCard(draft, crypto.randomUUID(), provenance));
}

export interface RunStrategistInput {
  snapshot: MarketSnapshot;
  apiKey: string;
  model: string;
  runId: string;
  fetchFn?: typeof fetch;
  /** injeta resposta (testes offline) */
  mockContent?: string;
}

export interface RunStrategistResult {
  raw: StrategistRaw;
  claims: QuantClaimT[];
  trades: TradeCard[];
  provenance: Provenance;
  model: string;
}

export async function runStrategist(input: RunStrategistInput): Promise<RunStrategistResult> {
  const content =
    input.mockContent ??
    (
      await chatCompletion({
        apiKey: input.apiKey,
        model: input.model,
        responseFormatJson: true,
        messages: [
          { role: "system", content: buildStrategistSystemPrompt() },
          { role: "user", content: buildStrategistUserPrompt(input.snapshot) },
        ],
        fetchFn: input.fetchFn,
      })
    ).content;

  const raw = parseStrategistContent(content);
  const provenance: Provenance = {
    run_id: input.runId,
    model: input.model,
    prompt_version: PROMPT_VERSION,
    generated_at: new Date().toISOString(),
  };
  const trades = sealStrategistTrades(raw, provenance);
  return {
    raw,
    claims: raw.quant_claims,
    trades,
    provenance,
    model: input.model,
  };
}
