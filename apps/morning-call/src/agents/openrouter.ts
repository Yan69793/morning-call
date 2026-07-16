/**
 * Cliente OpenRouter mínimo. Timeout + erro tipado. Sem log de key.
 */
import { z } from "zod";

/**
 * A resposta do provedor é entrada não confiável como qualquer outra: vem da rede, muda sem aviso
 * e não tem contrato conosco. `res.json()` devolve `unknown`, e o código lia `json.choices[0]...`
 * direto — se o formato mudasse, o erro apareceria como `undefined` lá na frente, longe da causa.
 * Validar aqui faz a falha aparecer na fronteira, com o nome do campo que faltou.
 */
const OpenRouterResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  model: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
  /** Se true, usa api.deepseek.com em vez de OpenRouter (requer DEEPSEEK_API_KEY) */
  deepseekApi?: boolean;
}

export interface OpenRouterResult {
  content: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
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

export async function chatCompletion(opts: OpenRouterOptions): Promise<OpenRouterResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isDeepSeek = opts.deepseekApi === true;
  const apiUrl = isDeepSeek
    ? "https://api.deepseek.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  try {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 4096,
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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
    if (!isDeepSeek) {
      headers["HTTP-Referer"] = "https://vixradar.com";
      headers["X-Title"] = "morning-call";
    }
    const res = await fetchFn(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const prefix = isDeepSeek ? "DeepSeek" : "OpenRouter";
      throw new OpenRouterError(`${prefix} HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
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
    const content = json.choices[0]!.message.content;
    if (!content) throw new OpenRouterError("OpenRouter: content vazio");
    return {
      content,
      model: json.model ?? opts.model,
      tokensIn: json.usage?.prompt_tokens,
      tokensOut: json.usage?.completion_tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
