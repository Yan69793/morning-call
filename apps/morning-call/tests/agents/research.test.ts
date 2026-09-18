import { describe, expect, it } from "vitest";
import {
  avaliarFreshness,
  classificarFontes,
  classificarJanela,
  extrairDataPublicacao,
  formatarFontes,
  RESEARCH_MAX_RESULTS_PADRAO,
  runResearch,
  type FontePesquisada,
} from "../../src/agents/research.js";

/** Instante fixo: os testes não podem depender do relógio da máquina. */
const AGORA = "2026-09-10T05:00:00.000Z";

function fonteCom(url: string, title = ""): FontePesquisada {
  const data = extrairDataPublicacao(url, title);
  return {
    url,
    title,
    dominio: "exemplo.com",
    data_publicacao: data,
    janela: classificarJanela(data, AGORA),
  };
}

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

describe("extrairDataPublicacao", () => {
  it("lê a data do path /AAAA/MM/DD/", () => {
    expect(
      extrairDataPublicacao("https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml", ""),
    ).toBe("2026-09-09");
  });

  it("lê a data colada AAAAAMMDD (formato do rfi.fr)", () => {
    expect(
      extrairDataPublicacao("https://www.rfi.fr/br/mundo/20260909-escalada-de-tensao", ""),
    ).toBe("2026-09-09");
  });

  it("lê a data do título quando a URL não traz", () => {
    expect(
      extrairDataPublicacao("https://exemplo.com/materia", "Dólar sobe 09/09/2026 no fechamento"),
    ).toBe("2026-09-09");
  });

  it("devolve null quando não há data em lugar nenhum", () => {
    expect(extrairDataPublicacao("https://exemplo.com/mercados-hoje", "Mercados hoje")).toBeNull();
  });

  it("não aceita mês ou dia impossível", () => {
    expect(extrairDataPublicacao("https://exemplo.com/2026/13/40/x", "")).toBeNull();
  });
});

describe("classificarJanela", () => {
  it("marca 24h quando a data está dentro da janela", () => {
    expect(classificarJanela("2026-09-09", AGORA)).toBe("24h");
    expect(classificarJanela("2026-09-10", AGORA)).toBe("24h");
  });

  it("marca contexto quando a data é anterior à janela", () => {
    expect(classificarJanela("2026-08-17", AGORA)).toBe("contexto");
    expect(classificarJanela("2026-05-20", AGORA)).toBe("contexto");
  });

  it("marca indeterminado sem data", () => {
    expect(classificarJanela(null, AGORA)).toBe("indeterminado");
  });

  it("o limite é o instante menos 24h, não o dia corrente", () => {
    // 09/09 às 10h UTC: o limite cai em 08/09. Um fato de 07/09 já está fora.
    expect(classificarJanela("2026-09-07", "2026-09-09T10:00:00.000Z")).toBe("contexto");
    // 11/09 às 10h UTC: o limite cai em 10/09, então 09/09 está fora.
    expect(classificarJanela("2026-09-09", "2026-09-11T10:00:00.000Z")).toBe("contexto");
  });

  it("na granularidade de dia, a data igual ao limite entra como 24h (viés deliberado)", () => {
    // A citação só traz o dia, não a hora. Uma matéria das 23h de 08/09 está a menos de 24h de
    // 09/09 às 10h UTC; uma das 00h30 está a 33h. Sem hora não dá para separar as duas, e o código
    // prefere incluir: descartar notícia fresca por falta de metadata custa mais que o contrário.
    expect(classificarJanela("2026-09-08", "2026-09-09T10:00:00.000Z")).toBe("24h");
  });
});

describe("avaliarFreshness", () => {
  it("passa com pelo menos uma fonte datada dentro de 24h", () => {
    const r = avaliarFreshness([
      fonteCom("https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml"),
      fonteCom("https://economia.uol.com.br/noticias/2026/08/17/bolsas"),
    ]);
    expect(r.ok).toBe(true);
    expect(r.naJanela).toBe(1);
    expect(r.contexto).toBe(1);
  });

  it("reprova quando só há corpus antigo, mesmo com muitas citações", () => {
    // Caso medido no benchmark de 10/09: Parallel devolveu 10 citações, todas de meses anteriores.
    const antigas = [
      fonteCom("https://economia.uol.com.br/noticias/2026/08/17/bolsas"),
      fonteCom("https://economia.uol.com.br/noticias/2026/05/20/dolar"),
      fonteCom("https://valor.globo.com/financas/noticia/2026/07/29/bolsas"),
    ];
    const r = avaliarFreshness(antigas);
    expect(r.ok).toBe(false);
    expect(r.total).toBe(3);
    expect(r.contexto).toBe(3);
    expect(r.motivo).toContain("nenhuma fonte");
  });

  it("reprova quando nenhuma citação traz data", () => {
    const r = avaliarFreshness([fonteCom("https://exemplo.com/mercados-hoje")]);
    expect(r.ok).toBe(false);
    expect(r.indeterminado).toBe(1);
  });
});

describe("classificarFontes / formatarFontes", () => {
  it("deduplica URL repetida e classifica cada fonte", () => {
    const fontes = classificarFontes(
      [
        {
          url: "https://g1.globo.com/economia/noticia/2026/09/09/a.ghtml",
          title: "A",
          dominio: "g1.globo.com",
        },
        {
          url: "https://g1.globo.com/economia/noticia/2026/09/09/a.ghtml",
          title: "A",
          dominio: "g1.globo.com",
        },
        { url: "https://exemplo.com/x", title: "B", dominio: "exemplo.com" },
      ],
      AGORA,
    );
    expect(fontes).toHaveLength(2);
    expect(fontes[0]!.janela).toBe("24h");
    expect(fontes[1]!.janela).toBe("indeterminado");
  });

  it("rotula a janela em cada linha do prompt, inclusive as de contexto", () => {
    const texto = formatarFontes([
      fonteCom("https://g1.globo.com/economia/noticia/2026/09/09/a.ghtml", "Do dia"),
      fonteCom("https://economia.uol.com.br/noticias/2026/08/17/bolsas", "Antiga"),
      fonteCom("https://exemplo.com/sem-data", "Sem data"),
    ]);
    expect(texto).toContain("(24H)");
    expect(texto).toContain("(CONTEXTO)");
    expect(texto).toContain("(SEM-DATA)");
  });

  it("avisa explicitamente quando a pesquisa não devolveu nada", () => {
    expect(formatarFontes([])).toBe("NENHUMA fonte retornada pela pesquisa.");
  });
});

describe("runResearch", () => {
  it("usa o plugin web padrão com o teto conservador de resultados e devolve proveniência classificada", async () => {
    let corpo: Record<string, unknown> | null = null;
    const r = await runResearch({
      apiKey: "k",
      model: "deepseek/deepseek-v4-flash-0731",
      agoraIso: AGORA,
      fetchFn: mockFetch(
        {
          choices: [
            {
              message: {
                content: "resumo",
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: {
                      url: "https://g1.globo.com/economia/noticia/2026/09/09/dolar.ghtml",
                      title: "Dólar abre em alta",
                    },
                  },
                  {
                    type: "url_citation",
                    url_citation: {
                      url: "https://www.rfi.fr/br/mundo/20260909-escalada",
                      title: "Escalada",
                    },
                  },
                ],
              },
            },
          ],
          model: "deepseek/deepseek-v4-flash-0731",
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        },
        (b) => {
          corpo = b;
        },
      ),
    });

    // 17/09/2026: o teto caiu de 10 para RESEARCH_MAX_RESULTS_PADRAO. O plugin `web`
      // cobra POR RESULTADO devolvido (medido: US$ 0,0035 cada), entao este numero e a
      // alavanca de custo da rodada. O teste prende o default para ele nao voltar a subir
      // sem alguem medir a fatura de novo.
      expect(corpo!.plugins).toEqual([{ id: "web", max_results: RESEARCH_MAX_RESULTS_PADRAO }]);
      expect(RESEARCH_MAX_RESULTS_PADRAO).toBe(5);
    expect(corpo!.model).toBe("deepseek/deepseek-v4-flash-0731");
    expect(r.ok).toBe(true);
    expect(r.fontes).toHaveLength(2);
    expect(r.fontes[0]!.janela).toBe("24h");
    expect(r.freshness.ok).toBe(true);
    expect(r.tokensIn).toBe(100);
  });

  it("respeita maxResults explicito, para o override por ambiente valer", async () => {
    // A var RESEARCH_MAX_RESULTS do Worker chega aqui por este parametro. Se ele for
    // ignorado, o operador muda a var e a fatura nao muda, que e o pior dos mundos.
    let corpo: Record<string, unknown> | null = null;
    await runResearch({
      apiKey: "k",
      model: "m",
      agoraIso: AGORA,
      maxResults: 2,
      fetchFn: mockFetch(
        { choices: [{ message: { content: "resumo" } }] },
        (b) => {
          corpo = b;
        },
      ),
    });
    expect(corpo!.plugins).toEqual([{ id: "web", max_results: 2 }]);
  });

  it("marca ok=false e explica quando a API não devolve citação alguma", async () => {
    const r = await runResearch({
      apiKey: "k",
      model: "m",
      agoraIso: AGORA,
      fetchFn: mockFetch({ choices: [{ message: { content: "texto sem fonte" } }] }),
    });
    expect(r.ok).toBe(false);
    expect(r.fontes).toEqual([]);
    expect(r.motivo).toContain("sem citações");
    expect(r.freshness.ok).toBe(false);
  });
});
