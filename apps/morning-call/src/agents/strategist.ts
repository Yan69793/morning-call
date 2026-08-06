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

export const PROMPT_VERSION = "strategist@2026-08-06-v3";

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

export function buildStrategistSystemPrompt(opts?: { incluirSchema?: boolean }): string {
  const partes = [
    "Você é estrategista multimercado. Closed-book: use APENAS números do snapshot JSON.",
    "Proibido introduzir cotação, taxa, spread ou probabilidade numérica ausente do snapshot.",
    "",
    "Responda APENAS JSON, sem cerca de markdown.",
    "Todo valor + unidade é objeto {value, unit}. NUNCA número solto.",
    "Unit válida: BRL, USD, BRL_por_USD, pct, bps, index_points, ratio, contratos.",
    "trades pode ser [] se não houver assimetria. Se houver, 1-7 completos.",
    "cenarios tem exatamente 4 itens (base, bull, bear, cisne_cinza) e probabilidade_pct soma 100.",
    "",
    "O esqueleto abaixo define A FORMA, nunca o conteúdo. Texto entre << e >> é instrução do que",
    "escrever naquele campo, não texto para copiar. Nenhum << ou >> pode sobrar na sua resposta.",
    "Nunca reaproveite instrumento, nível, tese ou cenário do esqueleto: tudo sai do snapshot do dia.",
    "",
    "ESQUELETO (forma, não conteúdo):",
    JSON.stringify(STRATEGIST_SKELETON, null, 2),
  ];
  if (opts?.incluirSchema) {
    partes.push(
      "",
      "A resposta precisa satisfazer este JSON Schema:",
      JSON.stringify(buildStrategistJsonSchema()),
    );
  }
  return partes.join("\n");
}

/**
 * Esqueleto de FORMA. Todo texto é placeholder `<<...>>` e todo número é zero, de propósito.
 *
 * O prompt v2 trazia aqui um exemplo realista e completo: Ibovespa a 132000, Selic 14.25%, quatro
 * cenários escritos por extenso. O modelo copiava o conteúdo em vez de seguir a forma. Entre
 * 2026-07-16 e 2026-08-06, oito rodadas gravaram o mesmo trade "Compra de Ibovespa futuro" com
 * `risco_retorno` 1.3043478260869565 idêntico bit a bit (3.0 / 2.3 do exemplo), e os quatro
 * cenários saíam palavra por palavra iguais aos daqui. Só `abertura` e `quant_claims` puxavam
 * dado real do snapshot. Um exemplo plausível é indistinguível de uma resposta plausível, e o
 * modelo escolhe o caminho barato.
 *
 * O delimitador `<<` `>>` existe para ser detectável: `detectPromptEcho` reprova a rodada se algum
 * vazar para a saída. O gate é o mecanismo; a instrução no prompt é só o pedido educado.
 */
const STRATEGIST_SKELETON = {
  abertura: {
    tensao_macro_dominante: "<<tensão macro dominante do dia, 20+ caracteres>>",
    regime: "<<um de: goldilocks|reflacionario|estagflacionario|desinflacionario|recessivo|risk_on_especulativo|risk_off_sistemico|transicao>>",
    vies: "<<um de: comprador|vendedor|neutro|long_vol|short_vol>>",
    conviccao: 0,
    premissa_que_sustenta_precos: "<<premissa que sustenta os preços hoje, 20+ caracteres>>",
    fato_que_quebraria: "<<fato observável que quebraria a premissa, 20+ caracteres>>",
  },
  quant_claims: [
    {
      snapshot_key: "<<chave existente em snapshot_ok>>",
      valor_citado: { value: 0, unit: "<<unit da chave>>" },
      contexto: "<<o que esse número representa>>",
    },
  ],
  trades: [
    {
      nome: "<<nome curto da operação>>",
      classe: "<<classe de ativo>>",
      categoria: "<<um de: direcional|valor_relativo|carry|convexidade|hedge|arbitragem_narrativa|evento|assimetria_cauda>>",
      horizonte: "<<um de: intraday|swing|tatico_1_3m|estrategico_6_12m>>",
      direcao: "<<comprar ou vender>>",
      entrada: {
        tipo: "<<preco, spread ou premio>>",
        instrumento: "<<instrumento negociado>>",
        nivel: { value: 0, unit: "<<unit>>" },
        faixa: { min: { value: 0, unit: "<<unit>>" }, max: { value: 0, unit: "<<unit>>" } },
      },
      alvo_1: { value: 0, unit: "<<unit>>" },
      alvo_2: { value: 0, unit: "<<unit>>" },
      invalidacao: {
        descricao: "<<condição objetiva que invalida a tese, 20+ caracteres>>",
        nivel: { value: 0, unit: "<<unit>>" },
      },
      tese: "<<tese, 20+ caracteres>>",
      erro_precificacao: "<<o que o mercado está errando, 20+ caracteres>>",
      catalisador: "<<evento que destrava a tese, 20+ caracteres>>",
      por_que_agora: "<<por que a janela é agora, 20+ caracteres>>",
      por_que_nao_consensual: "<<por que não é consenso, 20+ caracteres>>",
      riscos_ocultos: "<<risco não óbvio, 20+ caracteres>>",
      plano_saida: "<<regra de saída em alvo e em stop, 20+ caracteres>>",
      estrutura_alternativa: "<<outra forma de montar a mesma exposição, 20+ caracteres>>",
      correlacao_com_outras: "<<relação com os demais trades, 20+ caracteres>>",
      retorno_potencial: { value: 0, unit: "<<unit>>" },
      perda_maxima: { value: 0, unit: "<<unit>>" },
      sizing_pct_orcamento_risco: 0,
      conviccao: 0,
      fontes: ["<<snapshot_key usada>>"],
    },
  ],
  cenarios: [
    {
      nome: "base",
      probabilidade_pct: 0,
      gatilhos_observaveis: ["<<gatilho observável>>"],
      vencedores: ["<<ativo que ganha>>"],
      perdedores: ["<<ativo que perde>>"],
      operacao_preferida: "<<operação preferida no cenário>>",
      hedge: "<<hedge do cenário>>",
      sinal_confirmacao: "<<sinal que confirma>>",
      sinal_invalidacao: "<<sinal que invalida>>",
    },
    { nome: "bull", probabilidade_pct: 0, gatilhos_observaveis: ["<<gatilho>>"], vencedores: ["<<ativo>>"], perdedores: ["<<ativo>>"], operacao_preferida: "<<operação>>", hedge: "<<hedge>>", sinal_confirmacao: "<<sinal>>", sinal_invalidacao: "<<sinal>>" },
    { nome: "bear", probabilidade_pct: 0, gatilhos_observaveis: ["<<gatilho>>"], vencedores: ["<<ativo>>"], perdedores: ["<<ativo>>"], operacao_preferida: "<<operação>>", hedge: "<<hedge>>", sinal_confirmacao: "<<sinal>>", sinal_invalidacao: "<<sinal>>" },
    { nome: "cisne_cinza", probabilidade_pct: 0, gatilhos_observaveis: ["<<gatilho>>"], vencedores: ["<<ativo>>"], perdedores: ["<<ativo>>"], operacao_preferida: "<<operação>>", hedge: "<<hedge>>", sinal_confirmacao: "<<sinal>>", sinal_invalidacao: "<<sinal>>" },
  ],
  rastreabilidade: {
    fatos_verificados: ["<<fato lido direto do snapshot>>"],
    interpretacoes: ["<<leitura sua sobre o fato>>"],
    hipoteses: ["<<aposta não verificável hoje>>"],
    dados_incompletos: ["<<o que faltou no snapshot>>"],
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

/**
 * Trechos que o prompt v2 mandava para o modelo e que ele devolvia verbatim. Não é lista de
 * palavras proibidas: é a impressão digital de uma falha específica e medida em produção.
 * Fica aqui para que uma regressão ao exemplo realista seja barrada mesmo se alguém reintroduzir
 * o padrão sem ler o comentário do esqueleto.
 */
const IMPRESSOES_DIGITAIS_V2 = [
  "Fed em compasso de espera enquanto fiscal brasileiro segue como risco principal",
  "mercado precifica corte de 25bps na proxima reuniao do Copom",
  "IPCA-15 acima de 0.5% ou comunicacao mais dura do BCB",
  "Ibovespa descontado frente aos pares emergentes com expectativa de corte de juros no curto prazo",
  "mercado subestima a velocidade de queda da Selic no segundo semestre",
  "divergencia entre DI futuro e expectativa Focus abre janela de entrada antes do Copom",
  "consenso ainda esta cauteloso com Brasil devido a ruido fiscal recente",
  "piora fiscal pode anular efeito de corte de juros sobre multiples",
  "fecha abaixo do suporte em 129000 pontos com volume acima da media",
  "reduzir 50% no alvo_1, zerar no alvo_2 ou na invalidacao",
  "call spread no IBOV para limitar risco de cauda fiscal",
  "alta correlacao com curva de juros DI e DXY",
  "ata do Copom sinalizando fim do ciclo de aperto",
  "Compra de Ibovespa futuro",
  "fiscal nao piora antes de outubro",
  "fluxo estrangeiro na B3 de julho",
  "mercado precifica corte em setembro",
  "IPCA dentro do esperado",
  "Copom sinaliza corte de 50bps",
  "put IBOV OTM",
  "taxa Selic meta atual",
  "dolar spot PTAX",
] as const;

/**
 * Frase longa o bastante para que a coincidência verbatim não seja acaso. Abaixo disso, uma
 * ocorrência isolada pode ser análise legítima ("put IBOV OTM" é hedge que existe), então o
 * critério passa a ser acúmulo.
 */
const ECHO_FRASE_LONGA = 40;
const ECHO_MIN_CURTAS = 3;

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    // \p{M} = marcas combinantes. Depois do NFD, é o que sobra de acento separado da letra base.
    // Property escape em vez de faixa literal: o arquivo fica ASCII aqui e não depende de encoding.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function coletarStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") {
    out.push(v);
  } else if (Array.isArray(v)) {
    for (const item of v) coletarStrings(item, out);
  } else if (v !== null && typeof v === "object") {
    for (const item of Object.values(v)) coletarStrings(item, out);
  }
  return out;
}

/**
 * Detecta que a resposta é eco do prompt, não análise do snapshot. Devolve os motivos; lista
 * vazia significa saída própria.
 *
 * Existe porque instrução de prompt não é mecanismo. O v2 pedia "siga o formato do exemplo" e o
 * modelo entendeu "repita o exemplo" por três semanas sem nada acusar — o único motivo de nenhum
 * trade fabricado ter sido publicado foi o gate de risco-retorno barrar 1.30 < 1.5 por sorte de
 * calibragem. Detectar o eco na origem é mais barato que torcer para o gate seguinte pegar.
 */
export function detectPromptEcho(raw: StrategistRaw): string[] {
  const motivos: string[] = [];
  const textos = coletarStrings(raw);

  for (const t of textos) {
    if (t.includes("<<") || t.includes(">>")) {
      motivos.push(`placeholder do esqueleto na saída: ${t.slice(0, 60)}`);
    }
  }

  const proibidas = new Map(IMPRESSOES_DIGITAIS_V2.map((f) => [normalizarTexto(f), f]));
  const curtas: string[] = [];
  for (const t of textos) {
    const original = proibidas.get(normalizarTexto(t));
    if (!original) continue;
    if (original.length >= ECHO_FRASE_LONGA) {
      motivos.push(`frase verbatim do prompt v2: ${original.slice(0, 60)}`);
    } else {
      curtas.push(original);
    }
  }
  if (curtas.length >= ECHO_MIN_CURTAS) {
    motivos.push(`${curtas.length} trechos curtos do prompt v2 repetidos: ${curtas.join(" | ")}`);
  }

  return motivos;
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
  /** Motivos de eco do prompt. Vazio = saída própria. Ver `detectPromptEcho`. */
  echo: string[];
}

export async function runStrategist(input: RunStrategistInput): Promise<RunStrategistResult> {
  const content =
    input.mockContent ??
    (
      await chatCompletion({
        apiKey: input.apiKey,
        model: input.model,
        // A API da DeepSeek só garante `json_object`, sem schema estrito. Sem contrato de estrutura
        // vindo do provedor, o modelo se apoiava no exemplo do prompt — que era justamente o que ele
        // copiava. Mandar o schema no texto do system prompt devolve a referência de forma sem
        // devolver a de conteúdo.
        responseFormatJson: input.deepseekApi ? true : false,
        responseFormatJsonSchema: input.deepseekApi ? undefined : {
          name: "MorningCallStrategist",
          schema: buildStrategistJsonSchema(),
          strict: true,
        },
        maxTokens: 16000,
        deepseekApi: input.deepseekApi,
        messages: [
          {
            role: "system",
            content: buildStrategistSystemPrompt({ incluirSchema: input.deepseekApi === true }),
          },
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
    echo: detectPromptEcho(raw),
  };
}
