import { describe, expect, it } from "vitest";
import { buildMarketSnapshot, mergePoints } from "../../src/data/snapshot.js";
import type { DataProvider } from "../../src/data/types.js";
import type { DataPoint } from "../../src/schemas/data.js";

const RUN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function ok(key: string, value: number): DataPoint {
  return {
    status: "OK",
    key,
    quantity: { value, unit: "pct" },
    venue: "BR",
    source: { name: "mock", tier: 3, retrieved_at: "2026-07-15T09:30:00.000Z" },
    as_of: "2026-07-14T18:00:00.000Z",
    observed_at: "2026-07-15T09:30:00.000Z",
  };
}

function nd(key: string): DataPoint {
  return {
    status: "ND",
    key,
    venue: "BR",
    reason: "mock down",
    observed_at: "2026-07-15T09:30:00.000Z",
  };
}

describe("mergePoints", () => {
  it("OK substitui ND da mesma key", () => {
    const merged = mergePoints([[nd("SELIC_META")], [ok("SELIC_META", 15)]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.status).toBe("OK");
  });
});

describe("buildMarketSnapshot", () => {
  it("valida MarketSnapshot com provider mock", async () => {
    const mock: DataProvider = {
      name: "mock",
      // `Promise.resolve` em vez de `async`: o mock não espera nada, e marcá-lo `async` só para
      // casar com a assinatura esconde que ele é síncrono.
      fetch: () => Promise.resolve([ok("SELIC_META", 15), nd("VIX")]),
    };
    const snap = await buildMarketSnapshot({
      runId: RUN,
      tradeDate: "2026-07-15",
      observedAt: "2026-07-15T09:30:00.000Z",
      providers: [mock],
    });
    expect(snap.points).toHaveLength(2);
    expect(snap.trade_date).toBe("2026-07-15");
  });

  it("provider que falha vira ND se o provider devolver ND", async () => {
    const mock: DataProvider = {
      name: "fail",
      fetch: () => Promise.resolve([nd("USDBRL")]),
    };
    const snap = await buildMarketSnapshot({
      runId: RUN,
      tradeDate: "2026-07-15",
      observedAt: "2026-07-15T09:30:00.000Z",
      providers: [mock],
    });
    expect(snap.points[0]!.status).toBe("ND");
  });
});
