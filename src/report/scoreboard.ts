/**
 * Placar Portão 1: modelo × B&H × null × consenso.
 *
 * Este é o instrumento que decide se o projeto morre. Ele não pode ter falsa precisão, porque é
 * o único número do sistema que não tem outro número para conferi-lo.
 *
 * Duas regras estruturais:
 *  - **Tudo em retorno diário.** A versão anterior comparava média por trade (÷ n_trades) contra
 *    média por dia (÷ n_days). Com 3 trades/dia em 25 pregões, isso comparava a média de 75
 *    trades com a de 25 dias e chamava de placar. Denominadores diferentes, veredito sem sentido.
 *  - **Dia sem trade conta como zero, não some da conta.** "NÃO OPERAR É A MELHOR OPERAÇÃO" tem
 *    que aparecer no placar. Um modelo que opera 3 dias em 25 e acerta tem média por trade alta
 *    e média diária baixa; a diária é a honesta, porque é ela que você teria embolsado.
 *
 * N baixo = fumaça: nunca declarar borda com N de smoke test.
 */

export interface TradeOutcome {
  tradeId: string;
  /** Pregão a que este resultado pertence. Sem isto não há como agregar por dia. */
  trade_date: string;
  pnl_pct: number;
  status: string;
}

export interface BaselineDay {
  trade_date: string;
  /** Retorno diário do B&H do ativo de referência. */
  bh_pct: number;
  /** Não fazer nada. Zero por definição; existe como campo para ficar explícito no placar. */
  null_pct: number;
  /** Erro do consenso (Focus) vs realizado, quando disponível. Ver `notas`: não entra na leitura. */
  focus_error_pct: number | null;
}

export type Leitura = "fumaca" | "obviamente_quebrado" | "sinal_candidato";

export interface Scoreboard {
  n_trades: number;
  n_days: number;
  /** Dias em que o modelo teve ao menos um trade. n_days - n_days_com_trade = dias fora. */
  n_days_com_trade: number;

  /** Médias, todas na mesma base: retorno diário. */
  model_mean_daily: number;
  bh_mean_daily: number;
  null_mean_daily: number;

  /** Retorno sobre volatilidade (sem taxa livre de risco). null quando N < 2 ou vol zero. */
  model_sharpe: number | null;
  bh_sharpe: number | null;

  /** Consenso, reportado mas fora do veredito. Ver `notas`. */
  focus_mean_abs_error: number | null;
  focus_coverage_days: number;

  leitura: Leitura;
  smoke_n: number;
  /** Limitações que viajam junto com o número, em vez de morrer num comentário de código. */
  notas: string[];
}

/** Pregões mínimos para a leitura deixar de ser fumaça. Ver nota sobre poder estatístico. */
const DEFAULT_SMOKE_N = 25;

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, x) => a + x, 0) / xs.length;
}

/**
 * Vol abaixo disto é ruído de ponto flutuante, não volatilidade.
 *
 * Uma série constante de 0,001 devolve variância ~1e-19 em vez de 0 exato, então `sd === 0` não
 * protege: o sharpe resultante deu 1,5 quadrilhão num teste real aqui. Um número desses tem cara
 * de métrica e é lixo numérico — exatamente a falsa precisão que este arquivo existe para não ter.
 */
const VOL_EPSILON = 1e-12;

/** Desvio-padrão amostral (n-1). null quando não há graus de liberdade. */
function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Retorno sobre vol. Sem risk-free: no Portão 1 o que interessa é o ordenamento, não o nível. */
function sharpe(xs: readonly number[]): number | null {
  const sd = stdev(xs);
  if (sd === null || sd < VOL_EPSILON) return null;
  return mean(xs) / sd;
}

/**
 * Série diária do modelo: para cada pregão do baseline, a média dos trades atribuídos àquele dia.
 * Dia sem trade rende zero, que é literalmente o que "não operar" rende.
 *
 * Média simples entre trades do mesmo dia assume peso igual. É aproximação: o peso real é
 * `sizing_pct_orcamento_risco`. Declarado em `notas` em vez de escondido.
 */
export function modelDailySeries(
  outcomes: readonly TradeOutcome[],
  baselines: readonly BaselineDay[],
): number[] {
  const porDia = new Map<string, number[]>();
  for (const o of outcomes) {
    const arr = porDia.get(o.trade_date);
    if (arr) arr.push(o.pnl_pct);
    else porDia.set(o.trade_date, [o.pnl_pct]);
  }
  return baselines.map((b) => {
    const doDia = porDia.get(b.trade_date);
    return doDia === undefined ? 0 : mean(doDia);
  });
}

export function buildScoreboard(
  outcomes: readonly TradeOutcome[],
  baselines: readonly BaselineDay[],
  smokeN = DEFAULT_SMOKE_N,
): Scoreboard {
  const n_trades = outcomes.length;
  const n_days = baselines.length;
  const notas: string[] = [];

  const modelSeries = modelDailySeries(outcomes, baselines);
  const bhSeries = baselines.map((b) => b.bh_pct);
  const nullSeries = baselines.map((b) => b.null_pct);

  const diasDoBaseline = new Set(baselines.map((b) => b.trade_date));
  const n_days_com_trade = new Set(
    outcomes.filter((o) => diasDoBaseline.has(o.trade_date)).map((o) => o.trade_date),
  ).size;

  // Um trade cujo dia não está no baseline não tem contra o que ser comparado: some da série
  // diária sem aviso. Melhor gritar do que deixar o placar mentir por omissão.
  const orfaos = outcomes.filter((o) => !diasDoBaseline.has(o.trade_date)).length;
  if (orfaos > 0) {
    notas.push(
      `${orfaos} trade(s) com trade_date fora dos dias de baseline: ignorados na série diária`,
    );
  }

  const model_mean_daily = mean(modelSeries);
  const bh_mean_daily = mean(bhSeries);
  const null_mean_daily = mean(nullSeries);
  const model_sharpe = sharpe(modelSeries);
  const bh_sharpe = sharpe(bhSeries);

  const focusDays = baselines.filter((b) => b.focus_error_pct !== null);
  const focus_mean_abs_error =
    focusDays.length === 0 ? null : mean(focusDays.map((b) => Math.abs(b.focus_error_pct!)));

  // O consenso é reportado, não julgado. Motivo honesto: `focus_error_pct` é erro de previsão de
  // indicador, e o modelo produz trades. As duas grandezas não são comensuráveis. Virar baseline
  // de retorno exigiria mapear previsão Focus para uma posição, o que é decisão de produto, não
  // de código. Enquanto esse mapeamento não existir, o terceiro baseline do plano está PARCIAL.
  notas.push(
    "baseline de consenso (Focus) é reportado como erro médio de previsão e NÃO entra na leitura: " +
      "erro de previsão de indicador não é comensurável com P&L de trade. Para virar baseline de " +
      "retorno, é preciso definir a posição implícita no consenso (decisão de produto pendente).",
  );
  notas.push(
    "série diária do modelo usa peso igual entre trades do mesmo dia; o peso real seria " +
      "sizing_pct_orcamento_risco.",
  );
  notas.push("sharpe sem taxa livre de risco: serve para ordenar, não como nível absoluto.");

  let leitura: Leitura;
  if (n_days < smokeN) {
    leitura = "fumaca";
    notas.push(
      `${n_days} pregão(ões) < ${smokeN}: teste de fumaça. Detecta "obviamente quebrado", ` +
        "não prova borda. Não declarar edge com este N.",
    );
  } else if (model_mean_daily < bh_mean_daily && model_mean_daily < null_mean_daily) {
    leitura = "obviamente_quebrado";
  } else if (model_mean_daily > bh_mean_daily && model_mean_daily > null_mean_daily) {
    // Ajuste a risco: o kill do plano diz "bater o B&H ajustado a risco". Ganhar por média com o
    // triplo da vol não é bater, é alavancar. Sem vol comparável, não promove.
    if (model_sharpe !== null && bh_sharpe !== null && model_sharpe <= bh_sharpe) {
      leitura = "fumaca";
      notas.push(
        `média diária acima do B&H, mas sharpe ${model_sharpe.toFixed(3)} <= ${bh_sharpe.toFixed(3)} ` +
          "do B&H: ganho não sobrevive ao ajuste a risco.",
      );
    } else {
      leitura = "sinal_candidato";
      if (model_sharpe === null || bh_sharpe === null) {
        notas.push(
          "sharpe indisponível (N<2 ou vol zero): leitura baseada só em média, sem ajuste a risco.",
        );
      }
    }
  } else {
    leitura = "fumaca";
  }

  return {
    n_trades,
    n_days,
    n_days_com_trade,
    model_mean_daily,
    bh_mean_daily,
    null_mean_daily,
    model_sharpe,
    bh_sharpe,
    focus_mean_abs_error,
    focus_coverage_days: focusDays.length,
    leitura,
    smoke_n: smokeN,
    notas,
  };
}
