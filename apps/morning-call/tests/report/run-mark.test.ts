import { describe, expect, it } from "vitest";
import { runMarkCron } from "../../src/report/run-mark.js";
import type { MarkCronDeps, OpenTradeForMark } from "../../src/report/run-mark.js";
import type { TradeMarkRow } from "../../src/report/mark.js";
import type { DataPoint } from "../../src/schemas/data.js";

const TRADE_DATE = "2026-08-17";
const MARKED_AT = "2026-08-17T21:30:00.000Z";

function okPoint(value: number): DataPoint {
  return {
    status: "OK",
    key: "USDBRL",
    quantity: { value, unit: "BRL_por_USD" },
    venue: "BR",
    source: { name: "BCB SGS 1", tier: 1, url: "https://x", retrieved_at: MARKED_AT },
    as_of: MARKED_AT,
    observed_at: MARKED_AT,
  };
}

function ndPoint(reason: string): DataPoint {
  return { status: "ND", key: "?", venue: "BR", reason, observed_at: MARKED_AT };
}

function depsWith(opts: {
  trades: OpenTradeForMark[];
  price?: (instrumento: string) => DataPoint;
  saved?: TradeMarkRow[];
}): MarkCronDeps {
  const saved = opts.saved ?? [];
  return {
    getOpenTrades: () => Promise.resolve(opts.trades),
    fetchPrice: (instrumento) => Promise.resolve(opts.price ? opts.price(instrumento) : okPoint(5.2)),
    saveMark: (row) => {
      saved.push(row);
      return Promise.resolve();
    },
  };
}

const tradeBase: OpenTradeForMark = {
  id: "t1",
  direcao: "comprar",
  entrada: 5.1,
  alvo_1: 5.2,
  alvo_2: 5.3,
  invalidacao: 5.0,
  instrumento: "USDBRL",
};

describe("runMarkCron", () => {
  it("marca trade tipo preco com preço resolvido", async () => {
    const saved: TradeMarkRow[] = [];
    // 5.15 fica entre a entrada (5.1) e o alvo_1 (5.2): status "aberto", não bate alvo.
    const deps = depsWith({ trades: [tradeBase], price: () => okPoint(5.15), saved });
    const result = await runMarkCron(TRADE_DATE, MARKED_AT, deps);
    expect(result.marcados).toEqual(["t1"]);
    expect(result.pulados).toEqual([]);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.status).toBe("aberto");
    expect(saved[0]!.preco).toBe(5.15);
  });

  it("pula trade sem instrumento (spread/premio) sem tentar buscar preço", async () => {
    let priceCalled = false;
    const deps = depsWith({
      trades: [{ ...tradeBase, instrumento: null }],
      price: () => {
        priceCalled = true;
        return okPoint(5.25);
      },
    });
    const result = await runMarkCron(TRADE_DATE, MARKED_AT, deps);
    expect(result.marcados).toEqual([]);
    expect(result.pulados).toHaveLength(1);
    expect(result.pulados[0]!.motivo).toContain("spread/premio");
    expect(priceCalled).toBe(false);
  });

  it("pula trade quando o preço volta ND, sem persistir", async () => {
    const saved: TradeMarkRow[] = [];
    const deps = depsWith({
      trades: [tradeBase],
      price: () => ndPoint("sem fonte de preço configurada para EURUSD"),
      saved,
    });
    const result = await runMarkCron(TRADE_DATE, MARKED_AT, deps);
    expect(result.marcados).toEqual([]);
    expect(result.pulados[0]!.motivo).toContain("sem fonte");
    expect(saved).toHaveLength(0);
  });

  it("carrega mae/mfe anterior para o novo mark", async () => {
    const saved: TradeMarkRow[] = [];
    const deps = depsWith({
      trades: [{ ...tradeBase, maePrev: -0.03, mfePrev: 0.01 }],
      price: () => okPoint(5.0), // abaixo da entrada 5.1 → pnl negativo
      saved,
    });
    await runMarkCron(TRADE_DATE, MARKED_AT, deps);
    // mae acumulado não pode ficar menos negativo que o mae anterior
    expect(saved[0]!.mae_pct).toBeLessThanOrEqual(-0.03);
  });

  it("múltiplos trades: mistura marcados e pulados no mesmo ciclo", async () => {
    const saved: TradeMarkRow[] = [];
    const deps = depsWith({
      trades: [tradeBase, { ...tradeBase, id: "t2", instrumento: "EURUSD" }],
      price: (instrumento) =>
        instrumento === "USDBRL" ? okPoint(5.25) : ndPoint("sem fonte de preço configurada para EURUSD"),
      saved,
    });
    const result = await runMarkCron(TRADE_DATE, MARKED_AT, deps);
    expect(result.marcados).toEqual(["t1"]);
    expect(result.pulados.map((p) => p.tradeId)).toEqual(["t2"]);
  });
});
