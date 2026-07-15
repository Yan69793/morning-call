import { describe, expect, it } from "vitest";
import {
  parseStrategistContent,
  runStrategist,
  sealStrategistTrades,
} from "../../src/agents/strategist.js";
import type { MarketSnapshot } from "../../src/schemas/index.js";
import { runGates, filterPublishableTrades } from "../../src/committee/gates.js";
import { buildMorningCall } from "../../src/report/build.js";
import { validateMorningCall } from "../../src/report/validate.js";

const RUN = "11111111-2222-4333-8444-555555555555";

const snapshot: MarketSnapshot = {
  run_id: RUN,
  trade_date: "2026-07-15",
  taken_at: "2026-07-15T09:30:00.000Z",
  points: [
    {
      status: "OK",
      key: "USDBRL",
      quantity: { value: 5.07, unit: "BRL_por_USD" },
      venue: "BR",
      source: { name: "BCB PTAX", tier: 1, retrieved_at: "2026-07-15T09:20:00.000Z" },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: "2026-07-15T09:20:00.000Z",
    },
    {
      status: "OK",
      key: "SELIC_META",
      quantity: { value: 15.0, unit: "pct" },
      venue: "BR",
      source: { name: "BCB", tier: 1, retrieved_at: "2026-07-15T09:20:00.000Z" },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: "2026-07-15T09:20:00.000Z",
    },
  ],
};

const rationale =
  "Premissa operacional com mais de vinte caracteres para passar o schema Rationale.";

function validMockJson(claimSelic: number) {
  return JSON.stringify({
    abertura: {
      tensao_macro_dominante: rationale,
      regime: "transicao",
      vies: "neutro",
      conviccao: 5,
      premissa_que_sustenta_precos: rationale,
      fato_que_quebraria: rationale,
    },
    quant_claims: [
      { snapshot_key: "SELIC_META", valor_citado: { value: claimSelic, unit: "pct" } },
      { snapshot_key: "USDBRL", valor_citado: { value: 5.07, unit: "BRL_por_USD" } },
    ],
    trades: [
      {
        nome: "Long USD/BRL tático",
        classe: "câmbio",
        categoria: "direcional",
        horizonte: "swing",
        direcao: "comprar",
        entrada: {
          tipo: "preco",
          instrumento: "USDBRL",
          nivel: { value: 5.07, unit: "BRL_por_USD" },
          faixa: {
            min: { value: 5.0, unit: "BRL_por_USD" },
            max: { value: 5.1, unit: "BRL_por_USD" },
          },
        },
        alvo_1: { value: 5.25, unit: "BRL_por_USD" },
        alvo_2: { value: 5.4, unit: "BRL_por_USD" },
        invalidacao: {
          descricao: rationale,
          nivel: { value: 4.95, unit: "BRL_por_USD" },
        },
        tese: rationale,
        erro_precificacao: rationale,
        catalisador: rationale,
        por_que_agora: rationale,
        por_que_nao_consensual: rationale,
        riscos_ocultos: rationale,
        plano_saida: rationale,
        estrutura_alternativa: rationale,
        correlacao_com_outras: rationale,
        retorno_potencial: { value: 3, unit: "pct" },
        perda_maxima: { value: 1, unit: "pct" },
        sizing_pct_orcamento_risco: 5,
        conviccao: 6,
        fontes: ["BCB PTAX"],
      },
    ],
    cenarios: [
      {
        nome: "base",
        probabilidade_pct: 40,
        gatilhos_observaveis: ["Focus estável"],
        vencedores: ["DI curto"],
        perdedores: ["duration longa"],
        operacao_preferida: "neutro",
        hedge: "ouro",
        sinal_confirmacao: "IPCA no consenso",
        sinal_invalidacao: "IPCA bem acima",
      },
      {
        nome: "bull",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["corte Fed"],
        vencedores: ["RV"],
        perdedores: ["USD"],
        operacao_preferida: "long IBOV",
        hedge: "put",
        sinal_confirmacao: "VIX < 15",
        sinal_invalidacao: "VIX > 25",
      },
      {
        nome: "bear",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["fiscal BR"],
        vencedores: ["USD"],
        perdedores: ["NTN-B longa"],
        operacao_preferida: "long USD",
        hedge: "caixa",
        sinal_confirmacao: "CDS sobe",
        sinal_invalidacao: "CDS cai",
      },
      {
        nome: "cisne_cinza",
        probabilidade_pct: 10,
        gatilhos_observaveis: ["geopolítica"],
        vencedores: ["ouro"],
        perdedores: ["beta"],
        operacao_preferida: "long vol",
        hedge: "caixa",
        sinal_confirmacao: "spike vol",
        sinal_invalidacao: "vol colapsa",
      },
    ],
    rastreabilidade: {
      fatos_verificados: ["SELIC_META=15 no snapshot"],
      interpretacoes: ["regime de transição"],
      hipoteses: ["fluxo pode reverter"],
      dados_incompletos: ["N/D — vol implícita"],
    },
  });
}

describe("strategist closed-book + gates", () => {
  it("parse + seal + gates ok com claim correto", async () => {
    const result = await runStrategist({
      snapshot,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validMockJson(15),
    });
    expect(result.trades).toHaveLength(1);
    const gates = runGates({
      snapshot,
      claims: result.claims,
      trades: result.trades,
    });
    expect(gates.crossCheck.ok).toBe(true);
    const { published } = filterPublishableTrades(result.trades, true);
    expect(published).toHaveLength(1);

    const mc = buildMorningCall({
      runId: RUN,
      tradeDate: "2026-07-15",
      generatedAt: "2026-07-15T10:00:00.000Z",
      raw: result.raw,
      trades: published,
      provenance: result.provenance,
    });
    const v = validateMorningCall(mc);
    expect(v.aprovado).toBe(true);
  });

  it("número inventado (Selic 1.50) barrado no crossCheck", async () => {
    const result = await runStrategist({
      snapshot,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validMockJson(1.5),
    });
    const gates = runGates({
      snapshot,
      claims: result.claims,
      trades: result.trades,
    });
    expect(gates.crossCheck.ok).toBe(false);
    expect(gates.crossCheck.violations.some((v) => v.kind === "valor_divergente")).toBe(true);
    const { published, rejected } = filterPublishableTrades(result.trades, false);
    expect(published).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("parseStrategistContent rejeita JSON inválido de schema", () => {
    expect(() => parseStrategistContent("{}")).toThrow();
  });

  it("sealStrategistTrades deriva risco_retorno", () => {
    const raw = parseStrategistContent(validMockJson(15));
    const sealed = sealStrategistTrades(raw, {
      run_id: RUN,
      model: "mock",
      prompt_version: "t",
      generated_at: "2026-07-15T10:00:00.000Z",
    });
    expect(sealed[0]!.risco_retorno.value).toBeCloseTo(3, 12);
  });
});
