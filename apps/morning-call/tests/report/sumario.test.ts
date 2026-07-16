import { describe, expect, it } from "vitest";
import { buildMacroSummary, type MacroSummary } from "../../src/report/sumario.js";
import type { MorningCall } from "../../src/schemas/report.js";

function makeMorningCall(overrides: Partial<MorningCall> = {}): MorningCall {
  return {
    run_id: "11111111-1111-4111-8111-111111111111",
    trade_date: "2026-07-15",
    generated_at: "2026-07-15T09:30:00.000Z",
    abertura: {
      tensao_macro_dominante: "Fed em compasso de espera, fiscal BR no foco",
      regime: "goldilocks",
      vies: "comprador",
      conviccao: 7,
      premissa_que_sustenta_precos: "corte de juros em setembro precificado",
      fato_que_quebraria: "inflação acima do esperado no payroll",
    },
    trades: [],
    ranking: [],
    cenarios: [
      {
        nome: "base",
        probabilidade_pct: 50,
        gatilhos_observaveis: ["IPCA dentro da banda"],
        vencedores: ["Ibovespa"],
        perdedores: ["Dólar"],
        operacao_preferida: "compra de IBOV",
        hedge: "put IBOV OTM",
        sinal_confirmacao: "IPCA abaixo de 0.3%",
        sinal_invalidacao: "IPCA acima de 0.5%",
      },
      {
        nome: "bull",
        probabilidade_pct: 20,
        gatilhos_observaveis: ["corte de 50bps sinalizado"],
        vencedores: ["small caps"],
        perdedores: ["DI curto"],
        operacao_preferida: "compra de SMLL",
        hedge: "vendido em DI",
        sinal_confirmacao: "Fed minutes dovish",
        sinal_invalidacao: "Fed minutes hawkish",
      },
      {
        nome: "bear",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["dólar disparando"],
        vencedores: ["exportadoras"],
        perdedores: ["consumo doméstico"],
        operacao_preferida: "compra de VALE3",
        hedge: "vendido em IBOV",
        sinal_confirmacao: "DXY acima de 107",
        sinal_invalidacao: "DXY abaixo de 105",
      },
      {
        nome: "cisne_cinza",
        probabilidade_pct: 5,
        gatilhos_observaveis: ["evento geopolítico extremo"],
        vencedores: ["ouro"],
        perdedores: ["renda variável global"],
        operacao_preferida: "compra de ouro",
        hedge: "não aplicável",
        sinal_confirmacao: "circuit breaker S&P",
        sinal_invalidacao: "trégua diplomática",
      },
    ],
    rastreabilidade: {
      fatos_verificados: ["S&P 500 fechou a 5500"],
      interpretacoes: ["mercado precifica corte em setembro"],
      hipoteses: ["fiscal BR não piora antes de outubro"],
      dados_incompletos: [],
    },
    provenance: {
      run_id: "11111111-1111-4111-8111-111111111111",
      model: "anthropic/claude-sonnet-4",
      prompt_version: "v1",
      generated_at: "2026-07-15T09:30:00.000Z",
    },
    disclaimer:
      "Este material apresenta cenários e estruturas para análise profissional. A execução depende " +
      "de suitability, mandato, liquidez, custos, tributação e limites individuais de risco.",
    ...overrides,
  };
}

describe("buildMacroSummary", () => {
  it("extrai campos obrigatorios de um MorningCall valido", () => {
    const mc = makeMorningCall();
    const summary: MacroSummary = buildMacroSummary(mc);

    expect(summary.tradeDate).toBe("2026-07-15");
    expect(summary.generatedAt).toBe("2026-07-15T09:30:00.000Z");
    expect(summary.regime).toBe("goldilocks");
    expect(summary.vies).toBe("comprador");
    expect(summary.conviccao).toBe(7);
    expect(summary.tensaoMacroDominante).toBe(
      "Fed em compasso de espera, fiscal BR no foco",
    );
  });

  it("reflete mudanca de regime", () => {
    const mc = makeMorningCall();
    mc.abertura.regime = "recessivo";
    mc.abertura.vies = "vendedor";
    mc.abertura.conviccao = 9;

    const summary = buildMacroSummary(mc);
    expect(summary.regime).toBe("recessivo");
    expect(summary.vies).toBe("vendedor");
    expect(summary.conviccao).toBe(9);
  });

  it("reflete bias long_vol e short_vol", () => {
    for (const vies of ["long_vol", "short_vol"] as const) {
      const mc = makeMorningCall();
      mc.abertura.vies = vies;
      expect(buildMacroSummary(mc).vies).toBe(vies);
    }
  });

  it("cobre os 8 regimes", () => {
    const regimes = [
      "goldilocks",
      "reflacionario",
      "estagflacionario",
      "desinflacionario",
      "recessivo",
      "risk_on_especulativo",
      "risk_off_sistemico",
      "transicao",
    ] as const;

    for (const regime of regimes) {
      const mc = makeMorningCall();
      mc.abertura.regime = regime;
      expect(buildMacroSummary(mc).regime).toBe(regime);
    }
  });

  it("nao expoe trades", () => {
    const mc = makeMorningCall();
    const summary = buildMacroSummary(mc);
    // MacroSummary não tem campo trades — verificação estrutural
    expect("trades" in summary).toBe(false);
  });
});
