import { describe, expect, it } from "vitest";
import {
  alinharPorDia,
  buildQuantMetrics,
  correlacaoDeVariacoes,
  variacoes,
  type AssetSeries,
} from "../../src/quant/build.js";
import type { PriceBar } from "../../src/quant/metrics.js";
import { QuantMetrics } from "../../src/schemas/quant.js";

const RUN_ID = "00000000-0000-4000-8000-000000000000";

/** Série diária sintética com datas de calendário reais (dia a dia a partir de 05/01/2026). */
function serie(
  precos: readonly number[],
  venue: PriceBar["venue"] = "BR",
  desde = "2026-01-05",
): PriceBar[] {
  const base = Date.parse(`${desde}T18:00:00.000Z`);
  return precos.map((price, i) => ({
    t: new Date(base + i * 86_400_000).toISOString(),
    price,
    venue,
  }));
}

function ativo(key: string, precos: number[], kind: "price" | "rate" = "price"): AssetSeries {
  return {
    key,
    venue: "BR",
    unit: kind === "price" ? "BRL_por_USD" : "pct",
    kind,
    series: serie(precos),
  };
}

describe("variacoes", () => {
  it("preço vira log-retorno", () => {
    const v = variacoes(serie([100, 110]), "price");
    expect(v[0]).toBeCloseTo(Math.log(1.1), 10);
  });

  /**
   * O erro que esta flag existe para impedir: um UST 2Y indo de 3,47 para 4,18 não subiu 20%,
   * subiu 71 bps. Tratar taxa como preço produz um número sem significado financeiro.
   */
  it("taxa vira diferença absoluta, não retorno percentual", () => {
    const v = variacoes(serie([3.47, 4.18]), "rate");
    expect(v[0]).toBeCloseTo(0.71, 10);
    expect(v[0]).not.toBeCloseTo(4.18 / 3.47 - 1, 4);
  });
});

describe("alinharPorDia", () => {
  it("pareia por data e descarta dia sem par (feriado numa praça)", () => {
    const a: PriceBar[] = [
      { t: "2026-03-01T18:00:00.000Z", price: 1, venue: "BR" },
      { t: "2026-03-02T18:00:00.000Z", price: 2, venue: "BR" },
      { t: "2026-03-03T18:00:00.000Z", price: 3, venue: "BR" },
    ];
    const b: PriceBar[] = [
      { t: "2026-03-01T18:00:00.000Z", price: 10, venue: "US" },
      { t: "2026-03-03T18:00:00.000Z", price: 30, venue: "US" },
    ];
    const out = alinharPorDia(a, b);
    expect(out.a.map((x) => x.price)).toEqual([1, 3]);
    expect(out.b.map((x) => x.price)).toEqual([10, 30]);
  });
});

describe("correlacaoDeVariacoes", () => {
  it("séries idênticas → rho ≈ 1", () => {
    const precos = Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 5);
    const rho = correlacaoDeVariacoes(ativo("A", precos), ativo("B", precos), 63);
    expect(rho).toBeCloseTo(1, 6);
  });

  /**
   * Em `rate` a variação é a diferença, que é linear: o espelho `200 − p` dá exatamente o delta
   * oposto, então rho é −1 cravado. Com `price` daria ≈ −0,999, porque log-retorno de uma série
   * espelhada não é o oposto exato do original — a não-linearidade do log come a última casa.
   */
  it("séries espelhadas → rho = -1", () => {
    const base = Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 5);
    const espelho = base.map((p) => 200 - p);
    const rho = correlacaoDeVariacoes(ativo("A", base, "rate"), ativo("B", espelho, "rate"), 63);
    expect(rho).toBeCloseTo(-1, 10);
  });

  /**
   * Correlação de NÍVEL entre duas séries com tendência dá perto de 1 mesmo sem relação. Se o
   * cálculo fosse sobre níveis, o gate barraria dois trades independentes como redundantes.
   */
  it("usa variação, não nível: tendências independentes não viram rho alto", () => {
    // Duas rampas para cima, mas com ruído diário independente e alternado.
    const a = Array.from({ length: 70 }, (_, i) => 100 + i + (i % 2 === 0 ? 3 : -3));
    const b = Array.from({ length: 70 }, (_, i) => 100 + i + (i % 2 === 0 ? -3 : 3));
    const rho = correlacaoDeVariacoes(ativo("A", a), ativo("B", b), 63);
    expect(rho).not.toBeNull();
    expect(rho!).toBeLessThan(0); // nível seria ~+1; variação revela a oposição diária
  });

  it("janela incompleta → null (não sei ≠ correlação zero)", () => {
    const curta = Array.from({ length: 10 }, (_, i) => 100 + i);
    expect(correlacaoDeVariacoes(ativo("A", curta), ativo("B", curta), 63)).toBeNull();
  });
});

describe("buildQuantMetrics", () => {
  const precos = Array.from({ length: 70 }, (_, i) => 5 + Math.sin(i / 3) * 0.1);

  it("produz QuantMetrics que valida contra o schema", () => {
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      ativos: [ativo("USDBRL", precos)],
      faltantes: ["VIX"],
    });
    expect(() => QuantMetrics.parse(m)).not.toThrow();
  });

  it("ativo ganha retornos, vol e drawdown — o motor deixa de ser código morto", () => {
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      ativos: [ativo("USDBRL", precos)],
    });
    expect(m.ativos).toHaveLength(1);
    expect(m.ativos[0]!.retornos.length).toBeGreaterThan(0);
    expect(m.ativos[0]!.vol_realizada_21d).not.toBeNull();
    expect(m.ativos[0]!.drawdown_12m).not.toBeNull();
  });

  it("correlação par a par alimenta o gate (era sempre [], MAX_RHO nunca barrava)", () => {
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      ativos: [ativo("A", precos), ativo("B", precos)],
    });
    expect(m.correlacoes_63d).toHaveLength(1);
    expect(m.correlacoes_63d[0]!.rho).toBeCloseTo(1, 6);
  });

  /**
   * Taxa não vira AssetMetrics: `simpleReturn` sobre 4,18 → 4,13 daria "d1 = −1,20%", quando o
   * fato é −5 bps. O lugar da taxa é `curvas`. Verificado contra o feed real: o UST_2Y publicava
   * exatamente esse −1,20% ao lado do retorno de câmbio, convidando à comparação errada.
   */
  it("taxa não entra em `ativos` (retorno % de taxa não é informação)", () => {
    const taxas = Array.from({ length: 70 }, (_, i) => 4.2 + Math.sin(i / 5) * 0.1);
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      ativos: [ativo("USDBRL", precos, "price"), ativo("UST_2Y", taxas, "rate")],
    });
    expect(m.ativos.map((a) => a.key)).toEqual(["USDBRL"]);
  });

  it("mas taxa continua na correlação: é adimensional, e o gate precisa dela", () => {
    const taxas = Array.from({ length: 70 }, (_, i) => 4.2 + Math.sin(i / 5) * 0.1);
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      ativos: [ativo("USDBRL", precos, "price"), ativo("UST_2Y", taxas, "rate")],
    });
    expect(m.correlacoes_63d).toHaveLength(1);
    expect(m.correlacoes_63d[0]).toMatchObject({ a: "USDBRL", b: "UST_2Y" });
  });

  it("curva UST: delta_1d em bps, inclinação e curvatura", () => {
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      curvas: [
        {
          curva: "UST",
          vertices: [
            { rotulo: "UST_2Y", prazo_du: 504, series: serie([4.1, 4.18], "US") },
            { rotulo: "UST_10Y", prazo_du: 2520, series: serie([4.5, 4.58], "US") },
            { rotulo: "UST_30Y", prazo_du: 7560, series: serie([5.0, 5.08], "US") },
          ],
        },
      ],
    });
    expect(m.curvas).toHaveLength(1);
    const c = m.curvas[0]!;
    expect(c.vertices[0]!.delta_1d.value).toBeCloseTo(8, 6); // +0,08 pp = 8 bps
    // "longo menos curto" (schemas/quant.ts): com 2/10/30 é 30Y − 2Y = 5,08 − 4,18 = 90 bps.
    expect(c.inclinacao.value).toBeCloseTo(90, 6);
    // butterfly = 2·meio − curto − longo, com o meio sendo o 10Y.
    expect(c.curvatura.value).toBeCloseTo((2 * 4.58 - 4.18 - 5.08) * 100, 6);
    expect(() => QuantMetrics.parse(m)).not.toThrow();
  });

  it("curva com menos de 2 vértices é omitida, não inventada", () => {
    const m = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: "2026-03-10",
      curvas: [
        {
          curva: "UST",
          vertices: [{ rotulo: "UST_2Y", prazo_du: 504, series: serie([4.1, 4.18], "US") }],
        },
      ],
    });
    expect(m.curvas).toEqual([]);
  });

  it("sem séries, devolve estrutura vazia válida em vez de explodir", () => {
    const m = buildQuantMetrics({ runId: RUN_ID, tradeDate: "2026-03-10", faltantes: ["USDBRL"] });
    expect(m.ativos).toEqual([]);
    expect(m.correlacoes_63d).toEqual([]);
    expect(m.faltantes).toEqual(["USDBRL"]);
    expect(() => QuantMetrics.parse(m)).not.toThrow();
  });
});
