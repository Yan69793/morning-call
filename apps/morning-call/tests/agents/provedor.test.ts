/**
 * Provedor da cadeia de LLM: resolucao da chave e do corpo da requisicao por provedor.
 *
 * O que este arquivo protege. `resolverCadeiaLlm` decide, pelo ambiente, para onde a corrida das
 * 06h30 vai. Foi a ausencia dessa decisao num lugar unico que produziu o incidente de 09/09, quando
 * `DEEPSEEK_API_KEY` presente arrastou o research junto para um provedor sem busca web.
 */
import { describe, expect, it } from "vitest";
import {
  aceitaJsonSchemaEstrito,
  chatCompletion,
  resolverProvedor,
} from "../../src/agents/openrouter.js";
import { resolverCadeiaLlm } from "../../src/workflow.js";
import type { Env } from "../../src/env.js";

type RespostaFake = { status: number; body: string };
type Chamada = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fetchFake(respostas: RespostaFake[]): { fetchFn: typeof fetch; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  let i = 0;
  const fetchFn = (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const cru = init?.body;
    if (typeof cru !== "string") throw new Error("fake espera corpo como string JSON");
    const body = JSON.parse(cru) as Record<string, unknown>;
    chamadas.push({ url, headers, body });
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (!r) throw new Error("sem resposta fake configurada");
    return Promise.resolve(
      new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json" } }),
    );
  };
  return { fetchFn, chamadas };
}

const OK = JSON.stringify({ choices: [{ message: { content: "ok" } }], model: "m" });
const ERRO_402 = JSON.stringify({ error: { message: "can only afford 900" } });

describe("resolverProvedor", () => {
  it("cai em openrouter quando nada e dito", () => {
    expect(resolverProvedor({})).toBe("openrouter");
  });

  it("mantem o apelido deepseekApi vivo", () => {
    expect(resolverProvedor({ deepseekApi: true })).toBe("deepseek");
    expect(resolverProvedor({ deepseekApi: false })).toBe("openrouter");
  });

  it("provedor explicito vence o apelido", () => {
    expect(resolverProvedor({ provedor: "openai", deepseekApi: true })).toBe("openai");
  });
});

describe("aceitaJsonSchemaEstrito", () => {
  it("so o OpenRouter recebe json_schema estrito", () => {
    expect(aceitaJsonSchemaEstrito("openrouter")).toBe(true);
    expect(aceitaJsonSchemaEstrito("openai")).toBe(false);
    expect(aceitaJsonSchemaEstrito("deepseek")).toBe(false);
  });
});

describe("chatCompletion por provedor", () => {
  it("openai vai para api.openai.com, sem cabecalho de atribuicao do OpenRouter", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "gpt-x",
      provedor: "openai",
      messages: [{ role: "user", content: "oi" }],
      fetchFn,
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(chamadas[0]?.headers["HTTP-Referer"]).toBeUndefined();
    expect(chamadas[0]?.headers["X-Title"]).toBeUndefined();
    expect(chamadas[0]?.headers["Authorization"]).toBe("Bearer k");
  });

  it("nao repete a chamada no 402 da OpenAI, porque nao ha N de reserva para usar", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 402, body: ERRO_402 }]);
    await expect(
      chatCompletion({
        apiKey: "k",
        model: "gpt-x",
        provedor: "openai",
        messages: [{ role: "user", content: "oi" }],
        fetchFn,
      }),
    ).rejects.toThrow(/OpenAI HTTP 402/);
    expect(chamadas).toHaveLength(1);
  });

  it("openrouter continua com um retry unico no 402", async () => {
    const { fetchFn, chamadas } = fetchFake([
      { status: 402, body: ERRO_402 },
      { status: 200, body: OK },
    ]);
    const r = await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "oi" }],
      fetchFn,
    });
    expect(r.content).toBe("ok");
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]?.body.max_tokens).toBe(850);
  });

  it("nao manda plugin de busca para quem nao e OpenRouter", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "gpt-x",
      provedor: "openai",
      messages: [{ role: "user", content: "oi" }],
      plugins: [{ id: "web", max_results: 5 }],
      fetchFn,
    });
    expect(chamadas[0]?.body.plugins).toBeUndefined();
  });

  it("manda plugin de busca no OpenRouter", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "oi" }],
      plugins: [{ id: "web", max_results: 5 }],
      fetchFn,
    });
    expect(chamadas[0]?.body.plugins).toEqual([{ id: "web", max_results: 5 }]);
  });

  it("erro da OpenAI aparece rotulado como OpenAI, nao como OpenRouter", async () => {
    const { fetchFn } = fetchFake([{ status: 401, body: JSON.stringify({ error: "nope" }) }]);
    await expect(
      chatCompletion({
        apiKey: "k",
        model: "gpt-x",
        provedor: "openai",
        messages: [{ role: "user", content: "oi" }],
        fetchFn,
      }),
    ).rejects.toThrow(/^OpenAI HTTP 401/);
  });

  it("nao manda `reasoning` para a OpenAI, que usa outro nome e recusaria o campo", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "gpt-x",
      provedor: "openai",
      messages: [{ role: "user", content: "oi" }],
      reasoning: { effort: "low" },
      fetchFn,
    });
    expect(chamadas[0]?.body.reasoning).toBeUndefined();
    expect(chamadas[0]?.body.reasoning_effort).toBeUndefined();
  });

  it("continua mandando `reasoning` no OpenRouter", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "oi" }],
      reasoning: { effort: "low" },
      fetchFn,
    });
    expect(chamadas[0]?.body.reasoning).toEqual({ effort: "low" });
  });

  it("json_schema estrito so sai no corpo do OpenRouter", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "gpt-x",
      provedor: "openai",
      messages: [{ role: "user", content: "oi" }],
      responseFormatJson: true,
      fetchFn,
    });
    expect(chamadas[0]?.body.response_format).toEqual({ type: "json_object" });
  });

  /**
   * Medido na sonda de 22/09/2026: a familia gpt-5.x e gpt-6 recusa `max_tokens` com
   * "Unsupported parameter ... Use 'max_completion_tokens' instead". Se este teste regredir, a
   * corrida inteira vira 400 no primeiro modelo moderno da OpenAI.
   */
  it("na OpenAI o teto de tokens vai como max_completion_tokens", async () => {
    const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
    await chatCompletion({
      apiKey: "k",
      model: "gpt-5.4",
      provedor: "openai",
      messages: [{ role: "user", content: "oi" }],
      maxTokens: 1234,
      fetchFn,
    });
    expect(chamadas[0]?.body.max_completion_tokens).toBe(1234);
    expect(chamadas[0]?.body.max_tokens).toBeUndefined();
  });

  it("no OpenRouter e na DeepSeek o teto continua como max_tokens", async () => {
    for (const provedor of ["openrouter", "deepseek"] as const) {
      const { fetchFn, chamadas } = fetchFake([{ status: 200, body: OK }]);
      await chatCompletion({
        apiKey: "k",
        model: "m",
        provedor,
        messages: [{ role: "user", content: "oi" }],
        maxTokens: 1234,
        fetchFn,
      });
      expect(chamadas[0]?.body.max_tokens).toBe(1234);
      expect(chamadas[0]?.body.max_completion_tokens).toBeUndefined();
    }
  });
});

/** `Env` exige bindings do Worker; o resolver so le as chaves de LLM. */
function envLlm(campos: Partial<Env>): Env {
  return campos as Env;
}

describe("resolverCadeiaLlm", () => {
  it("sem nenhuma chave, diz o que falta em vez de escolher um provedor", () => {
    const r = resolverCadeiaLlm(envLlm({}));
    expect("faltando" in r).toBe(true);
  });

  it("OPENAI_API_KEY vence as outras chaves", () => {
    const r = resolverCadeiaLlm(
      envLlm({
        OPENAI_API_KEY: "sk-o",
        DEEPSEEK_API_KEY: "d",
        OPENROUTER_API_KEY: "or",
        RESEARCH_MODEL: "r",
        OPENAI_ANALYST_MODEL: "a",
        OPENAI_STRATEGIST_MODEL: "s",
        OPENAI_CALENDAR_MODEL: "c",
      }),
    );
    expect("faltando" in r).toBe(false);
    if ("faltando" in r) throw new Error("esperava cadeia resolvida");
    expect(r.provedor).toBe("openai");
    expect(r.apiKey).toBe("sk-o");
    expect(r.strategistModel).toBe("s");
    expect(r.calendarModel).toBe("c");
  });

  it("openai sem os modelos das etapas reprova nomeando cada variavel ausente", () => {
    const r = resolverCadeiaLlm(envLlm({ OPENAI_API_KEY: "sk-o" }));
    if (!("faltando" in r)) throw new Error("esperava reprovacao");
    expect([...r.faltando]).toEqual([
      "OPENAI_STRATEGIST_MODEL",
      "OPENAI_ANALYST_MODEL",
      "OPENAI_CALENDAR_MODEL",
      "RESEARCH_MODEL",
    ]);
  });

  it("deepseek usa deepseek-chat nas duas etapas que ja usavam", () => {
    const r = resolverCadeiaLlm(envLlm({ DEEPSEEK_API_KEY: "d" }));
    if ("faltando" in r) throw new Error("esperava cadeia resolvida");
    expect(r.provedor).toBe("deepseek");
    expect(r.strategistModel).toBe("deepseek-chat");
    expect(r.calendarModel).toBe("deepseek-chat");
  });

  it("openrouter preserva os defaults historicos", () => {
    const r = resolverCadeiaLlm(envLlm({ OPENROUTER_API_KEY: "or" }));
    if ("faltando" in r) throw new Error("esperava cadeia resolvida");
    expect(r.provedor).toBe("openrouter");
    expect(r.strategistModel).toBe("google/gemini-3.6-flash");
    expect(r.analystModel).toBe("deepseek/deepseek-v4-flash-0731");
  });

  it("STRATEGIST_MODEL continua mandando no OpenRouter", () => {
    const r = resolverCadeiaLlm(envLlm({ OPENROUTER_API_KEY: "or", STRATEGIST_MODEL: "x/y" }));
    if ("faltando" in r) throw new Error("esperava cadeia resolvida");
    expect(r.strategistModel).toBe("x/y");
  });
});
