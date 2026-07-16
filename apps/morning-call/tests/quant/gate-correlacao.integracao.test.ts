/**
 * Integração: série → buildQuantMetrics → gate.
 *
 * Os testes de `gates.test.ts` provam que o gate barra quando RECEBE `rho` alto, mas entregam a
 * correlação a mão. Os de `build.test.ts` provam que o motor CALCULA rho, mas param ali. Entre os
 * dois havia o bug que motivou este arquivo: o `workflow.ts` chamava `runGates` com
 * `correlacoes: []` chumbado, então a matriz era calculada e jogada fora. Os dois conjuntos
 * ficavam verdes e o gate seguia inerte em produção.
 *
 * Aqui a correlação NÃO é escrita a mão: sai do motor, a partir de séries, e vai para o gate.
 */
import { describe, expect, it } from "vitest";
import { decidirPublicacao } from "../../src/committee/decisao.js";
import { buildQuantMetrics, type AssetSeries } from "../../src/quant/build.js";
import type { PriceBar } from "../../src/quant/metrics.js";
import { sealTradeCard, TradeCardDraft, type TradeCard } from "../../src/schemas/trade.js";
import type { MarketSnapshot } from "../../src/schemas/data.js";
import type { Provenance } from "../../src/schemas/common.js";

const RUN_ID = "6f1c1f9a-0b3a-4c2e-9f5b-2a8d1e7c4a10";
const TRADE_DATE = "2026-07-15";
const TXT = "Texto suficientemente longo para satisfazer o Rationale de vinte caracteres.";

const prov: Provenance = {
  run_id: RUN_ID,
  model: "test/mock",
  prompt_version: "test@2026-07-16",
  generated_at: "2026-07-15T09:31:00.000Z",
};

const snapshotVazio: MarketSnapshot = {
  run_id: RUN_ID,
  trade_date: TRADE_DATE,
  taken_at: "2026-07-15T09:30:00.000Z",
  points: [
    {
      status: "ND",
      key: "USDBRL",
      venue: "BR",
      reason: "irrelevante para este teste",
      observed_at: "2026-07-15T09:30:00.000Z",
    },
  ],
};

function serie(precos: readonly number[], venue: PriceBar["venue"]): PriceBar[] {
  const base = Date.parse("2026-01-05T18:00:00.000Z");
  return precos.map((price, i) => ({
    t: new Date(base + i * 86_400_000).toISOString(),
    price,
    venue,
  }));
}

function ativoRate(key: string, precos: number[]): AssetSeries {
  return { key, venue: "US", unit: "pct", kind: "rate", series: serie(precos, "US") };
}

let seq = 0;
function tradeEm(instrumento: string, nome: string): TradeCard {
  seq += 1;
  const d = TradeCardDraft.parse({
    nome,
    classe: "juros",
    categoria: "direcional",
    horizonte: "swing",
    direcao: "comprar",
    entrada: {
      tipo: "preco",
      instrumento,
      nivel: { value: 4.5, unit: "pct" },
      faixa: { min: { value: 4.4, unit: "pct" }, max: { value: 4.6, unit: "pct" } },
    },
    alvo_1: { value: 4.9, unit: "pct" },
    alvo_2: { value: 5.2, unit: "pct" },
    invalidacao: { descricao: TXT, nivel: { value: 4.3, unit: "pct" } },
    tese: TXT,
    erro_precificacao: TXT,
    catalisador: TXT,
    por_que_agora: TXT,
    por_que_nao_consensual: TXT,
    riscos_ocultos: TXT,
    plano_saida: TXT,
    estrutura_alternativa: TXT,
    correlacao_com_outras: TXT,
    retorno_potencial: { value: 3.0, unit: "pct" },
    perda_maxima: { value: 1.0, unit: "pct" },
    sizing_pct_orcamento_risco: 15,
    conviccao: 7,
    fontes: ["U.S. Treasury"],
  });
  const id = `b2b6b0c1-7e2d-4f8a-8c31-9d4f0a5e6b${String(seq).padStart(2, "0")}`;
  return sealTradeCard(d, id, prov);
}

/** Duas séries que andam juntas: o segundo vértice é o primeiro mais um ruído pequeno. */
function paresRedundantes(): { a: AssetSeries; b: AssetSeries } {
  const base = Array.from({ length: 70 }, (_, i) => 4.2 + Math.sin(i / 4) * 0.15);
  const quaseIgual = base.map((v, i) => v + Math.sin(i * 7) * 0.005);
  return { a: ativoRate("UST_10Y", base), b: ativoRate("UST_30Y", quaseIgual) };
}

/**
 * LCG determinístico: o teste precisa ser reproduzível, e `Math.random` tornaria a asserção sobre
 * rho um sorteio — verde num dia, vermelho no outro.
 */
function pseudoAleatorio(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
}

/**
 * Dois passeios aleatórios independentes → rho ≈ 0.
 *
 * A primeira versão deste fixture alternava +0,05/−0,05 em oposição, o que não é independência: é
 * anticorrelação perfeita (rho = −1). O gate compara `Math.abs(rho)`, então barrou — e estava
 * certo. O teste pegou o erro do teste.
 */
function paresIndependentes(): { a: AssetSeries; b: AssetSeries } {
  const ra = pseudoAleatorio(12345);
  const rb = pseudoAleatorio(98765);
  let pa = 4.2;
  let pb = 4.5;
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 70; i++) {
    pa += ra() * 0.05;
    pb += rb() * 0.05;
    a.push(pa);
    b.push(pb);
  }
  return { a: ativoRate("UST_10Y", a), b: ativoRate("UST_30Y", b) };
}

describe("gate de correlação: cadeia real, do motor ao bloqueio", () => {
  it("acima de MAX_RHO: o motor mede rho > 0.7 e o gate barra o segundo trade", () => {
    const { a, b } = paresRedundantes();
    const metrics = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: TRADE_DATE,
      ativos: [a, b],
      janelaCorrelacao: 63,
    });

    // O rho não é escrito no teste: é medido pelo motor a partir das séries.
    expect(Math.abs(metrics.correlacoes_63d[0]!.rho)).toBeGreaterThan(0.7);

    const { published, gates } = decidirPublicacao({
      snapshot: snapshotVazio,
      claims: [],
      trades: [tradeEm("UST_10Y", "Long UST 10y"), tradeEm("UST_30Y", "Long UST 30y")],
      metrics,
    });

    expect(published).toHaveLength(1);
    expect(published[0]!.draft.nome).toBe("Long UST 10y");
    expect(gates.correlacionados).toEqual(["Long UST 30y"]);
  });

  it("o run inteiro é reprovado e o trade redundante é nomeado", () => {
    const { a, b } = paresRedundantes();
    const metrics = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: TRADE_DATE,
      ativos: [a, b],
      janelaCorrelacao: 63,
    });

    const { gates } = decidirPublicacao({
      snapshot: snapshotVazio,
      claims: [],
      trades: [tradeEm("UST_10Y", "Long UST 10y"), tradeEm("UST_30Y", "Long UST 30y")],
      metrics,
    });

    expect(gates.ok).toBe(false);
    expect(gates.reasons.join(" ")).toContain("Long UST 30y");
  });

  it("abaixo de MAX_RHO: os dois passam — o gate não é um filtro cego", () => {
    const { a, b } = paresIndependentes();
    const metrics = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: TRADE_DATE,
      ativos: [a, b],
      janelaCorrelacao: 63,
    });
    expect(Math.abs(metrics.correlacoes_63d[0]!.rho)).toBeLessThan(0.7);

    const { published, gates } = decidirPublicacao({
      snapshot: snapshotVazio,
      claims: [],
      trades: [tradeEm("UST_10Y", "Long UST 10y"), tradeEm("UST_30Y", "Long UST 30y")],
      metrics,
    });

    expect(published).toHaveLength(2);
    expect(gates.correlacionados).toEqual([]);
  });

  /**
   * REGRESSÃO do bug real: era assim que o workflow.ts chamava o gate — com a matriz vazia,
   * enquanto o quant calculava rho = 0,93 ao lado. Os dois redundantes passavam. Este teste
   * fixa que a diferença entre entregar e não entregar a correlação é observável.
   */
  it("REGRESSÃO: matriz vazia deixa passar o redundante que o motor reprovaria", () => {
    const { a, b } = paresRedundantes();
    const metricsReais = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: TRADE_DATE,
      ativos: [a, b],
      janelaCorrelacao: 63,
    });
    const trades = [tradeEm("UST_10Y", "Long UST 10y"), tradeEm("UST_30Y", "Long UST 30y")];
    const base = { snapshot: snapshotVazio, claims: [], trades };

    const comMatriz = decidirPublicacao({ ...base, metrics: metricsReais });
    const semMatriz = decidirPublicacao({ ...base, metrics: { correlacoes_63d: [] } });

    expect(comMatriz.published).toHaveLength(1);
    expect(semMatriz.published).toHaveLength(2);
  });

  it("série curta: rho é null, o gate não inventa e deixa passar", () => {
    const curta = Array.from({ length: 10 }, (_, i) => 4.2 + i * 0.01);
    const metrics = buildQuantMetrics({
      runId: RUN_ID,
      tradeDate: TRADE_DATE,
      ativos: [ativoRate("UST_10Y", curta), ativoRate("UST_30Y", curta)],
      janelaCorrelacao: 63,
    });
    expect(metrics.correlacoes_63d).toEqual([]);

    const { published } = decidirPublicacao({
      snapshot: snapshotVazio,
      claims: [],
      trades: [tradeEm("UST_10Y", "Long UST 10y"), tradeEm("UST_30Y", "Long UST 30y")],
      metrics,
    });
    expect(published).toHaveLength(2);
  });
});
