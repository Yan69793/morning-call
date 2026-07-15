import { describe, expect, it } from "vitest";
import {
  buildScoreboard,
  modelDailySeries,
  type BaselineDay,
  type TradeOutcome,
} from "../../src/report/scoreboard.js";

/** Dias úteis distintos, sem repetir data: baseline com data duplicada não é um dia, é um bug. */
function dias(n: number, bh = 0.001, focusErr: number | null = null): BaselineDay[] {
  return Array.from({ length: n }, (_, i) => ({
    trade_date: new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10),
    bh_pct: bh,
    null_pct: 0,
    focus_error_pct: focusErr,
  }));
}

function tradeEm(date: string, pnl: number, i = 0): TradeOutcome {
  return { tradeId: `${date}-${i}`, trade_date: date, pnl_pct: pnl, status: "alvo_1" };
}

describe("modelDailySeries: a agregação que torna o placar comparável", () => {
  it("dia sem trade rende zero, porque é o que não operar rende", () => {
    const bs = dias(3);
    const series = modelDailySeries([tradeEm(bs[1]!.trade_date, 0.05)], bs);
    expect(series).toEqual([0, 0.05, 0]);
  });

  it("vários trades no mesmo dia viram a média do dia, não linhas separadas", () => {
    const bs = dias(1);
    const d = bs[0]!.trade_date;
    const series = modelDailySeries([tradeEm(d, 0.1, 0), tradeEm(d, 0.2, 1)], bs);
    expect(series).toEqual([0.15000000000000002]);
  });
});

describe("buildScoreboard: leitura", () => {
  it("poucos pregões = fumaça, e a nota diz por quê", () => {
    const bs = dias(3);
    const s = buildScoreboard([tradeEm(bs[0]!.trade_date, 0.1)], bs, 25);
    expect(s.leitura).toBe("fumaca");
    expect(s.notas.join(" ")).toContain("teste de fumaça");
  });

  it("perdendo do B&H e do null = obviamente_quebrado", () => {
    const bs = dias(30, 0.001);
    const outcomes = bs.map((b) => tradeEm(b.trade_date, -0.02));
    const s = buildScoreboard(outcomes, bs, 25);
    expect(s.leitura).toBe("obviamente_quebrado");
  });

  it("batendo os baselines em média e em vol = sinal_candidato", () => {
    // B&H com vol real, senão o sharpe dele não existe e o ajuste a risco não é exercido.
    const bs: BaselineDay[] = dias(30).map((b, i) => ({
      ...b,
      bh_pct: i % 2 === 0 ? 0.002 : 0,
    }));
    // modelo: média maior E vol menor que o B&H
    const outcomes = bs.map((b, i) => tradeEm(b.trade_date, i % 2 === 0 ? 0.05 : 0.049));
    const s = buildScoreboard(outcomes, bs, 25);
    expect(s.leitura).toBe("sinal_candidato");
    expect(s.model_mean_daily).toBeGreaterThan(s.bh_mean_daily);
    expect(s.model_sharpe!).toBeGreaterThan(s.bh_sharpe!);
  });

  it("vol numericamente zero vira sharpe null, não 1.5 quadrilhão", () => {
    // Série constante: variância dá ~1e-19 por ponto flutuante, não 0 exato. Sem o epsilon, o
    // sharpe explodia para ~1e15 e era publicado como se fosse medida.
    const bs = dias(30, 0.001); // bh_pct constante
    const outcomes = bs.map((b) => tradeEm(b.trade_date, 0.05)); // pnl constante
    const s = buildScoreboard(outcomes, bs, 25);
    expect(s.bh_sharpe).toBeNull();
    expect(s.model_sharpe).toBeNull();
    expect(s.notas.join(" ")).toContain("sharpe indisponível");
  });

  it("ganha na média mas perde no risco = NÃO promove", () => {
    // O kill do plano exige bater o B&H *ajustado a risco*. Ganhar por média com vol muito maior
    // é alavancagem, não borda. Este é o teste que a versão anterior não tinha como passar,
    // porque ela nem calculava vol.
    const bs: BaselineDay[] = dias(30).map((b, i) => ({
      ...b,
      bh_pct: i % 2 === 0 ? 0.0011 : 0.0009, // B&H: média ~0.001, vol baixíssima
    }));
    // modelo: média 0.002 (o dobro do B&H) mas oscilando de -0.2 a +0.2
    const outcomes = bs.map((b, i) => tradeEm(b.trade_date, i % 2 === 0 ? 0.202 : -0.198));
    const s = buildScoreboard(outcomes, bs, 25);

    expect(s.model_mean_daily).toBeGreaterThan(s.bh_mean_daily); // ganha na média
    expect(s.model_sharpe!).toBeLessThan(s.bh_sharpe!); // perde no risco
    expect(s.leitura).toBe("fumaca"); // e por isso não é promovido
    expect(s.notas.join(" ")).toContain("ajuste a risco");
  });
});

describe("buildScoreboard: honestidade do placar", () => {
  it("trade em dia fora do baseline não some calado: vira nota", () => {
    const bs = dias(30);
    const outcomes = [...bs.map((b) => tradeEm(b.trade_date, 0.01)), tradeEm("2030-12-31", 9.99)];
    const s = buildScoreboard(outcomes, bs, 25);
    expect(s.n_trades).toBe(31);
    expect(s.notas.join(" ")).toContain("fora dos dias de baseline");
    // o 9.99 órfão não contamina a média
    expect(s.model_mean_daily).toBeCloseTo(0.01, 10);
  });

  it("conta dias fora do mercado: 3 trades em 30 pregões não é média de 3", () => {
    const bs = dias(30);
    const outcomes = [0, 1, 2].map((i) => tradeEm(bs[i]!.trade_date, 0.3));
    const s = buildScoreboard(outcomes, bs, 25);
    expect(s.n_days_com_trade).toBe(3);
    // média por trade seria 0.3; a diária honesta é 0.03, porque em 27 dias não houve posição
    expect(s.model_mean_daily).toBeCloseTo(0.03, 10);
  });

  it("Focus é reportado como erro médio e mantido fora do veredito", () => {
    const bs = dias(30, 0.001, 0.5);
    const outcomes = bs.map((b) => tradeEm(b.trade_date, 0.05));
    const s = buildScoreboard(outcomes, bs, 25);
    expect(s.focus_mean_abs_error).toBeCloseTo(0.5, 10);
    expect(s.focus_coverage_days).toBe(30);
    expect(s.notas.join(" ")).toContain("NÃO entra na leitura");
  });

  it("sem Focus, cobertura é zero e o erro é null, não zero", () => {
    const bs = dias(30);
    const s = buildScoreboard([], bs, 25);
    expect(s.focus_mean_abs_error).toBeNull();
    expect(s.focus_coverage_days).toBe(0);
  });
});
