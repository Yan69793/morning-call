import { describe, expect, it } from "vitest";
import { buildSnapshotIndex, crossCheckClaims } from "../../src/committee/crossCheck.js";
import type { MarketSnapshot, QuantClaim } from "../../src/schemas/index.js";

const RUN_ID = "6f1c1f9a-0b3a-4c2e-9f5b-2a8d1e7c4a10";

/** Snapshot com dois pontos OK e um N/D — o N/D não pode entrar no índice. */
function snapshot(): MarketSnapshot {
  return {
    run_id: RUN_ID,
    trade_date: "2026-07-15",
    taken_at: "2026-07-15T09:30:00.000Z",
    points: [
      {
        status: "OK",
        key: "USDBRL",
        quantity: { value: 5.0742, unit: "BRL_por_USD" },
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
      {
        status: "ND",
        key: "VOL_IMPL_USDBRL_1M",
        venue: "BR",
        reason: "provedor pago, sem acesso no v1",
        observed_at: "2026-07-15T09:20:00.000Z",
      },
    ],
  };
}

const claim = (
  snapshot_key: string,
  value: number,
  unit: QuantClaim["valor_citado"]["unit"],
): QuantClaim => ({ snapshot_key, valor_citado: { value, unit } });

describe("buildSnapshotIndex", () => {
  it("indexa só os pontos OK e ignora N/D", () => {
    const idx = buildSnapshotIndex(snapshot());
    expect(idx.size).toBe(2);
    expect(idx.get("USDBRL")).toEqual({ value: 5.0742, unit: "BRL_por_USD" });
    expect(idx.has("VOL_IMPL_USDBRL_1M")).toBe(false);
  });
});

describe("crossCheckClaims", () => {
  const idx = buildSnapshotIndex(snapshot());

  it("aprova quando o número citado bate com o snapshot", () => {
    const r = crossCheckClaims([claim("USDBRL", 5.0742, "BRL_por_USD")], idx);
    expect(r.ok).toBe(true);
    expect(r.verificados).toBe(1);
    expect(r.violations).toHaveLength(0);
  });

  it("tolera o arredondamento de exibição dentro da tolerância default", () => {
    // 5,07 contra 5,0742: diferença relativa ~0,08%, abaixo dos 0,5% default.
    const r = crossCheckClaims([claim("USDBRL", 5.07, "BRL_por_USD")], idx);
    expect(r.ok).toBe(true);
  });

  it("pega o erro de ordem de grandeza (Selic 15,00 citada como 1,50)", () => {
    const r = crossCheckClaims([claim("SELIC_META", 1.5, "pct")], idx);
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.kind).toBe("valor_divergente");
    expect(r.violations[0]!.esperado).toEqual({ value: 15.0, unit: "pct" });
  });

  it("rejeita chave que não existe no snapshot", () => {
    const r = crossCheckClaims([claim("IBOV", 133000, "index_points")], idx);
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.kind).toBe("chave_ausente");
    expect(r.violations[0]!.esperado).toBeNull();
  });

  it("trata citar um ponto N/D como chave ausente", () => {
    const r = crossCheckClaims([claim("VOL_IMPL_USDBRL_1M", 12, "pct")], idx);
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.kind).toBe("chave_ausente");
  });

  it("rejeita unidade trocada mesmo com valor idêntico", () => {
    const r = crossCheckClaims([claim("USDBRL", 5.0742, "pct")], idx);
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.kind).toBe("unidade_divergente");
  });

  it("com tolerância zero, exige citação exata e reprova o arredondamento", () => {
    const r = crossCheckClaims([claim("USDBRL", 5.07, "BRL_por_USD")], idx, { relTol: 0, absTol: 0 });
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.kind).toBe("valor_divergente");
  });

  it("acumula violações de várias afirmações em vez de parar na primeira", () => {
    const r = crossCheckClaims(
      [
        claim("USDBRL", 5.0742, "BRL_por_USD"), // ok
        claim("SELIC_META", 1.5, "pct"), // valor
        claim("IBOV", 1, "index_points"), // chave
      ],
      idx,
    );
    expect(r.verificados).toBe(3);
    expect(r.violations).toHaveLength(2);
  });

  it("lista vazia é aprovação trivial", () => {
    const r = crossCheckClaims([], idx);
    expect(r.ok).toBe(true);
    expect(r.verificados).toBe(0);
  });
});
