/**
 * Strategist closed-book Portão 1: 1 modelo, só snapshot no prompt.
 * Output: claims + drafts + abertura. TradeCard selado em código.
 */
import { z } from "zod";
import { chatCompletion } from "./openrouter.js";
import { Bias, QuantClaim, Regime, type QuantClaim as QuantClaimT } from "../schemas/agents.js";
import { TradeCardDraft, sealTradeCard, type TradeCard } from "../schemas/trade.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { Provenance } from "../schemas/common.js";
import { Rationale } from "../schemas/common.js";

export const PROMPT_VERSION = "strategist@2026-07-16-v2";

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
    "",
    "Responda APENAS JSON. Siga EXATAMENTE o formato do exemplo abaixo.",
    "Todo valor + unidade é objeto {value, unit}. NUNCA número solto.",
    "Unit válida: BRL, USD, BRL_por_USD, pct, bps, index_points, ratio, contratos.",
    "trades pode ser [] se não houver assimetria. Se houver, 1-7 completos.",
    "",
    "EXEMPLO DE FORMATO CORRETO (siga esta estrutura exata):",
    JSON.stringify(STRATEGIST_EXAMPLE, null, 2),
  ].join("\n");
}

const STRATEGIST_EXAMPLE = {
  abertura: {
    tensao_macro_dominante: "Fed em compasso de espera enquanto fiscal brasileiro segue como risco principal",
    regime: "desinflacionario",
    vies: "comprador",
    conviccao: 7,
    premissa_que_sustenta_precos: "mercado precifica corte de 25bps na proxima reuniao do Copom",
    fato_que_quebraria: "IPCA-15 acima de 0.5% ou comunicacao mais dura do BCB",
  },
  quant_claims: [
    { snapshot_key: "SELIC_META", valor_citado: { value: 14.25, unit: "pct" }, contexto: "taxa Selic meta atual" },
    { snapshot_key: "USDBRL", valor_citado: { value: 5.07, unit: "BRL_por_USD" }, contexto: "dolar spot PTAX" },
  ],
  trades: [
    {
      nome: "Compra de Ibovespa futuro",
      classe: "equities BR",
      categoria: "direcional",
      horizonte: "swing",
      direcao: "comprar",
      entrada: {
        tipo: "preco",
        instrumento: "IBOV",
        nivel: { value: 132000, unit: "index_points" },
        faixa: { min: { value: 131000, unit: "index_points" }, max: { value: 133000, unit: "index_points" } },
      },
      alvo_1: { value: 136000, unit: "index_points" },
      alvo_2: { value: 140000, unit: "index_points" },
      invalidacao: { descricao: "fecha abaixo do suporte em 129000 pontos com volume acima da media", nivel: { value: 129000, unit: "index_points" } },
      tese: "Ibovespa descontado frente aos pares emergentes com expectativa de corte de juros no curto prazo",
      erro_precificacao: "mercado subestima a velocidade de queda da Selic no segundo semestre",
      catalisador: "ata do Copom sinalizando fim do ciclo de aperto",
      por_que_agora: "divergencia entre DI futuro e expectativa Focus abre janela de entrada antes do Copom",
      por_que_nao_consensual: "consenso ainda esta cauteloso com Brasil devido a ruido fiscal recente",
      riscos_ocultos: "piora fiscal pode anular efeito de corte de juros sobre multiples",
      plano_saida: "reduzir 50% no alvo_1, zerar no alvo_2 ou na invalidacao",
      estrutura_alternativa: "call spread no IBOV para limitar risco de cauda fiscal",
      correlacao_com_outras: "alta correlacao com curva de juros DI e DXY",
      retorno_potencial: { value: 3.0, unit: "pct" },
      perda_maxima: { value: 2.3, unit: "pct" },
      sizing_pct_orcamento_risco: 2.0,
      conviccao: 7,
      fontes: ["SELIC_META", "USDBRL", "IBOV"],
    },
  ],
  cenarios: [
    { nome: "base", probabilidade_pct: 50, gatilhos_observaveis: ["IPCA dentro do esperado"], vencedores: ["Ibovespa", "small caps"], perdedores: ["dolar", "DI curto"], operacao_preferida: "compra de IBOV", hedge: "put IBOV OTM", sinal_confirmacao: "IPCA abaixo de 0.3%", sinal_invalidacao: "IPCA acima de 0.5%" },
    { nome: "bull", probabilidade_pct: 20, gatilhos_observaveis: ["Copom sinaliza corte de 50bps"], vencedores: ["small caps", "consumo"], perdedores: ["DI curto"], operacao_preferida: "compra de SMLL", hedge: "vendido em DI", sinal_confirmacao: "comunicado dovish", sinal_invalidacao: "comunicado hawkish" },
    { nome: "bear", probabilidade_pct: 25, gatilhos_observaveis: ["dolar acima de 5.30"], vencedores: ["exportadoras", "VALE3"], perdedores: ["consumo domestico"], operacao_preferida: "compra de VALE3", hedge: "vendido em IBOV", sinal_confirmacao: "DXY acima de 107", sinal_invalidacao: "DXY abaixo de 104" },
    { nome: "cisne_cinza", probabilidade_pct: 5, gatilhos_observaveis: ["crise fiscal aguda"], vencedores: ["ouro", "dolar"], perdedores: ["bolsa BR", "DI longo"], operacao_preferida: "compra de ouro", hedge: "nao aplicavel", sinal_confirmacao: "CDS Brasil acima de 300", sinal_invalidacao: "anuncio de medidas fiscais" },
  ],
  rastreabilidade: {
    fatos_verificados: ["SELIC em 14.25%", "USDBRL em 5.07"],
    interpretacoes: ["mercado precifica corte em setembro"],
    hipoteses: ["fiscal nao piora antes de outubro"],
    dados_incompletos: ["fluxo estrangeiro na B3 de julho"],
  },
};

/**
 * JSON Schema equivalente a StrategistRaw + TradeCardDraft para Structured Output.
 * Minimalista: Anthropic não suporta `exclusiveMinimum`, `anyOf` com `null`,
 * `additionalProperties: false` em objetos aninhados, nem `minItems`/`minLength`.
 * A validação fina fica com o Zod no parseStrategistContent.
 */
export function buildStrategistJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      abertura: {
        type: "object",
        properties: {
          tensao_macro_dominante: { type: "string" },
          regime: { type: "string", enum: ["goldilocks", "reflacionario", "estagflacionario", "desinflacionario", "recessivo", "risk_on_especulativo", "risk_off_sistemico", "transicao"] },
          vies: { type: "string", enum: ["comprador", "vendedor", "neutro", "long_vol", "short_vol"] },
          conviccao: { type: "number" },
          premissa_que_sustenta_precos: { type: "string" },
          fato_que_quebraria: { type: "string" },
        },
        required: ["tensao_macro_dominante", "regime", "vies", "conviccao", "premissa_que_sustenta_precos", "fato_que_quebraria"],
      },
      quant_claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            snapshot_key: { type: "string" },
            valor_citado: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            contexto: { type: "string" },
          },
          required: ["snapshot_key", "valor_citado"],
        },
      },
      trades: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nome: { type: "string" },
            classe: { type: "string" },
            categoria: { type: "string", enum: ["direcional", "valor_relativo", "carry", "convexidade", "hedge", "arbitragem_narrativa", "evento", "assimetria_cauda"] },
            horizonte: { type: "string", enum: ["intraday", "swing", "tatico_1_3m", "estrategico_6_12m"] },
            direcao: { type: "string", enum: ["comprar", "vender"] },
            entrada: {
              type: "object",
              properties: {
                tipo: { type: "string", enum: ["preco", "spread", "premio"] },
                instrumento: { type: "string" },
                nivel: {
                  type: "object",
                  properties: { value: { type: "number" }, unit: { type: "string" } },
                  required: ["value", "unit"],
                },
                faixa: {
                  type: "object",
                  properties: {
                    min: { type: "object", properties: { value: { type: "number" }, unit: { type: "string" } }, required: ["value", "unit"] },
                    max: { type: "object", properties: { value: { type: "number" }, unit: { type: "string" } }, required: ["value", "unit"] },
                  },
                  required: ["min", "max"],
                },
                pernas: { type: "array", items: { type: "object", properties: { instrumento: { type: "string" }, lado: { type: "string", enum: ["long", "short"] }, peso: { type: "number" } } } },
              },
              required: ["tipo", "nivel", "faixa"],
            },
            alvo_1: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            alvo_2: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            invalidacao: {
              type: "object",
              properties: {
                descricao: { type: "string" },
                nivel: {
                  type: "object",
                  properties: { value: { type: "number" }, unit: { type: "string" } },
                  required: ["value", "unit"],
                },
              },
              required: ["descricao"],
            },
            tese: { type: "string" },
            erro_precificacao: { type: "string" },
            catalisador: { type: "string" },
            por_que_agora: { type: "string" },
            por_que_nao_consensual: { type: "string" },
            riscos_ocultos: { type: "string" },
            plano_saida: { type: "string" },
            estrutura_alternativa: { type: "string" },
            correlacao_com_outras: { type: "string" },
            retorno_potencial: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            perda_maxima: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            sizing_pct_orcamento_risco: { type: "number" },
            conviccao: { type: "number" },
            fontes: { type: "array", items: { type: "string" } },
          },
          required: ["nome", "classe", "categoria", "horizonte", "direcao", "entrada", "alvo_1", "alvo_2", "invalidacao", "tese", "erro_precificacao", "catalisador", "por_que_agora", "por_que_nao_consensual", "riscos_ocultos", "plano_saida", "estrutura_alternativa", "correlacao_com_outras", "retorno_potencial", "perda_maxima", "sizing_pct_orcamento_risco", "conviccao", "fontes"],
        },
      },
      cenarios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nome: { type: "string", enum: ["base", "bull", "bear", "cisne_cinza"] },
            probabilidade_pct: { type: "number" },
            gatilhos_observaveis: { type: "array", items: { type: "string" } },
            vencedores: { type: "array", items: { type: "string" } },
            perdedores: { type: "array", items: { type: "string" } },
            operacao_preferida: { type: "string" },
            hedge: { type: "string" },
            sinal_confirmacao: { type: "string" },
            sinal_invalidacao: { type: "string" },
          },
          required: ["nome", "probabilidade_pct", "gatilhos_observaveis", "vencedores", "perdedores", "operacao_preferida", "hedge", "sinal_confirmacao", "sinal_invalidacao"],
        },
      },
      rastreabilidade: {
        type: "object",
        properties: {
          fatos_verificados: { type: "array", items: { type: "string" } },
          interpretacoes: { type: "array", items: { type: "string" } },
          hipoteses: { type: "array", items: { type: "string" } },
          dados_incompletos: { type: "array", items: { type: "string" } },
        },
        required: ["fatos_verificados", "interpretacoes", "hipoteses", "dados_incompletos"],
      },
    },
    required: ["abertura", "quant_claims", "trades", "cenarios", "rastreabilidade"],
  };
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
      instrucao: "Siga EXATAMENTE o formato e estrutura dos campos do system prompt. Produza JSON completo com abertura, quant_claims, trades, cenarios e rastreabilidade. Use os dados do snapshot_ok como referencia para quant_claims. snapshot_nd são dados indisponíveis.",
    },
    null,
    2,
  );
}

export function parseStrategistContent(content: string): StrategistRaw {
  // remove fence se modelo embrulhar
  const trimmed = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const json = JSON.parse(trimmed) as unknown;
  return StrategistRaw.parse(json);
}

export function sealStrategistTrades(raw: StrategistRaw, provenance: Provenance): TradeCard[] {
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
  /** se true, usa api.deepseek.com em vez de OpenRouter */
  deepseekApi?: boolean;
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
        responseFormatJson: input.deepseekApi ? true : false,
        responseFormatJsonSchema: input.deepseekApi ? undefined : {
          name: "MorningCallStrategist",
          schema: buildStrategistJsonSchema(),
          strict: true,
        },
        maxTokens: 16000,
        deepseekApi: input.deepseekApi,
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
