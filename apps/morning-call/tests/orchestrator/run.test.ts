import { describe, expect, it } from "vitest";
import { runMorningCall } from "../../src/orchestrator/run.js";
import type { Env } from "../../src/env.js";
import type { DataProvider } from "../../src/data/types.js";
import type { DataPoint } from "../../src/schemas/data.js";

const env = {} as Env;

const mockProvider: DataProvider = {
  name: "mock",
  fetch(ctx) {
    const p: DataPoint = {
      status: "OK",
      key: "SELIC_META",
      quantity: { value: 15, unit: "pct" },
      venue: "BR",
      source: { name: "mock", tier: 3, retrieved_at: ctx.observedAt },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: ctx.observedAt,
    };
    const fx: DataPoint = {
      status: "OK",
      key: "USDBRL",
      quantity: { value: 5.07, unit: "BRL_por_USD" },
      venue: "BR",
      source: { name: "mock", tier: 3, retrieved_at: ctx.observedAt },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: ctx.observedAt,
    };
    return Promise.resolve([p, fx]);
  },
};

const rationale =
  "Premissa operacional com mais de vinte caracteres para passar o schema Rationale.";

function mockContent() {
  return JSON.stringify({
    abertura: {
      tensao_macro_dominante: rationale,
      regime: "transicao",
      vies: "neutro",
      conviccao: 5,
      premissa_que_sustenta_precos: rationale,
      fato_que_quebraria: rationale,
    },
    quant_claims: [{ snapshot_key: "SELIC_META", valor_citado: { value: 15, unit: "pct" } }],
    trades: [],
    cenarios: [
      {
        nome: "base",
        probabilidade_pct: 40,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
      {
        nome: "bull",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
      {
        nome: "bear",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
      {
        nome: "cisne_cinza",
        probabilidade_pct: 10,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
    ],
    rastreabilidade: {
      fatos_verificados: ["selic 15"],
      interpretacoes: [],
      hipoteses: [],
      dados_incompletos: [],
    },
  });
}

describe("runMorningCall dryRun", () => {
  it("aborta em fim de semana", async () => {
    const r = await runMorningCall({
      env,
      tradeDate: "2026-07-18",
      dryRun: true,
      providers: [mockProvider],
    });
    expect(r.aborted).toBe(true);
  });

  it("gera MorningCall com trades vazios (não operar)", async () => {
    const r = await runMorningCall({
      env,
      tradeDate: "2026-07-15",
      dryRun: true,
      providers: [mockProvider],
      mockStrategistContent: mockContent(),
    });
    expect(r.aborted).toBe(false);
    expect(r.morningCall).toBeDefined();
    expect(r.morningCall!.trades).toHaveLength(0);
    expect(r.validation?.aprovado).toBe(true);
    expect(r.publishedCount).toBe(0);
  });
});
