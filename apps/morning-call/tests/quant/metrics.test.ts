import { describe, expect, it } from "vitest";
import { computeAssetMetrics, type PriceBar } from "../../src/quant/metrics.js";
import { AssetMetrics } from "../../src/schemas/quant.js";

function bar(day: string, price: number, venue: PriceBar["venue"] = "BR"): PriceBar {
  return { t: `${day}T18:00:00.000Z`, price, venue };
}

describe("computeAssetMetrics — Venue / as_of (PC-1)", () => {
  it("preenche janela_as_of e observacoes no d1", () => {
    const series = [bar("2026-07-14", 100), bar("2026-07-15", 110)];
    const m = computeAssetMetrics({
      key: "IBOV",
      venue: "BR",
      unit: "index_points",
      series,
    });
    const d1 = m.retornos.find((r) => r.window === "d1");
    expect(d1).toBeDefined();
    expect(d1!.retorno.value).toBeCloseTo(0.1, 12);
    expect(d1!.janela_as_of.de).toBe("2026-07-14T18:00:00.000Z");
    expect(d1!.janela_as_of.ate).toBe("2026-07-15T18:00:00.000Z");
    expect(d1!.observacoes).toBe(2);
    expect(() => AssetMetrics.parse(m)).not.toThrow();
  });

  it("falha se d1 cruza venues sem allowCrossVenue", () => {
    const series: PriceBar[] = [bar("2026-07-14", 5000, "US"), bar("2026-07-15", 5100, "BR")];
    expect(() =>
      computeAssetMetrics({
        key: "BAD",
        venue: "BR",
        unit: "index_points",
        series,
      }),
    ).toThrow(/venue/);
  });

  it("falha se barra individual diverge do venue do ativo", () => {
    const series: PriceBar[] = [bar("2026-07-14", 100, "BR"), bar("2026-07-15", 101, "US")];
    expect(() =>
      computeAssetMetrics({
        key: "IBOV",
        venue: "BR",
        unit: "index_points",
        series,
      }),
    ).toThrow(/venue/);
  });

  it("allowCrossVenue=true permite proxy multi-praça com janela marcada", () => {
    const series: PriceBar[] = [bar("2026-07-14", 100, "US"), bar("2026-07-15", 105, "BR")];
    const m = computeAssetMetrics({
      key: "PROXY",
      venue: "BR",
      unit: "pct",
      series,
      allowCrossVenue: true,
    });
    const d1 = m.retornos.find((r) => r.window === "d1")!;
    expect(d1.retorno.value).toBeCloseTo(0.05, 12);
    expect(d1.janela_as_of.de).toContain("2026-07-14");
  });

  it("série curta omite d5 mas mantém d1 e m12", () => {
    const series = [bar("2026-07-13", 100), bar("2026-07-14", 101), bar("2026-07-15", 102)];
    const m = computeAssetMetrics({
      key: "X",
      venue: "BR",
      unit: "BRL",
      series,
    });
    expect(m.retornos.some((r) => r.window === "d1")).toBe(true);
    expect(m.retornos.some((r) => r.window === "d5")).toBe(false);
    expect(m.retornos.some((r) => r.window === "m12")).toBe(true);
    expect(m.vol_realizada_21d).toBeNull();
  });

  it("lança em série vazia ou fora de ordem", () => {
    expect(() => computeAssetMetrics({ key: "X", venue: "BR", unit: "BRL", series: [] })).toThrow(
      /vazia/,
    );
    expect(() =>
      computeAssetMetrics({
        key: "X",
        venue: "BR",
        unit: "BRL",
        series: [bar("2026-07-15", 1), bar("2026-07-14", 2)],
      }),
    ).toThrow(/cronológica/);
  });
});
