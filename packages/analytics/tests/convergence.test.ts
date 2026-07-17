import { describe, it, expect } from "vitest";
import {
  evaluateConvergence,
  findDailyConvergences,
  MACRO_REGIME_LEAN,
  type MacroContext,
  type MacroRegime,
} from "../src/index.js";
import type { RadarItem, Quality, Metrics, Regime } from "../src/types.js";

// ---------- helpers ----------

function defaultQuality(overrides: Partial<Quality> = {}): Quality {
  return {
    partialSession: false,
    missingBars: false,
    staleLastBar: false,
    flatRange: false,
    symbolError: false,
    ...overrides,
  };
}

function defaultMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    ret_1d: 2,
    ret_5d: 5,
    ret_20d: 10,
    ret_60d: 20,
    ret_120d: 30,
    rangePos_60d: 75,
    upDays_5: 4,
    ...overrides,
  };
}

function makeItem(
  symbol: string,
  name: string,
  score: number,
  regime: Regime,
  overrides: Partial<Pick<RadarItem, "quality" | "type" | "kind">> = {},
): RadarItem {
  return {
    symbol,
    name,
    type: "acao",
    kind: "stock",
    last: 100,
    metrics: defaultMetrics(),
    score,
    bias: { label: "forte", strength: "forte" },
    regime,
    alert: false,
    quality: overrides.quality ?? defaultQuality(),
  };
}

function macro(overrides: Partial<MacroContext> = {}): MacroContext {
  return {
    regime: "goldilocks",
    vies: "comprador",
    conviccao: 8,
    ...overrides,
  };
}

// ---------- MACRO_REGIME_LEAN ----------

describe("MACRO_REGIME_LEAN", () => {
  it("mapeia todos os 8 regimes", () => {
    const regimes: MacroRegime[] = [
      "goldilocks",
      "reflacionario",
      "estagflacionario",
      "desinflacionario",
      "recessivo",
      "risk_on_especulativo",
      "risk_off_sistemico",
      "transicao",
    ];
    for (const r of regimes) {
      expect(MACRO_REGIME_LEAN[r]).toBeDefined();
      expect(["risk_on", "risk_off", "neutro"]).toContain(MACRO_REGIME_LEAN[r]);
    }
  });
});

// ---------- evaluateConvergence ----------

describe("evaluateConvergence", () => {
  // --- piso de convicção ---

  it("conviccao 5 → nao alinhado independente do score", () => {
    const m = macro({ conviccao: 5, regime: "goldilocks", vies: "comprador" });
    const item = makeItem("PETR4", "Petrobras", 45, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
    expect(r.reasons.some((s) => s.includes("abaixo do piso"))).toBe(true);
  });

  it("conviccao 6 → piso exato passa", () => {
    const m = macro({ conviccao: 6, regime: "goldilocks", vies: "comprador" });
    const item = makeItem("PETR4", "Petrobras", 45, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  it("conviccao 10 → teto passa", () => {
    const m = macro({ conviccao: 10, regime: "goldilocks", vies: "comprador" });
    const item = makeItem("VALE3", "Vale", 50, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  // --- symbolError ---

  it("symbolError → nao alinhado, nunca excecao", () => {
    const m = macro();
    const item = makeItem("ERRO", "Erro", 50, "ALTA", {
      quality: defaultQuality({ symbolError: true }),
    });
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
    expect(r.reasons).toContain("symbolError");
  });

  // --- SEM_DADO ---

  it("regime SEM_DADO → nao alinhado", () => {
    const m = macro();
    const item = makeItem("WDOZ", "Mini Dolar", 50, "SEM_DADO" as never);
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
    expect(r.reasons.some((s) => s.includes("SEM_DADO"))).toBe(true);
  });

  // --- 8 regimes × item alinhado ---

  const riskOnRegimes: MacroRegime[] = [
    "goldilocks",
    "reflacionario",
    "desinflacionario",
    "risk_on_especulativo",
  ];

  const riskOffRegimes: MacroRegime[] = [
    "estagflacionario",
    "recessivo",
    "risk_off_sistemico",
  ];

  for (const regime of riskOnRegimes) {
    it(`regime ${regime} com score positivo → alinhado`, () => {
      const m = macro({ regime, vies: "neutro", conviccao: 7 });
      const item = makeItem("PETR4", "Petrobras", 50, "ALTA");
      const r = evaluateConvergence(m, item);
      expect(r.aligned).toBe(true);
      expect(r.direction).toBe("risk_on");
    });

    it(`regime ${regime} com score negativo → nao alinhado (direcao oposta)`, () => {
      const m = macro({ regime, vies: "neutro", conviccao: 7 });
      const item = makeItem("PETR4", "Petrobras", -50, "BAIXA");
      const r = evaluateConvergence(m, item);
      expect(r.aligned).toBe(false);
      expect(r.reasons.some((s) => s.includes("nao bate com macro"))).toBe(true);
    });
  }

  for (const regime of riskOffRegimes) {
    it(`regime ${regime} com score negativo → alinhado`, () => {
      const m = macro({ regime, vies: "neutro", conviccao: 7 });
      const item = makeItem("CMIG4", "Cemig", -45, "BAIXA");
      const r = evaluateConvergence(m, item);
      expect(r.aligned).toBe(true);
      expect(r.direction).toBe("risk_off");
    });

    it(`regime ${regime} com score positivo → nao alinhado`, () => {
      const m = macro({ regime, vies: "neutro", conviccao: 7 });
      const item = makeItem("CMIG4", "Cemig", 45, "ALTA");
      const r = evaluateConvergence(m, item);
      expect(r.aligned).toBe(false);
      expect(r.reasons.some((s) => s.includes("nao bate com macro"))).toBe(true);
    });
  }

  // --- transicao (neutro) ---

  it("regime transicao com vies neutro → nunca alinhado", () => {
    const m = macro({ regime: "transicao", vies: "neutro", conviccao: 7 });
    const item = makeItem("PETR4", "Petrobras", 50, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
    expect(r.direction).toBe("neutro");
  });

  it("regime transicao com vies comprador → alinhado com score positivo", () => {
    const m = macro({ regime: "transicao", vies: "comprador", conviccao: 7 });
    const item = makeItem("PETR4", "Petrobras", 50, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.direction).toBe("risk_on");
  });

  // --- conflito regime × vies (vies prevalece) ---

  it("regime risk_off_sistemico + vies comprador → prevalece vies → risk_on", () => {
    const m = macro({ regime: "risk_off_sistemico", vies: "comprador", conviccao: 8 });
    const item = makeItem("VALE3", "Vale", 45, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.direction).toBe("risk_on");
  });

  it("regime goldilocks + vies vendedor → prevalece vies → risk_off", () => {
    const m = macro({ regime: "goldilocks", vies: "vendedor", conviccao: 8 });
    const item = makeItem("CMIG4", "Cemig", -45, "BAIXA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.direction).toBe("risk_off");
  });

  it("regime goldilocks + vies vendedor + score positivo → nao alinhado", () => {
    const m = macro({ regime: "goldilocks", vies: "vendedor", conviccao: 8 });
    const item = makeItem("PETR4", "Petrobras", 45, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
  });

  // --- long_vol / short_vol ---

  it("vies long_vol → risk_on", () => {
    const m = macro({ regime: "recessivo", vies: "long_vol", conviccao: 7 });
    const item = makeItem("VXX", "VIX Short-Term", 40, "TRANQUILO");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.direction).toBe("risk_on");
  });

  it("vies short_vol → risk_off", () => {
    const m = macro({ regime: "goldilocks", vies: "short_vol", conviccao: 7 });
    const item = makeItem("PETR4", "Petrobras", -50, "BAIXA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.direction).toBe("risk_off");
  });

  // --- regimes técnicos especiais ---

  it("regime TRANQUILO com score forte → alinhado via score", () => {
    const m = macro({ regime: "goldilocks", vies: "comprador", conviccao: 7 });
    const item = makeItem("ITUB4", "Itau Unibanco", 45, "TRANQUILO");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  it("regime TRANQUILO com score fraco → nao alinhado", () => {
    const m = macro({ regime: "goldilocks", vies: "comprador", conviccao: 7 });
    const item = makeItem("ITUB4", "Itau Unibanco", 30, "TRANQUILO");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
  });

  it("regime RISCO com score forte → alinhado via score", () => {
    const m = macro({ regime: "estagflacionario", vies: "vendedor", conviccao: 7 });
    const item = makeItem("VXX", "VIX", -50, "RISCO" as Regime);
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  it("regime ATENCAO com score forte → alinhado via score", () => {
    const m = macro({ regime: "risk_off_sistemico", vies: "vendedor", conviccao: 7 });
    const item = makeItem("VXX", "VIX", -45, "ATENCAO" as Regime);
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  // --- score no limiar ---

  it("score = 40 → alinhado (limiar exato)", () => {
    const m = macro({ regime: "goldilocks", vies: "comprador", conviccao: 7 });
    const item = makeItem("PETR4", "Petrobras", 40, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  it("score = -40 → alinhado (limiar exato)", () => {
    const m = macro({ regime: "recessivo", vies: "vendedor", conviccao: 7 });
    const item = makeItem("CMIG4", "Cemig", -40, "BAIXA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
  });

  it("score = 39 → nao alinhado (abaixo do limiar)", () => {
    const m = macro({ regime: "goldilocks", vies: "comprador", conviccao: 7 });
    const item = makeItem("PETR4", "Petrobras", 39, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
    expect(r.reasons.some((s) => s.includes("abaixo do limiar"))).toBe(true);
  });

  it("score = -39 → nao alinhado (abaixo do limiar)", () => {
    const m = macro({ regime: "recessivo", vies: "vendedor", conviccao: 7 });
    const item = makeItem("CMIG4", "Cemig", -39, "BAIXA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(false);
    expect(r.reasons.some((s) => s.includes("abaixo do limiar"))).toBe(true);
  });

  // --- regime BAIXA com macro risk_on → divergência documentada, mas score positivo ainda alinha ---
  // O campo `reasons` documenta a divergência entre regime técnico e macro

  it("regime BAIXA + macro risk_on + score positivo → alinhado com ressalva", () => {
    const m = macro({ regime: "goldilocks", vies: "comprador", conviccao: 8 });
    const item = makeItem("BBAS3", "Banco do Brasil", 50, "BAIXA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.reasons.some((s) => s.includes("BAIXA diverge"))).toBe(true);
  });

  it("regime ALTA + macro risk_off + score negativo → alinhado com ressalva", () => {
    const m = macro({ regime: "recessivo", vies: "vendedor", conviccao: 8 });
    const item = makeItem("LWSA3", "Locaweb", -50, "ALTA");
    const r = evaluateConvergence(m, item);
    expect(r.aligned).toBe(true);
    expect(r.reasons.some((s) => s.includes("ALTA diverge"))).toBe(true);
  });
});

// ---------- findDailyConvergences ----------

describe("findDailyConvergences", () => {
  it("conviccao abaixo do piso → array vazio", () => {
    const m = macro({ conviccao: 4 });
    const items = [
      makeItem("PETR4", "Petrobras", 45, "ALTA"),
      makeItem("VALE3", "Vale", 50, "ALTA"),
    ];
    const results = findDailyConvergences(m, items);
    expect(results).toEqual([]);
  });

  it("items vazio → array vazio", () => {
    const m = macro({ conviccao: 8 });
    const results = findDailyConvergences(m, []);
    expect(results).toEqual([]);
  });

  it("mistura de alinhados e nao alinhados → retorna so alinhados", () => {
    const m = macro({ regime: "goldilocks", vies: "comprador", conviccao: 8 });
    const items = [
      makeItem("PETR4", "Petrobras", 50, "ALTA"),    // alinhado
      makeItem("VALE3", "Vale", -50, "BAIXA"),        // não alinhado (direção oposta)
      makeItem("ITUB4", "Itau Unibanco", 45, "ALTA"), // alinhado
      makeItem("CMIG4", "Cemig", -45, "BAIXA"),       // não alinhado
    ];
    const results = findDailyConvergences(m, items);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.symbol)).toEqual(["PETR4", "ITUB4"]);
  });

  it("todos nao alinhados → array vazio", () => {
    const m = macro({ regime: "recessivo", vies: "vendedor", conviccao: 8 });
    const items = [
      makeItem("PETR4", "Petrobras", 50, "ALTA"),     // direção oposta
      makeItem("VALE3", "Vale", 45, "ALTA"),           // direção oposta
    ];
    const results = findDailyConvergences(m, items);
    expect(results).toEqual([]);
  });

  it("symbolError → nao quebra findDailyConvergences", () => {
    const m = macro({ conviccao: 8 });
    const items = [
      makeItem("ERRO", "Erro", 50, "ALTA", { quality: defaultQuality({ symbolError: true }) }),
      makeItem("PETR4", "Petrobras", 45, "ALTA"),
    ];
    const results = findDailyConvergences(m, items);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("PETR4");
  });
});
