// Regressão do null-vs-zero no motor de sinais (B-004/B-005, 14/08/2026).
// Dado ausente (null) nunca pode votar favorável nem abrir o gate de risco.
import { describe, it, expect } from "vitest";
import { evaluateSwingSetup, type SwingInput } from "../src/index.js";

const base: SwingInput = {
  score: 60,
  regime: "ALTA",
  ret_20d: 5,
  rangePos_60d: 80,
  upDays_5: 4,
  ibovScore: 10,
  vixRiscoOff: false,
  symbolError: false,
};

describe("evaluateSwingSetup", () => {
  it("setup forte continua valido com dados presentes", () => {
    const r = evaluateSwingSetup(base);
    expect(r.valid).toBe(true);
    expect(r.direction).toBe("LONG");
    expect(r.reasons).toContain("ibovScore>=0");
  });

  it("ibovScore null falha a condicao de confluencia, nunca vota favoravel", () => {
    const r = evaluateSwingSetup({ ...base, ibovScore: null });
    expect(r.failed).toContain("ibovScore>=0");
    expect(r.reasons).not.toContain("ibovScore>=0");
  });

  it("ibovScore null no lado SHORT tambem nao vota favoravel", () => {
    const r = evaluateSwingSetup({
      ...base,
      score: -60,
      regime: "BAIXA",
      ret_20d: -5,
      rangePos_60d: 20,
      upDays_5: 1,
      ibovScore: null,
    });
    expect(r.failed).toContain("ibovScore<=0");
    expect(r.reasons).not.toContain("ibovScore<=0");
  });

  it("vix sem dado bloqueia o setup (fail-closed)", () => {
    const r = evaluateSwingSetup({ ...base, vixRiscoOff: null });
    expect(r.valid).toBe(false);
    expect(r.failed).toContain("vix sem dado");
  });

  it("vixRiscoOff false continua permitindo o setup", () => {
    const r = evaluateSwingSetup(base);
    expect(r.failed).not.toContain("vix RISCO");
  });

  it("vixRiscoOff true continua bloqueando com vix RISCO", () => {
    const r = evaluateSwingSetup({ ...base, vixRiscoOff: true });
    expect(r.failed).toContain("vix RISCO");
    expect(r.valid).toBe(false);
  });
});
