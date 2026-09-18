import { describe, expect, it } from "vitest";
import {
  chatCompletion,
  dominioDe,
  extrairCitacoes,
  extrairAffordDoCorpo,
  OpenRouterBillingError,
  OpenRouterError,
} from "../../src/agents/openrouter.js";
import {
  runStrategist,
  strategistMaxTokensFromEnv,
  STRATEGIST_MAX_TOKENS_PADRAO,
} from "../../src/agents/strategist.js";
import type { MarketSnapshot } from "../../src/schemas/index.js";

function mockFetch(payload: unknown, capturar?: (body: Record<string, unknown>) => void): typeof fetch {
  return (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    if (capturar && typeof init?.body === "string") {
      capturar(JSON.parse(init.body) as Record<string, unknown>);
    }
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
}

const URL_24H = "https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml";

const ANOTACAO = {
  type: "url_citation",
  url_citation: {
    url: URL_24H,
    title: "Dólar abre em alta",
    content: "trecho devolvido pelo provedor",
    start_index: 0,
    end_index: 10,
  },
  campo_novo_do_provedor: "preservar",
};

describe("openrouter: proveniência da pesquisa", () => {
  it("preserva annotations/url_citation e os campos extras que o provedor mandar", async () => {
    const r = await chatCompletion({
      apiKey: "k",
      model: "modelo-pedido",
      messages: [{ role: "user", content: "q" }],
      fetchFn: mockFetch({
        choices: [{ message: { content: "texto", annotations: [ANOTACAO] } }],
        model: "modelo-real",
        usage: {
          prompt_tokens: 11,
          completion_tokens: 22,
          completion_tokens_details: { reasoning_tokens: 7 },
        },
      }),
    });

    expect(r.citations).toHaveLength(1);
    expect(r.citations[0]!.url).toBe(URL_24H);
    expect(r.citations[0]!.title).toBe("Dólar abre em alta");
    expect(r.citations[0]!.dominio).toBe("g1.globo.com");
    expect(r.citations[0]!.conteudo).toBe("trecho devolvido pelo provedor");
    expect(r.annotations).toHaveLength(1);
    expect((r.annotations[0] as Record<string, unknown>).campo_novo_do_provedor).toBe("preservar");
    expect(r.tokensIn).toBe(11);
    expect(r.tokensOut).toBe(22);
    expect(r.reasoningTokens).toBe(7);
    expect(r.model).toBe("modelo-real");
  });

  it("manda plugins no corpo da requisição", async () => {
    let corpo: Record<string, unknown> | null = null;
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      plugins: [{ id: "web", max_results: 10 }],
      fetchFn: mockFetch({ choices: [{ message: { content: "x" } }] }, (b) => {
        corpo = b;
      }),
    });
    expect(corpo!.plugins).toEqual([{ id: "web", max_results: 10 }]);
  });

  it("não manda a chave plugins quando ela não é passada", async () => {
    let corpo: Record<string, unknown> | null = null;
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: mockFetch({ choices: [{ message: { content: "x" } }] }, (b) => {
        corpo = b;
      }),
    });
    expect(corpo!.plugins).toBeUndefined();
  });

  it("cai na lista legada `citations` quando não há annotations", async () => {
    const r = await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: mockFetch({
        choices: [{ message: { content: "x", citations: [URL_24H, "https://www.valor.globo.com/a"] } }],
      }),
    });
    expect(r.citations.map((c) => c.url)).toEqual([URL_24H, "https://www.valor.globo.com/a"]);
    expect(r.citations[1]!.dominio).toBe("valor.globo.com");
    expect(r.annotations).toEqual([]);
  });

  it("aceita content vazio quando veio citação junto (testes B e C do benchmark)", async () => {
    const r = await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: mockFetch({ choices: [{ message: { content: "", annotations: [ANOTACAO] } }] }),
    });
    expect(r.content).toBe("");
    expect(r.citations).toHaveLength(1);
  });

  it("lança quando não há nem content nem citação", async () => {
    await expect(
      chatCompletion({
        apiKey: "k",
        model: "m",
        messages: [{ role: "user", content: "q" }],
        fetchFn: mockFetch({ choices: [{ message: { content: "" } }] }),
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });
});

describe("extrairCitacoes / dominioDe", () => {
  it("remove o prefixo www e devolve ? para URL inválida", () => {
    expect(dominioDe("https://www.valor.globo.com/x")).toBe("valor.globo.com");
    expect(dominioDe("nao-e-url")).toBe("?");
  });

  it("ignora anotação sem url e mantém a ordem", () => {
    const citacoes = extrairCitacoes({
      annotations: [
        { type: "url_citation", url_citation: { url: "https://a.com/1" } },
        { type: "url_citation" },
        { type: "url_citation", url_citation: { url: "https://b.com/2", title: "B" } },
      ],
    });
    expect(citacoes.map((c) => c.url)).toEqual(["https://a.com/1", "https://b.com/2"]);
    expect(citacoes[0]!.title).toBe("");
    expect(citacoes[1]!.title).toBe("B");
  });
});

describe("controle de raciocínio (custo)", () => {
  it("manda body.reasoning quando pedido", async () => {
    let corpo: Record<string, unknown> | null = null;
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      reasoning: { effort: "none" },
      fetchFn: mockFetch({ choices: [{ message: { content: "x" } }] }, (b) => {
        corpo = b;
      }),
    });
    expect(corpo!.reasoning).toEqual({ effort: "none" });
  });

  it("não manda body.reasoning quando não é pedido", async () => {
    let corpo: Record<string, unknown> | null = null;
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: mockFetch({ choices: [{ message: { content: "x" } }] }, (b) => {
        corpo = b;
      }),
    });
    expect(corpo!.reasoning).toBeUndefined();
  });
});

/**
 * 402 de reserva de crédito do OpenRouter (portado do pipeline Python em 17/09).
 * Corpo real de 17/09/2026 06:33, instância 25b609ac do Morning Call:
 * "You requested up to 8000 tokens, but can only afford 2916." O N é o único dado
 * válido de quanto ainda dá para pagar; sem ele não se inventa teto de retry.
 */
const CORPO_402 =
  '{"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 8000 tokens, but can only afford 2916. To increase, visit https://openrouter.ai/workspaces/default/keys","code":402}}';

function resposta(status: number, corpo: string): Response {
  return new Response(corpo, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function respostaOk(): Response {
  return resposta(200, JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
}

describe("openrouter: 402 de reserva de crédito (billing)", () => {
  it("1. 402 com N=2916 → um retry com max_tokens 2866 → 200", async () => {
    const corpos: Record<string, unknown>[] = [];
    let chamadas = 0;
    const fetchMock = (): Promise<Response> => {
      chamadas++;
      if (chamadas === 1) return Promise.resolve(resposta(402, CORPO_402));
      return Promise.resolve(respostaOk());
    };
    // captura precisa ver o corpo de TODAS as chamadas, inclusive a do retry
    const fetchEspiao: typeof fetch = (_url, init) => {
      if (typeof init?.body === "string") corpos.push(JSON.parse(init.body) as Record<string, unknown>);
      return fetchMock();
    };
    const r = await chatCompletion({
      apiKey: "k",
      model: "modelo-x",
      maxTokens: 8000,
      messages: [{ role: "user", content: "q" }],
      fetchFn: fetchEspiao,
    });
    expect(r.content).toBe("ok");
    expect(chamadas).toBe(2);
    expect(corpos[0]!.max_tokens).toBe(8000);
    expect(corpos[1]!.max_tokens).toBe(2866);
  });

  it("2. 402 sem o N no corpo → nenhum retry, 1 chamada, afford undefined", async () => {
    let chamadas = 0;
    const fetchMock = (): Promise<Response> => {
      chamadas++;
      return Promise.resolve(resposta(402, '{"error":{"message":"insufficient credits"}}'));
    };
    const err = await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: fetchMock,
    }).catch((e: unknown) => e);
    expect(chamadas).toBe(1);
    expect(err).toBeInstanceOf(OpenRouterBillingError);
    expect((err as OpenRouterBillingError).status).toBe(402);
    expect((err as OpenRouterBillingError).afford).toBeUndefined();
  });

  it("3. 402 com N=100 → nenhum retry (100 - 50 < 64)", async () => {
    let chamadas = 0;
    const fetchMock = (): Promise<Response> => {
      chamadas++;
      return Promise.resolve(
        resposta(402, '{"error":{"message":"... can only afford 100 ..."}}'),
      );
    };
    const err = await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: fetchMock,
    }).catch((e: unknown) => e);
    expect(chamadas).toBe(1);
    expect(err).toBeInstanceOf(OpenRouterBillingError);
    expect((err as OpenRouterBillingError).afford).toBe(100);
  });

  it("4. 200 direto → nenhuma chamada extra", async () => {
    let chamadas = 0;
    const r = await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: () => {
        chamadas++;
        return Promise.resolve(respostaOk());
      },
    });
    expect(chamadas).toBe(1);
    expect(r.content).toBe("ok");
  });

  it("5. 402 nas duas tentativas → OpenRouterBillingError com afford preservado, 2 chamadas", async () => {
    let chamadas = 0;
    // segunda resposta vem com corpo DIFERENTE, sem o N (medido em 15/09 no Python):
    // o afford da primeira tem que sobreviver, não ser sobrescrito com undefined
    const fetchMock = (): Promise<Response> => {
      chamadas++;
      if (chamadas === 1) return Promise.resolve(resposta(402, CORPO_402));
      return Promise.resolve(resposta(402, '{"error":{"message":"key limit exceeded"}}'));
    };
    const err = await chatCompletion({
      apiKey: "k",
      model: "m",
      maxTokens: 8000,
      messages: [{ role: "user", content: "q" }],
      fetchFn: fetchMock,
    }).catch((e: unknown) => e);
    expect(chamadas).toBe(2);
    expect(err).toBeInstanceOf(OpenRouterBillingError);
    expect((err as OpenRouterBillingError).afford).toBe(2916);
  });

  it("6. contador de chamadas nunca passa de 2, nem no pior caso (402 sem N)", async () => {
    let chamadas = 0;
    const fetchMock = (): Promise<Response> => {
      chamadas++;
      return Promise.resolve(resposta(402, CORPO_402));
    };
    await chatCompletion({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "q" }],
      fetchFn: fetchMock,
    }).catch(() => undefined);
    expect(chamadas).toBe(2);
  });

  it("extrai o N do corpo completo, mesmo fora da janela de 200 chars da mensagem", () => {
    const corpoLongo =
      '{"error":{"message":"' +
      "x".repeat(300) +
      ' You requested up to 16000 tokens, but can only afford 9517. To increase, visit https://openrouter.ai/workspaces/default/keys","code":402}}';
    expect(extrairAffordDoCorpo(corpoLongo)).toBe(9517);
    expect(extrairAffordDoCorpo(CORPO_402)).toBe(2916);
    expect(extrairAffordDoCorpo("sem o numero aqui")).toBeUndefined();
  });

  it("402 no caminho deepseekApi não gera retry nem erro de billing", async () => {
    let chamadas = 0;
    const fetchMock = (): Promise<Response> => {
      chamadas++;
      return Promise.resolve(resposta(402, CORPO_402));
    };
    const err = await chatCompletion({
      apiKey: "k",
      model: "m",
      deepseekApi: true,
      messages: [{ role: "user", content: "q" }],
      fetchFn: fetchMock,
    }).catch((e: unknown) => e);
    expect(chamadas).toBe(1);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err).not.toBeInstanceOf(OpenRouterBillingError);
  });
});

/**
 * 7. `STRATEGIST_MAX_TOKENS` honrado. O workflow lê a var do env e injeta no
 * runStrategist, que a repassa ao chatCompletion. Aqui a prova é no corpo da
 * requisição: 6000 quando a var vale 6000, 8000 (default) quando ausente/inválida.
 */
describe("7. STRATEGIST_MAX_TOKENS honrado no corpo da chamada", () => {
  const RUN = "11111111-2222-4333-8444-555555555555";
  const snapshot: MarketSnapshot = {
    run_id: RUN,
    trade_date: "2026-09-17",
    taken_at: "2026-09-17T09:30:00.000Z",
    points: [],
  };

  // runStrategist com fetch mockado que devolve content vazio: chatCompletion lança,
  // mas o corpo da requisição já foi capturado — é o que a prova precisa ver.
  async function corpoCapturadoDaChamada(maxTokens?: number): Promise<Record<string, unknown> | null> {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      if (typeof init?.body === "string") corpo = JSON.parse(init.body) as Record<string, unknown>;
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    await runStrategist({
      snapshot,
      apiKey: "k",
      model: "m",
      runId: RUN,
      ...(maxTokens === undefined ? {} : { maxTokens }),
      fetchFn: fetchMock,
    }).catch(() => undefined);
    return corpo;
  }

  it("com a var em 6000, o corpo enviado sai com max_tokens: 6000", async () => {
    expect(strategistMaxTokensFromEnv("6000")).toBe(6000);
    const corpo = await corpoCapturadoDaChamada(strategistMaxTokensFromEnv("6000"));
    expect(corpo!.max_tokens).toBe(6000);
  });

  it("var ausente, vazia ou inválida → corpo sai com o default 8000", async () => {
    expect(strategistMaxTokensFromEnv(undefined)).toBeUndefined();
    expect(strategistMaxTokensFromEnv("")).toBeUndefined();
    expect(strategistMaxTokensFromEnv("abc")).toBeUndefined();
    expect(strategistMaxTokensFromEnv("-5")).toBeUndefined();
    expect(STRATEGIST_MAX_TOKENS_PADRAO).toBe(8000);
    const corpo = await corpoCapturadoDaChamada(strategistMaxTokensFromEnv("abc"));
    expect(corpo!.max_tokens).toBe(8000);
  });
});
