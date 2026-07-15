import { describe, expect, it } from "vitest";
import { markTrade } from "../../src/report/mark.js";

const base = {
  tradeId: "t1",
  direcao: "comprar" as const,
  entrada: 100,
  alvo_1: 110,
  alvo_2: 120,
  invalidacao: 90,
  markDate: "2026-07-15",
  markedAt: "2026-07-15T21:30:00.000Z",
  fontePreco: "mock",
};

describe("markTrade", () => {
  it("pnl positivo compra e status aberto", () => {
    const m = markTrade({ ...base, preco: 105 });
    expect(m.pnl_pct).toBeCloseTo(0.05, 12);
    expect(m.status).toBe("aberto");
    expect(m.mfe_pct).toBeCloseTo(0.05, 12);
  });

  it("atinge alvo_1", () => {
    expect(markTrade({ ...base, preco: 110 }).status).toBe("alvo_1");
  });

  it("atinge alvo_2", () => {
    expect(markTrade({ ...base, preco: 120 }).status).toBe("alvo_2");
  });

  it("invalidado", () => {
    expect(markTrade({ ...base, preco: 90 }).status).toBe("invalidado");
  });

  it("expirado tem prioridade de status", () => {
    expect(markTrade({ ...base, preco: 105, expirado: true }).status).toBe("expirado");
  });

  it("venda inverte pnl", () => {
    const m = markTrade({
      ...base,
      direcao: "vender",
      alvo_1: 90,
      alvo_2: 80,
      invalidacao: 110,
      preco: 95,
    });
    expect(m.pnl_pct).toBeCloseTo(0.05, 12);
  });
});
