import { describe, expect, it } from "vitest";
import {
  buildPesquisaBlock,
  buildStrategistJsonSchema,
  runStrategist,
} from "../../src/agents/strategist.js";
import type { MarketSnapshot } from "../../src/schemas/index.js";

const RUN = "11111111-2222-4333-8444-555555555555";

const snapshot: MarketSnapshot = {
  run_id: RUN,
  trade_date: "2026-09-10",
  taken_at: "2026-09-10T09:30:00.000Z",
  points: [
    {
      status: "OK",
      key: "USDBRL",
      quantity: { value: 5.07, unit: "BRL_por_USD" },
      venue: "BR",
      source: { name: "BCB PTAX", tier: 1, retrieved_at: "2026-09-10T09:20:00.000Z" },
      as_of: "2026-09-09T18:00:00.000Z",
      observed_at: "2026-09-10T09:20:00.000Z",
    },
  ],
};

/** Caminho do schema até cada `conviccao` que o Zod limita a 0..10. */
function conviccaoDoSchema(schema: Record<string, unknown>, caminho: "abertura" | "trades"): Record<string, unknown> {
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  if (caminho === "abertura") {
    return (properties.abertura!.properties as Record<string, Record<string, unknown>>).conviccao!;
  }
  const items = properties.trades!.items as Record<string, unknown>;
  return (items.properties as Record<string, Record<string, unknown>>).conviccao!;
}

describe("buildStrategistJsonSchema: conviccao", () => {
  it("limita a conviccao da abertura entre 0 e 10, igual ao Zod", () => {
    const conviccao = conviccaoDoSchema(buildStrategistJsonSchema(), "abertura");
    expect(conviccao.type).toBe("number");
    expect(conviccao.minimum).toBe(0);
    expect(conviccao.maximum).toBe(10);
  });

  it("limita a conviccao de cada trade entre 0 e 10, igual ao Zod", () => {
    const conviccao = conviccaoDoSchema(buildStrategistJsonSchema(), "trades");
    expect(conviccao.minimum).toBe(0);
    expect(conviccao.maximum).toBe(10);
  });

  it("não existe nenhuma propriedade conviccao sem limite no schema", () => {
    const texto = JSON.stringify(buildStrategistJsonSchema());
    const semLimite = texto.match(/"conviccao":\{"type":"number"\}/g) ?? [];
    expect(semLimite).toHaveLength(0);
  });
});

describe("buildPesquisaBlock", () => {
  it("declara as fontes como as únicas citáveis e separa narrativa de quant_claims", () => {
    const bloco = buildPesquisaBlock({
      analise: '{"drivers":[{"texto":"x"}]}',
      fontes: "[1] (24H) Dólar abre em alta — https://g1.globo.com/x — domínio g1.globo.com",
    });
    expect(bloco).toContain("PESQUISA WEB");
    expect(bloco).toContain("ÚNICAS citáveis");
    expect(bloco).toContain("quant_claims");
    expect(bloco).toContain("g1.globo.com");
    expect(bloco).toContain('{"drivers":[{"texto":"x"}]}');
  });
});

describe("runStrategist com pesquisa anexada", () => {
  it("injeta o bloco de pesquisa no prompt do usuário", async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      if (typeof init?.body === "string") corpo = JSON.parse(init.body) as Record<string, unknown>;
      // Corpo vazio sem citação: chatCompletion lança, e é o suficiente para inspecionar o prompt.
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };

    await expect(
      runStrategist({
        snapshot,
        apiKey: "k",
        model: "google/gemini-3.6-flash",
        runId: RUN,
        fetchFn: fetchMock,
        pesquisa: {
          analise: '{"drivers":[]}',
          fontes: "[1] (24H) Dólar — https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml",
        },
      }),
    ).rejects.toThrow();

    const mensagens = corpo!.messages as { role: string; content: string }[];
    const doUsuario = mensagens.find((m) => m.role === "user")!.content;
    expect(doUsuario).toContain("PESQUISA WEB");
    expect(doUsuario).toContain("https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml");
    expect(doUsuario).toContain('{"drivers":[]}');
    // O snapshot continua no prompt: o bloco é anexado, não substitui.
    expect(doUsuario).toContain("USDBRL");
  });

  it("sem pesquisa o prompt sai closed-book, exatamente como antes", async () => {
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

    await expect(
      runStrategist({
        snapshot,
        apiKey: "k",
        model: "m",
        runId: RUN,
        fetchFn: fetchMock,
      }),
    ).rejects.toThrow();

    const mensagens = corpo!.messages as { role: string; content: string }[];
    expect(mensagens.find((m) => m.role === "user")!.content).not.toContain("PESQUISA WEB");
  });
});
