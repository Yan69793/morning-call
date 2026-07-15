/**
 * Saída do motor quantitativo (src/quant). Funções puras, sem LLM.
 * Todo número que aparece no Morning Call nasce aqui ou num DataPoint. Ver CLAUDE.md §3.
 */
import { z } from "zod";
import { CalendarDate, Quantity, Venue } from "./common.js";

/** Os cinco horizontes obrigatórios do MORNING_CALL_OTIMIZADO §"PAPEL E MISSÃO". */
export const ReturnWindow = z.enum(["d1", "d5", "mtd", "ytd", "m12"]);
export type ReturnWindow = z.infer<typeof ReturnWindow>;

/**
 * Retorno numa janela. `janela_as_of` documenta as duas pontas efetivamente usadas: sem isso,
 * um "1D" calculado sobre fechamento US de ontem e fechamento BR de hoje parece igual a um 1D
 * honesto, e a comparação entre ativos vaza look-ahead sem deixar rastro.
 */
export const WindowReturn = z.object({
  window: ReturnWindow,
  retorno: Quantity, // pct
  janela_as_of: z.object({ de: z.iso.datetime(), ate: z.iso.datetime() }),
  /** Pregões efetivamente observados. Menos que o esperado = feriado ou buraco de série. */
  observacoes: z.number().int().positive(),
});
export type WindowReturn = z.infer<typeof WindowReturn>;

export const AssetMetrics = z.object({
  key: z.string().min(1),
  venue: Venue,
  ultimo: Quantity,
  retornos: z.array(WindowReturn),
  vol_realizada_21d: Quantity.nullable(), // pct anualizado
  drawdown_12m: Quantity.nullable(), // pct, negativo
  /** Onde o movimento de hoje cai na própria distribuição histórica (§"PAPEL E MISSÃO"). */
  zscore_d1_vs_12m: Quantity.nullable(),
});
export type AssetMetrics = z.infer<typeof AssetMetrics>;

/** Curva de juros: nível, inclinação, curvatura (MORNING_CALL_OTIMIZADO §6). */
export const CurveMetrics = z.object({
  curva: z.enum(["DI_PRE", "NTNB_REAL", "UST"]),
  vertices: z
    .array(
      z.object({
        rotulo: z.string().min(1), // ex.: "DI1F27"
        prazo_du: z.number().int().positive(), // dias úteis até o vencimento
        taxa: Quantity, // pct a.a.
        delta_1d: Quantity, // bps
      }),
    )
    .min(2),
  inclinacao: Quantity, // bps, longo menos curto
  curvatura: Quantity, // bps, butterfly
});
export type CurveMetrics = z.infer<typeof CurveMetrics>;

export const QuantMetrics = z.object({
  run_id: z.uuid(),
  trade_date: CalendarDate,
  ativos: z.array(AssetMetrics),
  curvas: z.array(CurveMetrics),
  /** Correlação par a par sobre 63 pregões. Alimenta a checagem de trades redundantes. */
  correlacoes_63d: z.array(
    z.object({ a: z.string().min(1), b: z.string().min(1), rho: z.number().min(-1).max(1) }),
  ),
  /** Inflação implícita = pré menos real, por prazo (§6). */
  inflacao_implicita: z.array(z.object({ prazo: z.string().min(1), valor: Quantity })),
  /** Chaves pedidas ao snapshot que voltaram N/D. Vão para a seção §18 do relatório. */
  faltantes: z.array(z.string()),
});
export type QuantMetrics = z.infer<typeof QuantMetrics>;
