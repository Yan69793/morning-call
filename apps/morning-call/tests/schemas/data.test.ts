import { describe, expect, it } from "vitest";
import { DataPoint, ND_MARKER, ScenarioSet, isOK, type Scenario } from "../../src/schemas/index.js";

describe("DataPoint, N/D não pode se disfarçar de zero", () => {
  const ok = {
    status: "OK",
    key: "USDBRL",
    quantity: { value: 5.42, unit: "BRL_por_USD" },
    venue: "BR",
    source: {
      name: "BCB PTAX",
      tier: 1,
      url: "https://www.bcb.gov.br/",
      retrieved_at: "2026-07-15T09:30:12.000Z",
    },
    as_of: "2026-07-14T16:00:00.000Z",
    observed_at: "2026-07-15T09:30:12.000Z",
  };

  it("aceita observação completa e rastreável", () => {
    expect(DataPoint.safeParse(ok).success).toBe(true);
  });

  it("rejeita observação sem fonte", () => {
    const semFonte = { ...ok } as Record<string, unknown>;
    delete semFonte.source;
    expect(DataPoint.safeParse(semFonte).success).toBe(false);
  });

  it("rejeita timestamp que não é UTC estrito", () => {
    expect(DataPoint.safeParse({ ...ok, as_of: "2026-07-14 13:00:00 BRT" }).success).toBe(false);
    expect(DataPoint.safeParse({ ...ok, as_of: "2026-07-14T13:00:00-03:00" }).success).toBe(false);
  });

  it("no ramo ND não existe campo de valor para o quant somar por engano", () => {
    const nd = DataPoint.parse({
      status: "ND",
      key: "VOL_IMPLICITA_USDBRL_1M",
      venue: "BR",
      reason: `${ND_MARKER}: vol implícita exige provedor pago, ver docs/DATA_SOURCES.md`,
      observed_at: "2026-07-15T09:30:12.000Z",
    });
    expect(nd).not.toHaveProperty("quantity");
    expect(isOK(nd)).toBe(false);
  });

  it("um ND com valor colado junto tem o valor descartado no parse", () => {
    const contrabando = {
      status: "ND",
      key: "VOL_IMPLICITA_USDBRL_1M",
      venue: "BR",
      reason: "sem provedor",
      observed_at: "2026-07-15T09:30:12.000Z",
      quantity: { value: 0, unit: "pct" }, // o zero que vira número publicado
    };
    // Campo desconhecido no ramo ND: o zero não entra nem em silêncio.
    expect(DataPoint.parse(contrabando)).not.toHaveProperty("quantity");
  });
});

describe("ScenarioSet, §13 exige soma 100%", () => {
  const cenario = (nome: Scenario["nome"], p: number): Scenario => ({
    nome,
    probabilidade_pct: p,
    gatilhos_observaveis: ["CPI core acima de 0,3% m/m"],
    vencedores: ["dólar"],
    perdedores: ["Ibovespa"],
    operacao_preferida: "Long USD/BRL",
    hedge: "Put spread de Ibovespa",
    sinal_confirmacao: "DI longo abrindo acima de 15 bps no dia",
    sinal_invalidacao: "PTAX abaixo de 5,32",
  });

  it("aceita quatro cenários que somam 100", () => {
    const ss = [
      cenario("base", 50),
      cenario("bull", 20),
      cenario("bear", 25),
      cenario("cisne_cinza", 5),
    ];
    expect(ScenarioSet.safeParse(ss).success).toBe(true);
  });

  it("rejeita soma de 99,9", () => {
    const ss = [
      cenario("base", 49.9),
      cenario("bull", 20),
      cenario("bear", 25),
      cenario("cisne_cinza", 5),
    ];
    expect(ScenarioSet.safeParse(ss).success).toBe(false);
  });

  it("rejeita cenário duplicado ainda que some 100", () => {
    const ss = [cenario("base", 25), cenario("base", 25), cenario("bear", 25), cenario("bull", 25)];
    expect(ScenarioSet.safeParse(ss).success).toBe(false);
  });
});
