import { describe, expect, it } from "vitest";
import { fetchInstrumentPrice } from "../../src/data/prices.js";

const OBSERVED = "2026-08-17T21:30:00.000Z";

function fetchFnWith(body: unknown, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("fetchInstrumentPrice", () => {
  it("USDBRL resolve via BCB SGS", async () => {
    const fetchFn = fetchFnWith([{ data: "17/08/2026", valor: "5.42" }]);
    const p = await fetchInstrumentPrice("USDBRL", "2026-08-17", OBSERVED, fetchFn);
    expect(p.status).toBe("OK");
    if (p.status === "OK") {
      expect(p.quantity.value).toBeCloseTo(5.42, 6);
      expect(p.quantity.unit).toBe("BRL_por_USD");
    }
  });

  it("instrumento sem fonte configurada volta ND sem chamar rede", async () => {
    let called = false;
    const fetchFn = (() => {
      called = true;
      return Promise.resolve(new Response("[]"));
    }) as unknown as typeof fetch;
    const p = await fetchInstrumentPrice("EURUSD", "2026-08-17", OBSERVED, fetchFn);
    expect(p.status).toBe("ND");
    if (p.status === "ND") expect(p.reason).toContain("EURUSD");
    expect(called).toBe(false);
  });

  it("falha de rede vira ND, nunca lança", async () => {
    const fetchFn = (() => Promise.reject(new Error("timeout"))) as unknown as typeof fetch;
    const p = await fetchInstrumentPrice("USDBRL", "2026-08-17", OBSERVED, fetchFn);
    expect(p.status).toBe("ND");
    if (p.status === "ND") expect(p.reason).toContain("timeout");
  });

  it("série vazia vira ND", async () => {
    const fetchFn = fetchFnWith([]);
    const p = await fetchInstrumentPrice("USDBRL", "2026-08-17", OBSERVED, fetchFn);
    expect(p.status).toBe("ND");
  });
});
