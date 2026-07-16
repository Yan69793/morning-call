/**
 * Gates booleanos do comitê (AD-7). Sem média ponderada inventada.
 *
 * Um caminho só: `gateTrade` é a única definição do que reprova um trade. Antes havia duas listas
 * de checagens, `runGates` e `filterPublishableTrades`, e elas divergiam — a segunda não olhava
 * invalidação vaga. O resultado é que um trade reprovado por um caminho era publicado pelo outro.
 * Regra duplicada não fica em sincronia por disciplina; fica por não existir duas vezes.
 */
import { buildSnapshotIndex, crossCheckClaims, type CrossCheckResult } from "./crossCheck.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { QuantClaim } from "../schemas/agents.js";
import { exposicoesDoTrade, type TradeCard } from "../schemas/trade.js";

export interface Correlacao {
  a: string;
  b: string;
  rho: number;
}

export interface GateResult {
  ok: boolean;
  reasons: string[];
  crossCheck: CrossCheckResult;
  /** Nomes dos trades barrados por redundância com outro já aceito. Alimenta o ValidationReport. */
  correlacionados: string[];
}

const MIN_RISCO_RETORNO = 1.5;

/**
 * Teto de CONCENTRAÇÃO: acima disto, dois trades são a mesma aposta com dois nomes, e o segundo
 * só dobra o risco sem dobrar a tese. Não é lei da natureza, é um teto operacional — por isso o
 * trade ainda passa se declarar por que a redundância é intencional.
 *
 * Comparado com `rho > MAX_RHO`, não `|rho| > MAX_RHO`, seguindo a prática de mesa: o que um gate
 * de crowding existe para pegar é concentração, e correlação negativa entre duas posições é
 * diversificação — o oposto de redundância. A versão anterior barrava hedge natural: duas compras
 * em ativos com rho = −0,9 se protegem uma da outra, e eram tratadas como se fossem a mesma
 * aposta. O sinal só faz sentido depois que a exposição é levada em conta, o que é feito em
 * `correlacaoEntreTrades` via `exposicoesDoTrade`.
 */
const MAX_RHO = 0.7;

/** Justificativa de correlação precisa dizer algo; `Rationale` já exige 20 chars, aqui exige tema. */
const TERMOS_DE_JUSTIFICATIVA = ["hedge", "correlaç", "correlac", "independ", "oposta", "proteç"];

function rhoEntre(correlacoes: readonly Correlacao[], x: string, y: string): number | null {
  for (const c of correlacoes) {
    if ((c.a === x && c.b === y) || (c.a === y && c.b === x)) return c.rho;
  }
  return null;
}

/**
 * Correlação da EXPOSIÇÃO entre dois trades: o rho do mercado, com o sinal ajustado pelo lado de
 * cada ponta. Positivo alto = concentração (as duas posições ganham e perdem juntas). Negativo =
 * as pontas se compensam.
 *
 * Devolve o máximo ASSINADO, não o maior em módulo. A diferença é o ponto: `Math.abs` fazia um
 * par fortemente anticorrelacionado — que é hedge — parecer o par mais perigoso do conjunto, e
 * mascarava um par positivo menor que fosse a concentração real.
 *
 * `null` quando o quant não tem o par: não saber a correlação não é o mesmo que ela ser baixa,
 * então o chamador decide, e o gate não inventa um número para poder opinar.
 */
export function correlacaoEntreTrades(
  a: TradeCard,
  b: TradeCard,
  correlacoes: readonly Correlacao[],
): number | null {
  let max: number | null = null;
  for (const ea of exposicoesDoTrade(a.draft)) {
    for (const eb of exposicoesDoTrade(b.draft)) {
      const rho =
        ea.instrumento === eb.instrumento
          ? 1
          : rhoEntre(correlacoes, ea.instrumento, eb.instrumento);
      if (rho === null) continue;
      const exposto = rho * ea.sinal * eb.sinal;
      if (max === null || exposto > max) max = exposto;
    }
  }
  return max;
}

/**
 * Razões para reprovar um trade isoladamente. Lista vazia = passa.
 * Só checagens decidíveis sem opinião, que é o que separa um gate de um scoring chutado.
 *
 * Dos três abaixo, só `risco_retorno` é alcançável pelo caminho normal: ele é derivado em código,
 * então o schema não tem como barrá-lo. `sem fonte` e `invalidação vaga` já são impossíveis num
 * `TradeCard` que passou pelo parse (`fontes` tem `.min(1)`, `descricao` é `Rationale` de 20+
 * chars). Ficam como defesa em profundidade para card que entre por fora do schema — linha lida
 * do D1, cache de outra versão — e não como a primeira linha, que é o contrato.
 */
export function gateTrade(t: TradeCard): string[] {
  const reasons: string[] = [];
  const d = t.draft;
  if (d.fontes.length === 0) reasons.push("sem fonte");
  if (d.invalidacao.descricao.length < 20) reasons.push("invalidação vaga");
  if (t.risco_retorno.value < MIN_RISCO_RETORNO) {
    reasons.push(`risco_retorno ${t.risco_retorno.value.toFixed(2)} < ${MIN_RISCO_RETORNO}`);
  }
  return reasons;
}

function justificaRedundancia(t: TradeCard): boolean {
  const txt = t.draft.correlacao_com_outras.toLowerCase();
  return TERMOS_DE_JUSTIFICATIVA.some((termo) => txt.includes(termo));
}

/**
 * Gates de conjunto: cross-check dos números e redundância entre trades.
 * O cross-check é global de propósito — se o modelo citou um número que não bate com o snapshot,
 * o problema não é de um trade, é da rodada inteira.
 */
export function runGates(opts: {
  snapshot: MarketSnapshot;
  claims: readonly QuantClaim[];
  trades: readonly TradeCard[];
  correlacoes?: readonly Correlacao[];
}): GateResult {
  const reasons: string[] = [];
  const index = buildSnapshotIndex(opts.snapshot);
  const crossCheck = crossCheckClaims(opts.claims, index);
  for (const v of crossCheck.violations) {
    reasons.push(`crossCheck: ${v.motivo}`);
  }

  for (const t of opts.trades) {
    for (const r of gateTrade(t)) reasons.push(`trade ${t.draft.nome}: ${r}`);
  }

  const { correlacionados } = filterPublishableTrades(opts.trades, crossCheck.ok, opts.correlacoes);
  for (const nome of correlacionados) {
    reasons.push(`trade ${nome}: redundante com outro já aceito, sem justificativa`);
  }

  return { ok: reasons.length === 0, reasons, crossCheck, correlacionados };
}

/**
 * Aplica os gates e devolve o que pode ser publicado, já ranqueado.
 *
 * A ordem importa: os trades entram por assimetria decrescente, e cada um é comparado contra os
 * que já foram aceitos. Assim, entre duas apostas redundantes, sobrevive a de melhor risco-retorno,
 * e não a que por acaso veio primeiro na lista do modelo.
 */
export function filterPublishableTrades(
  trades: readonly TradeCard[],
  claimsOk: boolean,
  correlacoes: readonly Correlacao[] = [],
): {
  published: TradeCard[];
  rejected: { trade: TradeCard; motivo: string }[];
  correlacionados: string[];
} {
  const published: TradeCard[] = [];
  const rejected: { trade: TradeCard; motivo: string }[] = [];
  const correlacionados: string[] = [];

  if (!claimsOk) {
    // Número citado que não bate com o snapshot contamina a rodada: não dá para confiar na tese
    // de um trade cujo autor errou o dado de entrada. Nada é publicado, e o motivo fica gravado.
    for (const t of trades) {
      rejected.push({ trade: t, motivo: "claims quantitativos rejeitados pelo cross-check" });
    }
    return { published, rejected, correlacionados };
  }

  const porAssimetria = [...trades].sort((a, b) => b.risco_retorno.value - a.risco_retorno.value);

  for (const t of porAssimetria) {
    const falhas = gateTrade(t);
    if (falhas.length > 0) {
      rejected.push({ trade: t, motivo: falhas.join("; ") });
      continue;
    }

    const redundante = published.find((ja) => {
      const rho = correlacaoEntreTrades(t, ja, correlacoes);
      return rho !== null && rho > MAX_RHO;
    });

    if (redundante && !justificaRedundancia(t)) {
      const rho = correlacaoEntreTrades(t, redundante, correlacoes);
      correlacionados.push(t.draft.nome);
      rejected.push({
        trade: t,
        motivo: `redundante com "${redundante.draft.nome}" (rho ${rho?.toFixed(2)}) sem justificativa`,
      });
      continue;
    }

    published.push(t);
  }

  return { published, rejected, correlacionados };
}
