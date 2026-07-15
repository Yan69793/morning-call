/**
 * Contratos da camada de dados (src/data).
 *
 * CLAUDE.md §3: todo dado carrega source + timestamp + as_of; dado sem fonte vira
 * "N/D — REQUER VERIFICAÇÃO" e é sinalizado, nunca preenchido por suposição.
 */
import { z } from "zod";
import { CalendarDate, InstantUTC, Quantity, Source, Venue } from "./common.js";

export const ND_MARKER = "N/D — REQUER VERIFICAÇÃO" as const;

/**
 * Uma observação rastreável.
 *
 * Modelada como união discriminada por `status` para tornar o "N/D" impossível de confundir com
 * um zero: no ramo OK o valor existe e é obrigatório, no ramo ND não há campo `value` nenhum.
 * Um `value: number | null` deixaria `null` escorregar para dentro do quant e virar 0 numa soma.
 */
export const DataPoint = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("OK"),
    key: z.string().min(1), // ex.: "USDBRL", "DI_JAN27", "UST_10Y"
    quantity: Quantity,
    venue: Venue,
    source: Source,
    /** Instante a que o dado se refere (fechamento, PTAX das 13h, último tick). */
    as_of: InstantUTC,
    /** Instante em que nós coletamos. `as_of` < `observed_at` sempre. */
    observed_at: InstantUTC,
  }),
  z.object({
    status: z.literal("ND"),
    key: z.string().min(1),
    venue: Venue,
    /** Por que faltou: fonte fora do ar, dado pago, feriado na praça. Vai para o relatório §18. */
    reason: z.string().min(1),
    observed_at: InstantUTC,
  }),
]);
export type DataPoint = z.infer<typeof DataPoint>;

/**
 * Retrato datado do mercado num run. Gravado em D1 antes de qualquer LLM tocar nele, para que o
 * relatório de hoje seja reproduzível amanhã com o mesmo insumo.
 */
export const MarketSnapshot = z.object({
  run_id: z.uuid(),
  trade_date: CalendarDate, // pregão BR de referência
  taken_at: InstantUTC,
  points: z.array(DataPoint).min(1),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshot>;

/** Helpers de estreitamento, para o quant nunca precisar de cast. */
export type DataPointOK = Extract<DataPoint, { status: "OK" }>;
export const isOK = (p: DataPoint): p is DataPointOK => p.status === "OK";
