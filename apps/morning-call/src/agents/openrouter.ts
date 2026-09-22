/**
 * Cliente OpenRouter mínimo. Timeout + erro tipado. Sem log de key.
 */
import { z } from "zod";

/**
 * Provenance da pesquisa web. O OpenRouter devolve as fontes em
 * `choices[].message.annotations[]`, cada uma no formato
 * `{type:"url_citation", url_citation:{url, title, content?, start_index?, end_index?}}`.
 *
 * Antes de 10/09/2026 o contrato declarava só `message.content`, e o Zod (que descarta chave
 * desconhecida por padrão) jogava fora toda a proveniência: a cadeia de research chegava no
 * estrategista sem uma única URL verificável. `catchall` preserva qualquer campo extra que o
 * provedor venha a mandar — provenance perdida é silenciosa e irreversível.
 */
export const UrlCitation = z
  .object({
    url: z.string().min(1),
    title: z.string().optional(),
    content: z.string().optional(),
    start_index: z.number().optional(),
    end_index: z.number().optional(),
  })
  .catchall(z.unknown());
export type UrlCitation = z.infer<typeof UrlCitation>;

export const MessageAnnotation = z
  .object({
    type: z.string().optional(),
    url_citation: UrlCitation.optional(),
  })
  .catchall(z.unknown());
export type MessageAnnotation = z.infer<typeof MessageAnnotation>;

export interface CitationProvenance {
  url: string;
  title: string;
  /** hostname sem `www.`, ou "?" quando a URL não é parseável. */
  dominio: string;
  /** Snippet devolvido pelo provedor, quando houver. */
  conteudo?: string;
}

/**
 * A resposta do provedor é entrada não confiável como qualquer outra: vem da rede, muda sem aviso
 * e não tem contrato conosco. `res.json()` devolve `unknown`, e o código lia `json.choices[0]...`
 * direto — se o formato mudasse, o erro apareceria como `undefined` lá na frente, longe da causa.
 * Validar aqui faz a falha aparecer na fronteira, com o nome do campo que faltou.
 */
const OpenRouterResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
          annotations: z.array(MessageAnnotation).optional(),
          /** Formato legado: lista de URLs soltas, sem título. */
          citations: z.array(z.string()).optional(),
        }),
      }),
    )
    .min(1),
  model: z.string().optional(),
  provider: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      completion_tokens_details: z.object({ reasoning_tokens: z.number().optional() }).optional(),
    })
    .optional(),
});

export function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "?";
  }
}

/**
 * Normaliza as duas formas que o provedor usa em uma lista única de proveniência.
 * Anotações estruturadas têm precedência; `citations` legado só entra quando não há nenhuma.
 */
export function extrairCitacoes(message: {
  annotations?: MessageAnnotation[];
  citations?: string[];
}): CitationProvenance[] {
  const anotacoes = message.annotations ?? [];
  const daAnotacao = anotacoes
    .map((a) => a.url_citation)
    .filter((c): c is UrlCitation => Boolean(c?.url))
    .map((c) => ({
      url: c.url,
      title: c.title ?? "",
      dominio: dominioDe(c.url),
      conteudo: c.content,
    }));
  if (daAnotacao.length > 0) return daAnotacao;

  return (message.citations ?? []).map((url) => ({
    url,
    title: "",
    dominio: dominioDe(url),
  }));
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Provedor por tras do mesmo contrato de chat completion. Os tres falam o dialeto OpenAI
 * (`choices[].message.content`), entao o que muda entre eles e a URL, os cabecalhos e duas
 * capacidades: plugin de busca web (so o OpenRouter) e Structured Output estrito.
 *
 * `openai` entrou em 22/09/2026. O Worker morria desde 08/09 porque a cota da chave do OpenRouter
 * acaba antes do fim da semana, e a chave do OpenRouter e a mesma que o pipeline do
 * briefing-interno consome todo dia as 07h00.
 */
export type Provedor = "openrouter" | "deepseek" | "openai";

const URL_POR_PROVEDOR: Record<Provedor, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

/** Rotulo do provedor nas mensagens de erro. Sem ele, um 401 da OpenAI apareceria como OpenRouter. */
const ROTULO_POR_PROVEDOR: Record<Provedor, string> = {
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  openai: "OpenAI",
};

/**
 * Resolve o provedor a partir dos campos aceitos. `deepseekApi` sobrevive como apelido do que ja
 * existia antes do tipo `Provedor`; sem isto, todo chamador antigo teria de mudar junto.
 */
export function resolverProvedor(opts: { provedor?: Provedor; deepseekApi?: boolean }): Provedor {
  if (opts.provedor !== undefined) return opts.provedor;
  return opts.deepseekApi === true ? "deepseek" : "openrouter";
}

/**
 * `response_format` no formato estrito (`json_schema`) exige um schema que satisfaca a regra do
 * provedor, com `additionalProperties: false` em todo objeto e todo campo em `required`. O
 * `buildStrategistJsonSchema` nao e assim, e e assim de proposito (ver o comentario dele). OpenAI e
 * DeepSeek, portanto, recebem `json_object` simples e o schema vai no texto do system prompt.
 */
export function aceitaJsonSchemaEstrito(provedor: Provedor): boolean {
  return provedor === "openrouter";
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /** JSON schema hint — provedor pode ignorar; parseamos do nosso lado */
  responseFormatJson?: boolean;
  /** Structured Output: passa o JSON Schema exato para o modelo aderir */
  responseFormatJsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean };
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  maxTokens?: number;
  /** Provedor da chamada. Ausente = `openrouter`. */
  provedor?: Provedor;
  /** @deprecated Apelido de `provedor: "deepseek"`. Mantido para nao quebrar chamador antigo. */
  deepseekApi?: boolean;
  /**
   * Plugins do OpenRouter. A pesquisa web entra aqui:
   * `[{ id: "web", max_results: 10 }]`. Só o OpenRouter aceita plugins — com `deepseekApi`
   * ligado a chamada vai para api.deepseek.com e este campo não tem efeito.
   */
  plugins?: Record<string, unknown>[];
  /**
   * Controle de raciocínio do provedor. OpenRouter aceita
   * `{ effort: "none" | "minimal" | "low" | "medium" | "high" }`. Sem isso, modelo de raciocínio
   * gasta o teto de `max_tokens` pensando e devolve corpo curto ou truncado — foi o que aconteceu
   * com o analyst na medição de 10/09 (6000 tokens de teto, 5782 de raciocínio, 2 fatos).
   */
  reasoning?: Record<string, unknown>;
}

export interface OpenRouterResult {
  content: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  /**
   * Tokens gastos em raciocínio. Consome `max_tokens` e não aparece no `content`: com teto baixo,
   * o modelo devolve corpo vazio depois de gastar tudo pensando (medido no benchmark de 10/09).
   */
  reasoningTokens?: number;
  /** Proveniência da pesquisa. Vazio quando não houve plugin de web search. */
  citations: CitationProvenance[];
  /** Anotações cruas do provedor, preservadas para auditoria. */
  annotations: MessageAnnotation[];
}

/**
 * Teto de tokens que o OpenRouter informa num 402 de pré-autorização. O provedor
 * pré-autoriza o custo de `max_tokens` antes de chamar o modelo e devolve o orçamento
 * real no corpo: "You requested up to N tokens, but can only afford M" — M é o dado
 * que diz exatamente quanto ainda dá para pagar. Mesma semântica do pipeline Python
 * (MARGEM_TOKENS_402/MIN_TOKENS_402 em briefing-interno/scripts/gerar_briefing.py,
 * portada em 17/09/2026 porque a produção do Morning Call morria no strategist com
 * 402 desde 08/09 sem nunca usar esse número).
 */
const N_402_RE = /can only afford\s+(\d+)/;
/** Folga sobre o N para o teto do retry não esbarrar no limite no instante seguinte. */
export const MARGEM_TOKENS_402 = 50;
/** Abaixo disso o retry não vale a chamada: resposta truncada. */
export const MIN_TOKENS_402 = 64;

/**
 * Extrai o N de "can only afford N" do corpo COMPLETO do 402. A mensagem de erro
 * trunca em 200 chars e o número pode cair fora (16/09: 16000/9517; 17/09: 8000/2916).
 */
export function extrairAffordDoCorpo(text: string): number | undefined {
  const m = N_402_RE.exec(text);
  if (!m || !m[1]) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/**
 * HTTP 402 do OpenRouter (crédito/cota insuficiente). Carrega o `afford` (N de
 * "can only afford N" no corpo, em tokens) quando o provedor informa. Sem N não
 * há retry reduzido: não se inventa valor.
 */
export class OpenRouterBillingError extends OpenRouterError {
  constructor(
    message: string,
    readonly afford?: number,
  ) {
    super(message, 402);
    this.name = "OpenRouterBillingError";
  }
}

export async function chatCompletion(opts: OpenRouterOptions): Promise<OpenRouterResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const provedor = resolverProvedor(opts);
  const apiUrl = URL_POR_PROVEDOR[provedor];
  const prefix = ROTULO_POR_PROVEDOR[provedor];
  try {
    const montarBody = (maxTokens: number): Record<string, unknown> => {
      // Nome do teto de tokens muda por provedor, e isso foi medido, nao suposto. Sonda de
      // 22/09/2026 contra api.openai.com, doze modelos, quatro testes cada: a familia gpt-5.x e
      // gpt-6 recusa `max_tokens` com "Unsupported parameter ... Use 'max_completion_tokens'
      // instead", e aceita `max_completion_tokens`. O `gpt-4.1-mini`, mais antigo, aceita os dois.
      // Ou seja, `max_completion_tokens` e o unico nome que serve para a OpenAI inteira, e
      // `max_tokens` e o nome que OpenRouter e DeepSeek conhecem.
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: opts.messages,
        [provedor === "openai" ? "max_completion_tokens" : "max_tokens"]: maxTokens,
      };
      if (opts.responseFormatJsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: opts.responseFormatJsonSchema.name,
            schema: opts.responseFormatJsonSchema.schema,
            strict: opts.responseFormatJsonSchema.strict ?? true,
          },
        };
      } else if (opts.responseFormatJson) {
        body.response_format = { type: "json_object" };
      }
      // `plugins` e campo do corpo do OpenRouter. Mandar para OpenAI ou DeepSeek nao e inofensivo,
      // e parametro desconhecido e vira 400.
      if (opts.plugins && opts.plugins.length > 0 && provedor === "openrouter") {
        body.plugins = opts.plugins;
      }
      // `reasoning` e campo do corpo do OpenRouter. A OpenAI usa outro nome, `reasoning_effort`, e
      // com valores diferentes (`none` nao existe la). Mandar o campo errado nao e inofensivo,
      // parametro desconhecido vira 400, entao o controle de raciocinio simplesmente nao vai para
      // a OpenAI. Custo maior e melhor que corrida reprovada por campo invalido.
      if (opts.reasoning && provedor === "openrouter") {
        body.reasoning = opts.reasoning;
      }
      return body;
    };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
    // Cabecalho de atribuicao do OpenRouter. Nao vai para os outros provedores: eles nao usam e
    // nao ha por que anunciar o produto de terceiro na requisicao alheia.
    if (provedor === "openrouter") {
      headers["HTTP-Referer"] = "https://vixradar.com";
      headers["X-Title"] = "morning-call";
    }
    const enviar = (maxTokens: number): Promise<Response> =>
      fetchFn(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(montarBody(maxTokens)),
        signal: controller.signal,
      });

    let res = await enviar(opts.maxTokens ?? 4096);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 402 de reserva de credito e tratado so no caminho OpenRouter: nem api.deepseek.com nem
      // api.openai.com tem a pre-autorizacao de max_tokens, entao nenhum dos dois informa o N.
      // A cota da OpenAI se esgota em 429 `insufficient_quota`, que e outro contrato e cai no erro
      // comum abaixo, sem retry inventado.
      if (provedor === "openrouter" && res.status === 402) {
        const afford = extrairAffordDoCorpo(text);
        const mensagem = `${prefix} HTTP ${res.status}: ${text.slice(0, 200)}`;
        const reduzido = afford === undefined ? undefined : afford - MARGEM_TOKENS_402;
        // Sem N no corpo não há retry: nunca se inventa valor de teto.
        if (reduzido !== undefined && reduzido >= MIN_TOKENS_402) {
          // Log estruturado é observabilidade do Worker (sai no `wrangler tail`), mesmo
          // motivo da allowlist do eslint.config.js para workflow.ts; este arquivo não
          // está nela, daí o disable local. Evento de execução normal, não debug.
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({
              event: "openrouter_billing_retry",
              model: opts.model,
              afford,
              maxTokensAnterior: opts.maxTokens ?? 4096,
              maxTokensNovo: reduzido,
            }),
          );
          res = await enviar(reduzido);
          if (!res.ok) {
            const textoRetry = await res.text().catch(() => "");
            const affordRetry = extrairAffordDoCorpo(textoRetry);
            // O 402 do retry pode vir com corpo diferente (medido em 15/09 no pipeline
            // Python): o N já conhecido é preservado em vez de sobrescrito com undefined.
            const affordPreservado = affordRetry ?? afford;
            if (res.status === 402) {
              // Mesma exceção do log de retry: evento estruturado de esgotamento de
              // crédito, observabilidade do operador no `wrangler tail`.
              // eslint-disable-next-line no-console
              console.log(
                JSON.stringify({
                  event: "openrouter_billing_exhausted",
                  model: opts.model,
                  afford: affordPreservado,
                }),
              );
              throw new OpenRouterBillingError(
                `${prefix} HTTP ${res.status}: ${textoRetry.slice(0, 200)}`,
                affordPreservado,
              );
            }
            // Retry morreu por outra razão (rede, 5xx): erro comum, sem rótulo de billing.
            throw new OpenRouterError(
              `${prefix} HTTP ${res.status}: ${textoRetry.slice(0, 200)}`,
              res.status,
            );
          }
        } else {
          // 402 sem N (ou N abaixo do mínimo): esgotamento sem retry, evento estruturado
          // para o operador. Mesma exceção do log de retry acima.
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({
              event: "openrouter_billing_exhausted",
              model: opts.model,
              ...(afford === undefined ? {} : { afford }),
            }),
          );
          throw new OpenRouterBillingError(mensagem, afford);
        }
      } else {
        throw new OpenRouterError(`${prefix} HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
      }
    }
    const parsed = OpenRouterResponse.safeParse(await res.json());
    if (!parsed.success) {
      throw new OpenRouterError(
        `OpenRouter: resposta fora do contrato — ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    const json = parsed.data;
    const message = json.choices[0]!.message;
    const content = message.content;
    const citations = extrairCitacoes(message);
    // Corpo vazio só é falha quando não veio proveniência junto: com web search, um turno pode
    // terminar sem texto e ainda assim trazer as citações (medido no benchmark de 10/09, testes
    // B e C). Descartar isso por causa do `content` vazio jogaria fora a pesquisa inteira.
    if (!content && citations.length === 0) {
      throw new OpenRouterError("OpenRouter: content vazio");
    }
    return {
      content,
      model: json.model ?? opts.model,
      tokensIn: json.usage?.prompt_tokens,
      tokensOut: json.usage?.completion_tokens,
      reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
      citations,
      annotations: message.annotations ?? [],
    };
  } finally {
    clearTimeout(timer);
  }
}
