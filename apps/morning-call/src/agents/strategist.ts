/**
 * Strategist closed-book Portão 1: 1 modelo, só snapshot no prompt.
 * Output: claims + drafts + abertura. TradeCard selado em código.
 */
import { z } from "zod";
import {
  chatCompletion,
  aceitaJsonSchemaEstrito,
  resolverProvedor,
  type ChatMessage,
  type Provedor,
} from "./openrouter.js";
import { Bias, QuantClaim, Regime, type QuantClaim as QuantClaimT } from "../schemas/agents.js";
import { TradeCardDraft, sealTradeCard, type TradeCard } from "../schemas/trade.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { Provenance } from "../schemas/common.js";
import { Rationale } from "../schemas/common.js";

export const PROMPT_VERSION = "strategist@2026-08-06-v3";

/**
 * Teto de max_tokens do strategist quando o chamador não injeta outro. Era hardcoded
 * 8000 em produção desde o início e este é o valor que a produção usa hoje — a variável
 * `STRATEGIST_MAX_TOKENS` (via workflow) só existe para abaixar o teto sem deploy quando
 * o crédito da conta não cobre a pré-autorização (402 de reserva).
 */
export const STRATEGIST_MAX_TOKENS_PADRAO = 8000;

/**
 * Quantas vezes o strategist pode ser corrigido na mesma rodada antes de reprovar. Duas correções
 * custam no máximo duas chamadas extras e cobrem o caso medido (uma incoerência residual depois de
 * enunciar as regras). Sem limite, modelo teimoso vira laço pago.
 */
export const MAX_TENTATIVAS_CORRECAO = 2;

export interface ProblemaValidacao {
  /** Caminho do campo no JSON do modelo, ex. `trades.0.alvo_2`. */
  caminho: string;
  /** Mensagem do validador, ex. "alvo_2 precisa ser mais distante da entrada que alvo_1". */
  mensagem: string;
}

/**
 * Extrai os problemas só quando o erro é de validação. Devolve vazio para qualquer outra coisa
 * (JSON quebrado, erro de rede), e vazio é o sinal para reprovar na hora em vez de pedir correção,
 * porque não há o que o modelo conserte num erro que não é de conteúdo.
 */
export function problemasDeValidacao(err: unknown): ProblemaValidacao[] {
  if (!(err instanceof z.ZodError)) return [];
  return err.issues.map((i) => ({
    caminho: i.path.map((p) => String(p)).join("."),
    mensagem: i.message,
  }));
}

/**
 * Prompt de correção. Diz o que está errado, campo por campo, e manda devolver o JSON inteiro de
 * novo. Repetir as regras aqui seria redundante com o system prompt e gastaria contexto, mas a
 * linha final repete as duas que mais falham porque foi medido que elas são as que escapam.
 */
export function buildCorrecaoPrompt(problemas: readonly ProblemaValidacao[]): string {
  const linhas = problemas.map((p) => `- ${p.caminho}: ${p.mensagem}`);
  return [
    "O JSON anterior foi REPROVADO pelo validador nestes pontos:",
    ...linhas,
    "",
    "Corrija exatamente esses pontos e devolva o JSON COMPLETO de novo, com a mesma estrutura e os",
    "mesmos instrumentos, mudando só o necessário para a validação passar. Lembre das invariantes:",
    "direcao=\"comprar\" exige alvo_1 acima da entrada e invalidacao.nivel abaixo dela;",
    "direcao=\"vender\" exige alvo_1 abaixo da entrada e invalidacao.nivel acima dela;",
    "alvo_2 é sempre mais distante da entrada que alvo_1.",
    "Responda APENAS o JSON, sem cerca de markdown e sem comentário.",
  ].join("\n");
}

/**
 * Lê `STRATEGIST_MAX_TOKENS` do ambiente. Ausente, vazia ou não inteiro positivo = default
 * (8000). Var inválida não derruba a rodada: o valor volta undefined e o chamador loga
 * aviso, mesmo contrato de `RESEARCH_MAX_RESULTS`.
 */
export function strategistMaxTokensFromEnv(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

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
    // Medido em 22/09/2026, primeira corrida na API da OpenAI: tres dos quatro trades foram
    // reprovados por `alvo_1 contradiz a direção da operação` e um por `invalidação está do lado
    // errado da entrada`. As regras existiam só no `.refine()` de `sealTradeCard` (src/schemas/
    // trade.ts) e nunca foram ditas ao modelo. O prompt anterior funcionava porque o modelo da vez
    // (google/gemini-3.6-flash) trazia a convenção de mercado como prior. Julgar por regra que o
    // prompt não enuncia é loteria de fornecedor, e a loteria só aparece às 06h30.
    "REGRAS DE COERÊNCIA. O validador reprova a rodada inteira se qualquer uma for violada:",
    "1. direcao=\"comprar\": alvo_1 acima de entrada.nivel, alvo_2 acima de alvo_1,",
    "   invalidacao.nivel abaixo de entrada.nivel (ou null).",
    "2. direcao=\"vender\": alvo_1 abaixo de entrada.nivel, alvo_2 abaixo de alvo_1,",
    "   invalidacao.nivel acima de entrada.nivel (ou null).",
    "3. entrada.faixa.min <= entrada.nivel <= entrada.faixa.max.",
    "4. alvo_1, alvo_2 e os dois limites da faixa usam a MESMA unidade de entrada.nivel.",
    "5. retorno_potencial e perda_maxima são MAGNITUDES positivas e da mesma unidade;",
    "   a direção da operação vem só de `direcao`, nunca do sinal desses dois.",
    "6. entrada, faixa e alvos falam do MESMO instrumento, na MESMA escala e na MESMA ordem de",
    "   grandeza. Um alvo a milhares por cento da entrada é erro de escala, não operação.",
    "   Não misture taxa diária com nível anual, nem nível de índice com variação percentual.",
    "7. retorno_potencial e perda_maxima têm de bater com a distância real entre entrada e alvo,",
    "   na convenção de unidade que você escolher. As duas convenções são aceitas, e ambas",
    "   precisam ser coerentes: em `pct` (3 significa 3%) ou na unidade da entrada (0.17 em",
    "   BRL_por_USD significa 17 centavos por dólar). Declarar 3% de retorno com alvo a 8000%",
    "   da entrada reprova a rodada.",
    "8. sizing_pct_orcamento_risco é PERCENTUAL de 0 a 100. Cinco por cento do orçamento de risco",
    "   é 5, nunca 0,05.",
    // Medido em 22/09/2026. Duas corridas seguidas usaram convenções diferentes para retorno e
    // perda, `pct` numa e a unidade da entrada na outra, e o prompt não dizia qual valia nem
    // fixava escala nenhuma. Ambas passavam no schema porque a unidade é livre. A regra 7 mantém a
    // liberdade e cobra coerência, que é o que o validador passou a checar também.
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
          // `minimum`/`maximum` espelham o `.min(0).max(10)` do Zod em StrategistRaw. Sem eles o
          // schema mandado ao provedor não tinha limite, e o modelo devolveu valores acima de 10 no
          // benchmark de 10/09: a rodada morria no parse, não no modelo.
          conviccao: { type: "number", minimum: 0, maximum: 10 },
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
            conviccao: { type: "number", minimum: 0, maximum: 10 },
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

export interface PesquisaContexto {
  /** JSON do analyst (BriefAnalisado serializado), já conferido contra as citações. */
  analise: string;
  /** Fontes com proveniência, já formatadas com selo de janela (`formatarFontes`). */
  fontes: string;
}

/**
 * Bloco de pesquisa anexado ao prompt do usuário. O estrategista continua closed-book para
 * números: o snapshot é a única origem de valor citável em `quant_claims`. A pesquisa entra como
 * contexto narrativo e como lista de fontes permitidas — nunca como cotação.
 */
export function buildPesquisaBlock(p: PesquisaContexto): string {
  return [
    "",
    "--- PESQUISA WEB (material externo, fora do snapshot) ---",
    "As fontes abaixo vieram de busca web e são as ÚNICAS citáveis no campo `fontes` dos trades.",
    "Nunca invente fonte fora desta lista.",
    "Os números da pesquisa servem para narrativa. `quant_claims` continua saindo só do snapshot:",
    "valor externo em quant_claims é reprovado pelo cross-check.",
    "Fontes marcadas CONTEXTO ou SEM-DATA estão fora da janela de 24h: trate como contexto,",
    "declare como contexto, nunca como fato do dia.",
    "",
    "FONTES:",
    p.fontes,
    "",
    "ANÁLISE ESTRUTURADA (JSON):",
    p.analise,
  ].join("\n");
}

export interface RunStrategistInput {
  snapshot: MarketSnapshot;
  apiKey: string;
  model: string;
  runId: string;
  fetchFn?: typeof fetch;
  /** injeta resposta (testes offline) */
  mockContent?: string;
  /** @deprecated Apelido de `provedor: "deepseek"`. */
  deepseekApi?: boolean;
  /** Provedor da chamada. Ausente = derivado de `deepseekApi`, que por sua vez cai em OpenRouter. */
  provedor?: Provedor;
  /** contexto das etapas 1 e 2 (research + analyst). Ausente = rodada closed-book pura. */
  pesquisa?: PesquisaContexto;
  /** Esforço de raciocínio pedido ao provedor (`reasoning.effort` no OpenRouter). */
  reasoningEffort?: string;
  /**
   * Teto de max_tokens da chamada. Default `STRATEGIST_MAX_TOKENS_PADRAO` (8000).
   * O 402 de reserva do OpenRouter gera UM retry automatico com teto menor derivado
   * do N do corpo; este campo so define o teto da primeira chamada.
   */
  maxTokens?: number;
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
  const provedor = resolverProvedor(input);
  // Structured Output estrito so no OpenRouter. Sem contrato de estrutura vindo do provedor, o
  // modelo se apoiava no exemplo do prompt, que era justamente o que ele copiava. Mandar o schema
  // no texto do system prompt devolve a referencia de forma sem devolver a de conteudo.
  const estrito = aceitaJsonSchemaEstrito(provedor);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildStrategistSystemPrompt({ incluirSchema: !estrito }),
    },
    {
      role: "user",
      content:
        buildStrategistUserPrompt(input.snapshot) +
        (input.pesquisa ? buildPesquisaBlock(input.pesquisa) : ""),
    },
  ];
  const provenance: Provenance = {
    run_id: input.runId,
    model: input.model,
    prompt_version: PROMPT_VERSION,
    generated_at: new Date().toISOString(),
  };

  const chamarModelo = async (): Promise<string> =>
    (
      await chatCompletion({
        apiKey: input.apiKey,
        model: input.model,
        responseFormatJson: !estrito,
        responseFormatJsonSchema: estrito
          ? {
              name: "MorningCallStrategist",
              schema: buildStrategistJsonSchema(),
              strict: true,
            }
          : undefined,
        maxTokens: input.maxTokens ?? STRATEGIST_MAX_TOKENS_PADRAO,
        provedor,
        ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
        messages,
        fetchFn: input.fetchFn,
      })
    ).content;

  let content = input.mockContent ?? (await chamarModelo());

  /**
   * Correção guiada pelo validador. Medido em 22/09/2026, na primeira corrida contra a API da
   * OpenAI: o modelo devolveu níveis internamente incoerentes (`alvo_2` mais perto que `alvo_1`,
   * `invalidacao` do lado errado) e o Zod reprovou. Enunciar as regras no prompt resolveu parte,
   * não tudo, e insistir só no texto do prompt é aposta na obediência do fornecedor da vez.
   *
   * O validador já produz a lista exata do que está errado, com caminho e motivo. Devolver essa
   * lista ao modelo é mais barato e mais confiável que reescrever o prompt: uma chamada a mais
   * custa centavos, uma rodada reprovada custa o dia sem Morning Call. O laço é limitado, e o erro
   * da última tentativa é o que sobe, para não mascarar a causa.
   */
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      const raw = parseStrategistContent(content);
      const trades = sealStrategistTrades(raw, provenance);
      return {
        raw,
        claims: raw.quant_claims,
        trades,
        provenance,
        model: input.model,
        echo: detectPromptEcho(raw),
      };
    } catch (err) {
      // Só erro de validação tem o que corrigir. Falha de rede ou de JSON bruto sobe na hora.
      const problemas = problemasDeValidacao(err);
      if (problemas.length === 0 || tentativa > MAX_TENTATIVAS_CORRECAO || input.mockContent) {
        throw err;
      }
      // Evento estruturado de execução normal, não debug: é o rastro de quantas correções a rodada
      // custou. Mesma decisão de `openrouter_billing_retry`.
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          event: "strategist_correcao",
          runId: input.runId,
          tentativa,
          problemas: problemas.length,
          model: input.model,
        }),
      );
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: buildCorrecaoPrompt(problemas) });
      content = await chamarModelo();
    }
  }
}
