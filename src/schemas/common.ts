/**
 * Primitivos compartilhados: unidade, grandeza, tempo e procedência.
 *
 * Duas regras deste projeto vivem aqui, e não em prosa:
 *  - número sem unidade não existe (CLAUDE.md §3: "cuidado com unidades, %, bps");
 *  - horário é sempre UTC no armazenamento, BRT só na renderização.
 */
import { z } from "zod";

/**
 * Unidade explícita. Enum fechado de propósito: unidade em texto livre reabre exatamente o bug
 * que ela deveria fechar (bps virando %, e um erro de 100x passando batido pelo comitê).
 */
export const Unit = z.enum([
  "BRL",
  "USD",
  "BRL_por_USD", // USD/BRL: preço de 1 dólar em reais
  "pct", // percentual, 5.25 == 5,25%
  "bps", // basis points, 25 == 0,25%
  "index_points", // pontos de índice (Ibovespa, S&P)
  "ratio", // múltiplo adimensional (risco-retorno, P/L)
  "contratos",
]);
export type Unit = z.infer<typeof Unit>;

/** Um número com unidade. Nunca aceite `number` cru num contrato de saída de agente. */
export const Quantity = z.object({
  value: z.number().finite(),
  unit: Unit,
});
export type Quantity = z.infer<typeof Quantity>;

/** Instante em UTC estrito (sufixo Z). Converter para BRT é responsabilidade da renderização. */
export const InstantUTC = z.iso.datetime();

/** Data de calendário, YYYY-MM-DD. */
export const CalendarDate = z.iso.date();

/**
 * Praça de negociação. Existe para resolver o problema do `as_of`: às 06:30 BRT o snapshot
 * mistura fechamento americano de ontem, Ásia de hoje e Europa em pré-abertura. Sem marcar a
 * praça de cada observação, o quant compara variação de 1D entre janelas diferentes e erra o
 * número sem que nenhum teste acuse. Ver docs/DATA_SOURCES.md.
 */
export const Venue = z.enum(["BR", "US", "EU", "ASIA", "GLOBAL_24H"]);
export type Venue = z.infer<typeof Venue>;

/**
 * Hierarquia de fontes do MORNING_CALL_OTIMIZADO §18, como dado e não como parágrafo:
 * 1 = banco central, governo, bolsa, regulador, empresa
 * 2 = Reuters, Bloomberg, FT, veículo financeiro reconhecido
 * 3 = provedor de dados
 * 4 = comentário identificado como opinião
 */
export const SourceTier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type SourceTier = z.infer<typeof SourceTier>;

export const Source = z.object({
  name: z.string().min(1), // ex.: "BCB PTAX", "B3", "U.S. Treasury"
  tier: SourceTier,
  url: z.url().optional(),
  retrieved_at: InstantUTC,
});
export type Source = z.infer<typeof Source>;

/**
 * Carimbo de proveniência de qualquer artefato gerado por LLM.
 *
 * Sem isto a Fase 7 (avaliação) não tem como responder "qual modelo acerta mais", e não dá para
 * retrofitar num histórico já gravado: o campo precisa nascer com o primeiro run.
 */
export const Provenance = z.object({
  run_id: z.uuid(),
  model: z.string().min(1), // ex.: "openrouter/anthropic/claude-opus-4.7"
  prompt_version: z.string().min(1), // ex.: "redteam@2026-07-15"
  generated_at: InstantUTC,
});
export type Provenance = z.infer<typeof Provenance>;

/** Texto que um agente não pode deixar vazio nem preencher com "monitorar o cenário". */
export const Rationale = z.string().min(20);
