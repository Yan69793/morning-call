/**
 * Monta o `QuantMetrics` do run a partir de séries datadas. Função pura: sem rede, sem LLM.
 *
 * Existe porque o motor quant (core.ts / metrics.ts) estava escrito, testado e DESLIGADO: o
 * orquestrador montava `QuantMetrics` com `ativos: []`, `curvas: []`, `correlacoes_63d: []`, e o
 * comentário em run.ts era honesto sobre o porquê — o snapshot só trazia o nível do dia, e
 * retorno/vol/correlação precisam de série. Consequência silenciosa: `MAX_RHO` em gates.ts
 * operava sobre um array sempre vazio, então o gate de correlação nunca barrou nada.
 */
import { correlation, curveButterfly, curveSlope, logReturns } from "./core.js";
import { computeAssetMetrics, type PriceBar } from "./metrics.js";
import type { Quantity, Unit, Venue } from "../schemas/common.js";
import type { AssetMetrics, CurveMetrics, QuantMetrics } from "../schemas/quant.js";

/**
 * `price` → variação é log-retorno (adimensional). `rate` → variação é a diferença absoluta em
 * pontos percentuais. Tratar taxa como preço é o erro clássico: "retorno" de um UST 2Y que foi de
 * 3,47 para 4,18 não é +20%, é +71 bps. O schema já separa os dois mundos (AssetMetrics para
 * preço, CurveMetrics para curva); esta flag é o que impede a mistura no cálculo.
 */
export type SeriesKind = "price" | "rate";

export interface AssetSeries {
  key: string;
  venue: Venue;
  unit: Unit;
  kind: SeriesKind;
  series: readonly PriceBar[];
}

export interface CurveVertexSeries {
  rotulo: string;
  prazo_du: number;
  series: readonly PriceBar[];
}

export interface CurveSeries {
  curva: CurveMetrics["curva"];
  /** Do mais curto para o mais longo. Inclinação e curvatura dependem desta ordem. */
  vertices: readonly CurveVertexSeries[];
}

export interface BuildQuantInput {
  runId: string;
  tradeDate: string;
  ativos?: readonly AssetSeries[];
  curvas?: readonly CurveSeries[];
  faltantes?: readonly string[];
  /** Janela de correlação em observações. Default 63 pregões (~3 meses), como o schema declara. */
  janelaCorrelacao?: number;
}

const JANELA_CORRELACAO_PADRAO = 63;

/** Variação consecutiva na unidade natural da série. */
export function variacoes(series: readonly PriceBar[], kind: SeriesKind): number[] {
  const p = series.map((b) => b.price);
  if (kind === "price") return logReturns(p);
  const out: number[] = [];
  for (let i = 1; i < p.length; i++) out.push(p[i]! - p[i - 1]!);
  return out;
}

/**
 * Pareia duas séries pelo dia. Praças diferentes têm feriados diferentes — correlacionar por
 * índice do array alinharia 14/07 do Brasil com 10/07 dos EUA e produziria um rho inventado.
 */
export function alinharPorDia(
  a: readonly PriceBar[],
  b: readonly PriceBar[],
): { a: PriceBar[]; b: PriceBar[] } {
  const mapB = new Map(b.map((bar) => [bar.t.slice(0, 10), bar]));
  const xs: PriceBar[] = [];
  const ys: PriceBar[] = [];
  for (const bar of a) {
    const par = mapB.get(bar.t.slice(0, 10));
    if (par) {
      xs.push(bar);
      ys.push(par);
    }
  }
  return { a: xs, b: ys };
}

/**
 * Correlação das VARIAÇÕES, nunca dos níveis: dois ativos com tendência têm correlação de nível
 * perto de 1 mesmo sem relação nenhuma, e o gate barraria trades independentes por causa disso.
 *
 * Sem janela cheia devolve `null`. Isso é decisão, não omissão: `gates.ts` trata `rho === null`
 * como "não sei" e deixa passar, porque não saber a correlação não é o mesmo que ela ser baixa.
 * Devolver 0 aqui seria afirmar independência que ninguém mediu.
 */
export function correlacaoDeVariacoes(
  a: AssetSeries,
  b: AssetSeries,
  janela: number,
): number | null {
  const { a: sa, b: sb } = alinharPorDia(a.series, b.series);
  if (sa.length < janela + 1) return null;
  const va = variacoes(sa.slice(-(janela + 1)), a.kind);
  const vb = variacoes(sb.slice(-(janela + 1)), b.kind);
  if (va.length !== vb.length || va.length < 2) return null;
  const rho = correlation(va, vb);
  return Number.isFinite(rho) ? rho : null;
}

function bps(pontosPercentuais: number): Quantity {
  return { value: pontosPercentuais * 100, unit: "bps" };
}

function buildCurva(c: CurveSeries): CurveMetrics | null {
  // O schema exige >= 2 vértices: uma curva com um ponto só não tem inclinação.
  if (c.vertices.length < 2) return null;
  const vertices = c.vertices
    .filter((v) => v.series.length >= 2)
    .map((v) => {
      const ultima = v.series[v.series.length - 1]!;
      const anterior = v.series[v.series.length - 2]!;
      return {
        rotulo: v.rotulo,
        prazo_du: v.prazo_du,
        taxa: { value: ultima.price, unit: "pct" as const },
        delta_1d: bps(ultima.price - anterior.price),
      };
    });
  if (vertices.length < 2) return null;

  const curto = vertices[0]!.taxa.value;
  const longo = vertices[vertices.length - 1]!.taxa.value;
  const meio = vertices[Math.floor(vertices.length / 2)]!.taxa.value;

  return {
    curva: c.curva,
    vertices,
    inclinacao: { value: curveSlope(curto, longo), unit: "bps" },
    // Butterfly precisa de três pontos distintos; com dois, o "meio" seria uma das pontas e a
    // conta viraria ruído com cara de sinal.
    curvatura: {
      value: vertices.length >= 3 ? curveButterfly(curto, meio, longo) : 0,
      unit: "bps",
    },
  };
}

export function buildQuantMetrics(input: BuildQuantInput): QuantMetrics {
  const janela = input.janelaCorrelacao ?? JANELA_CORRELACAO_PADRAO;
  const ativosEntrada = input.ativos ?? [];

  /**
   * `AssetMetrics` só para `price`, e a exclusão é semântica, não preferência.
   *
   * `computeAssetMetrics` roda `simpleReturn` (p1/p0 − 1) e vol de log-retorno. Sobre uma TAXA
   * isso produz número sem significado: um UST 2Y de 4,18 para 4,13 vira "d1 = −1,20%", quando o
   * fato é −5 bps. Publicar −1,20% ao lado de um retorno de câmbio convida a comparação errada, e
   * "vol anualizada de 20,96%" para juro não é a métrica que ninguém usa (juro se mede em bps).
   *
   * A taxa não fica sem cobertura: vai para `curvas`, onde `delta_1d`, inclinação e curvatura
   * estão na unidade certa. E continua entrando na correlação abaixo, que usa a variação natural
   * de cada série e é adimensional — lá misturar preço e taxa é legítimo.
   */
  const ativos: AssetMetrics[] = ativosEntrada
    .filter((a) => a.kind === "price" && a.series.length > 0)
    .map((a) =>
      computeAssetMetrics({ key: a.key, venue: a.venue, unit: a.unit, series: a.series }),
    );

  const curvas: CurveMetrics[] = (input.curvas ?? [])
    .map(buildCurva)
    .filter((c): c is CurveMetrics => c !== null);

  const correlacoes_63d: { a: string; b: string; rho: number }[] = [];
  for (let i = 0; i < ativosEntrada.length; i++) {
    for (let j = i + 1; j < ativosEntrada.length; j++) {
      const x = ativosEntrada[i]!;
      const y = ativosEntrada[j]!;
      const rho = correlacaoDeVariacoes(x, y, janela);
      if (rho !== null) correlacoes_63d.push({ a: x.key, b: y.key, rho });
    }
  }

  return {
    run_id: input.runId,
    trade_date: input.tradeDate,
    ativos,
    curvas,
    correlacoes_63d,
    // Breakeven exige curva pré E curva real (NTN-B). O Portão 1 não coleta a real, então a
    // seção fica vazia em vez de estimada: §18 mostra como N/D, que é a verdade.
    inflacao_implicita: [],
    faltantes: [...(input.faltantes ?? [])],
  };
}
