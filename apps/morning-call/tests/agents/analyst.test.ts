import { describe, expect, it } from "vitest";
import {
  buildAnalystPrompts,
  ResearchBriefBruto,
  runAnalyst,
  validarBrief,
} from "../../src/agents/analyst.js";
import { classificarFontes } from "../../src/agents/research.js";

const AGORA = "2026-09-10T05:00:00.000Z";
const URL_24H = "https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml";
const URL_ANTIGA = "https://economia.uol.com.br/noticias/2026/08/17/bolsas";

const FONTES = classificarFontes(
  [
    { url: URL_24H, title: "Dólar abre em alta", dominio: "g1.globo.com" },
    { url: URL_ANTIGA, title: "Bolsas da Europa", dominio: "economia.uol.com.br" },
  ],
  AGORA,
);

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

function respostaComJson(conteudo: string): unknown {
  return { choices: [{ message: { content: conteudo } }], model: "deepseek/deepseek-v4-flash-0731" };
}

describe("validarBrief", () => {
  const bruto = ResearchBriefBruto.parse({
    drivers: [
      { texto: "Petróleo acima de US$ 100", fonte_url: URL_24H, janela: "24h" },
      { texto: "Fato sem fonte nenhuma" },
      { texto: "Fato com fonte inventada", fonte_url: "https://site-que-nao-existe.com/x" },
      {
        texto: "Fato com domínio conhecido e URL errada",
        fonte_url: "https://economia.uol.com.br/noticias/2026/01/01/inventada",
      },
    ],
    brasil: [],
    exterior: [],
    geopolitica: [],
    impactos_ativos: [],
    riscos: [{ texto: "Risco genérico" }],
    fontes: [URL_24H],
  });

  it("marca como verificável só o fato com URL idêntica a uma citação", () => {
    const b = validarBrief(bruto, FONTES);
    expect(b.drivers[0]!.verificavel).toBe(true);
    expect(b.drivers[0]!.dominio).toBe("g1.globo.com");
    expect(b.drivers[0]!.motivo_nao_verificavel).toBeNull();
  });

  it("herda a janela da citação, não a que o modelo afirmou", () => {
    const b = validarBrief(
      ResearchBriefBruto.parse({
        drivers: [{ texto: "Fato antigo", fonte_url: URL_ANTIGA, janela: "24h" }],
      }),
      FONTES,
    );
    expect(b.drivers[0]!.verificavel).toBe(true);
    expect(b.drivers[0]!.janela).toBe("contexto");
  });

  it("marca fato sem fonte declarada", () => {
    const b = validarBrief(bruto, FONTES);
    expect(b.drivers[1]!.verificavel).toBe(false);
    expect(b.drivers[1]!.motivo_nao_verificavel).toBe("fato sem fonte declarada");
  });

  it("rejeita fonte fora da pesquisa", () => {
    const b = validarBrief(bruto, FONTES);
    expect(b.drivers[2]!.verificavel).toBe(false);
    expect(b.drivers[2]!.motivo_nao_verificavel).toBe("fonte fora da pesquisa");
  });

  it("distingue domínio conhecido com URL que não está na pesquisa", () => {
    const b = validarBrief(bruto, FONTES);
    expect(b.drivers[3]!.verificavel).toBe(false);
    expect(b.drivers[3]!.motivo_nao_verificavel).toContain("domínio conhecido");
  });

  it("conta fatos e não verificáveis e lista as URLs efetivamente usadas", () => {
    const b = validarBrief(bruto, FONTES);
    expect(b.total_fatos).toBe(5);
    expect(b.nao_verificaveis).toBe(4);
    expect(b.fontes_utilizadas).toEqual([URL_24H]);
  });

  it("aceita fato em texto puro (string) sem quebrar o parser", () => {
    const b = validarBrief(ResearchBriefBruto.parse({ riscos: ["Risco solto"] }), FONTES);
    expect(b.riscos[0]!.texto).toBe("Risco solto");
    expect(b.riscos[0]!.verificavel).toBe(false);
  });
});

describe("buildAnalystPrompts", () => {
  it("entrega as fontes com selo de janela e proíbe pesquisa nova", () => {
    const p = buildAnalystPrompts({ query: "consulta", fontes: FONTES, pesquisa: "texto pesquisado" });
    expect(p.system).toContain("NÃO pesquisa");
    expect(p.user).toContain("(24H)");
    expect(p.user).toContain("(CONTEXTO)");
    expect(p.user).toContain(URL_24H);
    expect(p.user).toContain("texto pesquisado");
  });
});

describe("runAnalyst", () => {
  it("valida o JSON, usa json_object, teto enxuto e raciocínio desligado", async () => {
    let corpo: Record<string, unknown> | null = null;
    const json = JSON.stringify({
      drivers: [{ texto: "Petróleo acima de US$ 100", fonte_url: URL_24H, janela: "24h" }],
      brasil: [],
      exterior: [],
      geopolitica: [],
      impactos_ativos: [],
      riscos: [],
      fontes: [{ url: URL_24H, titulo: "Dólar abre em alta" }],
    });

    const r = await runAnalyst({
      apiKey: "k",
      model: "deepseek/deepseek-v4-flash-0731",
      fontes: FONTES,
      pesquisa: "material",
      fetchFn: mockFetch(respostaComJson(json), (b) => {
        corpo = b;
      }),
    });

    expect(corpo!.response_format).toEqual({ type: "json_object" });
    expect(corpo!.max_tokens).toBe(5000);
    expect(corpo!.reasoning).toEqual({ effort: "none" });
    expect(r.ok).toBe(true);
    expect(r.brief!.drivers[0]!.verificavel).toBe(true);
    expect(r.brief!.total_fatos).toBe(1);
  });

  it("com reasoningEffort null reproduz o comportamento antigo (sem campo reasoning)", async () => {
    let corpo: Record<string, unknown> | null = null;
    await runAnalyst({
      apiKey: "k",
      model: "m",
      fontes: FONTES,
      pesquisa: "material",
      reasoningEffort: null,
      maxTokens: 6000,
      fetchFn: mockFetch(
        respostaComJson(
          JSON.stringify({
            drivers: [],
            brasil: [],
            exterior: [],
            geopolitica: [],
            impactos_ativos: [],
            riscos: [],
            fontes: [],
          }),
        ),
        (b) => {
          corpo = b;
        },
      ),
    });
    expect(corpo!.reasoning).toBeUndefined();
    expect(corpo!.max_tokens).toBe(6000);
  });

  it("aceita JSON embrulhado em cerca de markdown", async () => {
    const r = await runAnalyst({
      apiKey: "k",
      model: "m",
      fontes: FONTES,
      pesquisa: "material",
      fetchFn: mockFetch(
        respostaComJson('```json\n{"drivers":[],"brasil":[],"exterior":[],"geopolitica":[],"impactos_ativos":[],"riscos":[],"fontes":[]}\n```'),
      ),
    });
    expect(r.ok).toBe(true);
    expect(r.brief!.total_fatos).toBe(0);
  });

  it("devolve ok=false com motivo quando o corpo não é JSON", async () => {
    const r = await runAnalyst({
      apiKey: "k",
      model: "m",
      fontes: FONTES,
      pesquisa: "material",
      fetchFn: mockFetch(respostaComJson("não é json de jeito nenhum")),
    });
    expect(r.ok).toBe(false);
    expect(r.brief).toBeNull();
    expect(r.motivo).toContain("JSON inválido");
  });

  it("devolve ok=false quando o JSON não satisfaz o contrato", async () => {
    const r = await runAnalyst({
      apiKey: "k",
      model: "m",
      fontes: FONTES,
      pesquisa: "material",
      fetchFn: mockFetch(respostaComJson(JSON.stringify({ drivers: "não é lista" }))),
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("fora do contrato");
  });
});
