/**
 * Transporte local do Morning Call: responde chamada de chat completion executando o Codex CLI.
 *
 * Por que existe. O Worker fecha a cadeia chamando o OpenRouter por HTTP e morreu em 08/09/2026
 * por cota da chave (402, "can only afford N"). A assinatura do Codex nao e uma API, entao nao
 * existe endpoint para o Worker chamar. O caminho e rodar a cadeia na maquina e usar o CLI como
 * se fosse o provedor.
 *
 * Por que isto cabe sem mexer nos agentes. `runResearch`, `runAnalyst`, `runStrategist` e
 * `runCalendarAgent` ja aceitam `fetchFn` injetado, gancho que os testes usam. O transporte entra
 * exatamente ali, e o resto continua sendo o mesmo codigo que roda em producao: os prompts de
 * `src/agents/`, os schemas Zod, a deteccao de eco, a classificacao de proveniencia.
 *
 * Este arquivo e puro de proposito: nada de `node:*`, nada de processo, nada de disco. A execucao
 * do binario entra por `CodexExecFn`, implementada em `scripts/local/`. Sem isso o arquivo nao
 * poderia ser testado no projeto do Worker, que tem `types: ["@cloudflare/workers-types"]` e por
 * decisao explicita nao enxerga os tipos de Node.
 *
 * Contrato do CLI, medido em 22/09/2026 (codex-cli 0.155.1, login ChatGPT):
 * - `codex exec` roda sem interacao, exit 0, e `--json` imprime eventos em JSONL no stdout.
 * - `--output-schema <arquivo>` faz o CLI devolver JSON aderente ao schema. Equivale ao
 *   `response_format: json_schema` do OpenRouter, ou seja, substitui o `responseFormatJsonSchema`.
 * - `turn.completed` carrega `usage` com `input_tokens` e `output_tokens`.
 * - `item.completed` com `item.type == "agent_message"` e o texto, `"web_search"` marca busca e
 *   `"error"` marca reclamacao do proprio CLI.
 *
 * Duas diferencas de contrato que o chamador precisa saber, registradas em vez de escondidas:
 *
 * 1. Proveniencia. O plugin `web` do OpenRouter devolve as fontes em `message.annotations[]`,
 *    dado estruturado do provedor. O Codex nao devolve fonte estruturada, so o texto da resposta
 *    e a query usada. As citacoes saem por regex de link markdown do proprio texto, o que e
 *    evidencia mais fraca: a URL foi escrita pelo modelo, nao confirmada pelo buscador. Quem
 *    consome ja trata isso como entrada nao confiavel, mas a diferenca fica dita.
 * 2. Custo por chamada. O CLI carrega o contexto proprio dele antes do prompt. Medido em
 *    22/09/2026: 25.110 tokens de entrada para uma resposta de seis tokens. O peso esta no
 *    contexto do CLI, nao no prompt do Morning Call.
 */
import {
  OpenRouterError,
  type ChatMessage,
  type MessageAnnotation,
} from "./openrouter.js";

export interface CodexUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

export interface CodexEventos {
  usage?: CodexUsage;
  /** Ultimo `agent_message` do stream. */
  ultimaMensagem?: string;
  /** Mensagens de `error` do CLI, em ordem. Vazio = o CLI nao reclamou. */
  erros: string[];
  /** Queries de `web_search`, em ordem. Vazio = nao houve busca. */
  buscas: string[];
}

/** O que o transporte pede ao executor. Sem caminho de arquivo: quem monta e o executor. */
export interface CodexExecRequest {
  /** Instrucoes completas do agente, ja concatenadas. Vai por stdin. */
  prompt: string;
  /** JSON Schema do `--output-schema`. Ausente = sem structured output. */
  schema?: Record<string, unknown>;
  /** Modelo do `-m`. Ausente = default da conta autenticada. */
  modelo?: string;
}

export interface CodexExecOptions {
  /** Diretorio de trabalho do CLI. */
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface CodexExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** true quando o teto de tempo estourou e o processo foi morto. */
  timedOut: boolean;
  /**
   * Conteudo do arquivo do `-o`, quando o executor o materializa. Tem precedencia sobre o
   * `agent_message` do stream porque e o campo que o CLI documenta como "ultima mensagem".
   */
  ultimaMensagem?: string;
}

/** Injetavel: o executor real roda o binario, o fake devolve JSONL pre-gravado. */
export type CodexExecFn = (
  req: CodexExecRequest,
  opts: CodexExecOptions,
) => Promise<CodexExecResult>;

function numeroOuUndefined(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

function objetoOuNull(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : null;
}

/**
 * Le o JSONL do `--json`. Linha ilegivel e ignorada de proposito: o CLI tambem escreve aviso de
 * skill e ruido de inicializacao no mesmo descritor, e abortar por isso seria fragil demais. O
 * desfecho quem decide e o exit code e o arquivo do `-o`.
 */
export function lerEventosCodex(stdout: string): CodexEventos {
  const eventos: CodexEventos = { erros: [], buscas: [] };
  for (const linha of stdout.split(/\r?\n/)) {
    const texto = linha.trim();
    if (texto.length === 0) continue;
    let cru: unknown;
    try {
      cru = JSON.parse(texto);
    } catch {
      continue;
    }
    const ev = objetoOuNull(cru);
    if (!ev) continue;
    if (ev.type === "turn.completed") {
      const uso = objetoOuNull(ev.usage);
      if (uso) {
        eventos.usage = {
          inputTokens: numeroOuUndefined(uso.input_tokens),
          cachedInputTokens: numeroOuUndefined(uso.cached_input_tokens),
          outputTokens: numeroOuUndefined(uso.output_tokens),
          reasoningTokens: numeroOuUndefined(uso.reasoning_output_tokens),
        };
      }
    } else if (ev.type === "item.completed") {
      const item = objetoOuNull(ev.item);
      if (!item) continue;
      if (item.type === "agent_message" && typeof item.text === "string") {
        eventos.ultimaMensagem = item.text;
      } else if (item.type === "error" && typeof item.message === "string") {
        eventos.erros.push(item.message);
      } else if (item.type === "web_search" && typeof item.query === "string") {
        eventos.buscas.push(item.query);
      }
    } else if (ev.type === "turn.failed" || ev.type === "error") {
      const erro = objetoOuNull(ev.error);
      const mensagem = typeof ev.message === "string" ? ev.message : erro?.message;
      if (typeof mensagem === "string") eventos.erros.push(mensagem);
    }
  }
  return eventos;
}

const LINK_MARKDOWN = /\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * Extrai citacoes dos links markdown do texto. Ver a diferenca 1 no cabecalho: e o modelo que
 * escreveu a URL, nao o buscador que a confirmou. Devolve no formato de anotacao do OpenRouter
 * para o resto da cadeia nao precisar saber de onde veio.
 */
export function extrairCitacoesDoTexto(texto: string): MessageAnnotation[] {
  const vistos = new Set<string>();
  const anotacoes: MessageAnnotation[] = [];
  for (const casamento of texto.matchAll(LINK_MARKDOWN)) {
    const url = casamento[2];
    if (url === undefined || vistos.has(url)) continue;
    vistos.add(url);
    anotacoes.push({ type: "url_citation", url_citation: { url, title: casamento[1] ?? "" } });
  }
  return anotacoes;
}

/** Junta as mensagens do chat num prompt unico, que e a entrada do CLI. */
export function montarPrompt(messages: readonly ChatMessage[]): string {
  const blocos: string[] = [];
  const sistema = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  if (sistema.length > 0) blocos.push(sistema);
  for (const m of messages) {
    if (m.role === "system") continue;
    blocos.push(m.role === "assistant" ? `RESPOSTA ANTERIOR:\n${m.content}` : m.content);
  }
  return blocos.join("\n\n");
}

interface CorpoRequisicao {
  messages: ChatMessage[];
  model?: string;
  schema?: Record<string, unknown>;
}

const FORA_DO_CONTRATO = "codex-cli: corpo da requisicao fora do contrato";

function lerCorpo(cru: unknown): CorpoRequisicao {
  const obj = objetoOuNull(cru);
  if (!obj) throw new OpenRouterError(`${FORA_DO_CONTRATO} (nao e objeto)`);
  if (!Array.isArray(obj.messages)) throw new OpenRouterError(`${FORA_DO_CONTRATO} (sem messages)`);
  const messages: ChatMessage[] = [];
  for (const m of obj.messages) {
    const msg = objetoOuNull(m);
    if (!msg) throw new OpenRouterError(`${FORA_DO_CONTRATO} (mensagem nao e objeto)`);
    const role = msg.role;
    const content = msg.content;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new OpenRouterError(`${FORA_DO_CONTRATO} (role desconhecido: ${String(role)})`);
    }
    if (typeof content !== "string") {
      throw new OpenRouterError(`${FORA_DO_CONTRATO} (content nao e texto)`);
    }
    messages.push({ role, content });
  }
  const rf = objetoOuNull(obj.response_format);
  const js = rf ? objetoOuNull(rf.json_schema) : null;
  const schema = js ? objetoOuNull(js.schema) : null;
  return {
    messages,
    ...(typeof obj.model === "string" ? { model: obj.model } : {}),
    ...(schema ? { schema } : {}),
  };
}

function textoDoCorpo(init: RequestInit | undefined): string {
  const corpo = init?.body;
  if (typeof corpo === "string") return corpo;
  throw new OpenRouterError("codex-cli: corpo da requisicao precisa ser string JSON");
}

/**
 * Le a URL da entrada sem depender de `RequestInfo`, que existe no projeto do Worker
 * (`@cloudflare/workers-types`) e nao no projeto de `scripts/` (`types: ["node"]`). Os agentes
 * chamam sempre com string, entao a forma larga aqui e largura defensiva, nao necessidade.
 */
function urlDaEntrada(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input !== null && "url" in input) {
    // O `in` ja estreita `unknown`, entao `input.url` e legivel sem assercao.
    const url = input.url;
    if (typeof url === "string") return url;
  }
  throw new OpenRouterError("codex-cli: entrada do fetch sem URL legivel");
}

export interface CodexTransportOptions {
  /** Diretorio de trabalho do CLI. */
  cwd: string;
  /** Modelo do `-m`. Ausente = default da conta autenticada. */
  modelo?: string;
  timeoutMs?: number;
  /** Obrigatorio: o executor do binario. Ver `scripts/local/executar-codex.ts`. */
  executar: CodexExecFn;
  /** Observabilidade de cada chamada. O modulo nao loga por conta propria. */
  aoChamar?: (info: {
    promptChars: number;
    temSchema: boolean;
    buscas: string[];
    usage?: CodexUsage;
  }) => void;
}

/**
 * Devolve um `fetch` que responde `POST` de chat completion executando o Codex CLI. E o unico
 * ponto onde a cadeia local diverge da producao.
 */
export function criarFetchCodex(opts: CodexTransportOptions): typeof fetch {
  const timeoutMs = opts.timeoutMs ?? 300_000;

  // O parametro e `unknown` porque `RequestInfo` so existe no projeto do Worker. O tipo devolvido
  // continua sendo `typeof fetch`, que e o que os agentes esperam; a conversao fica aqui, num
  // ponto unico, e nao espalhada pela cadeia.
  const implementacao = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = urlDaEntrada(input);
    const corpo = lerCorpo(JSON.parse(textoDoCorpo(init)) as unknown);
    const prompt = montarPrompt(corpo.messages);

    const resultado = await opts.executar(
      {
        prompt,
        ...(corpo.schema ? { schema: corpo.schema } : {}),
        ...(opts.modelo === undefined ? {} : { modelo: opts.modelo }),
      },
      {
        cwd: opts.cwd,
        timeoutMs,
        ...(init?.signal ? { signal: init.signal } : {}),
      },
    );

    const eventos = lerEventosCodex(resultado.stdout);
    if (resultado.timedOut) {
      throw new OpenRouterError(`codex-cli: timeout de ${timeoutMs}ms em ${url}`);
    }
    if (resultado.exitCode !== 0) {
      const detalhe = (resultado.stderr || resultado.stdout).slice(-400);
      throw new OpenRouterError(
        `codex-cli: exit ${String(resultado.exitCode)} em ${url}: ${detalhe}`,
      );
    }
    const conteudo = (resultado.ultimaMensagem ?? eventos.ultimaMensagem ?? "").trim();
    if (conteudo.length === 0) {
      const motivo = eventos.erros.length > 0 ? ` (${eventos.erros.join(" / ")})` : "";
      throw new OpenRouterError(`codex-cli: resposta vazia${motivo}`);
    }

    const anotacoes = extrairCitacoesDoTexto(conteudo);
    opts.aoChamar?.({
      promptChars: prompt.length,
      temSchema: corpo.schema !== undefined,
      buscas: eventos.buscas,
      ...(eventos.usage ? { usage: eventos.usage } : {}),
    });

    const resposta = {
      choices: [
        {
          message: {
            content: conteudo,
            ...(anotacoes.length > 0 ? { annotations: anotacoes } : {}),
          },
        },
      ],
      // O CLI nao informa o modelo no stream. Reportar um id inventado seria pior que reportar a
      // verdade: ou e o modelo pedido em `-m`, ou e o rotulo do transporte.
      model: opts.modelo ?? "codex-cli",
      usage: {
        ...(eventos.usage?.inputTokens === undefined
          ? {}
          : { prompt_tokens: eventos.usage.inputTokens }),
        ...(eventos.usage?.outputTokens === undefined
          ? {}
          : { completion_tokens: eventos.usage.outputTokens }),
        ...(eventos.usage?.reasoningTokens === undefined
          ? {}
          : { completion_tokens_details: { reasoning_tokens: eventos.usage.reasoningTokens } }),
      },
    };
    return new Response(JSON.stringify(resposta), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Sem assercao: um parametro `unknown` e aceito onde se espera `RequestInfo | URL`, porque
  // `unknown` e mais largo que a entrada. O retorno `Promise<Response>` casa com o contrato.
  return implementacao;
}
