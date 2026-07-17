/**
 * Orquestrador de scraping de agenda economica.
 *
 * Tenta ForexFactory primeiro (SSR, HTML parseavel), depois Investing.com (API JSON).
 * Fallback estatico sempre roda para complementar com eventos programados
 * (Copom, FOMC, feriados) que os scrapers podem nao capturar.
 *
 * Dedup por (hora_brt, evento, pais): primeiro evento vence.
 */
import type { RawScrapedEvent } from "../../schemas/agenda.js";
import type { AgendaProviderContext } from "./types.js";
import { forexFactoryProvider } from "./forexfactory.js";
import { investingProvider } from "./investing.js";
import { fallbackProvider } from "./fallback.js";

function dedupKey(e: RawScrapedEvent): string {
  return `${e.hora_brt}|${e.evento}|${e.pais}`.toLowerCase();
}

function mergeAndDedup(batches: RawScrapedEvent[][]): RawScrapedEvent[] {
  const seen = new Set<string>();
  const result: RawScrapedEvent[] = [];
  for (const batch of batches) {
    for (const e of batch) {
      const k = dedupKey(e);
      if (!seen.has(k)) {
        seen.add(k);
        result.push(e);
      }
    }
  }
  return result;
}

export interface FetchAgendaInput {
  tradeDate: string;
  fetchFn?: typeof fetch;
}

export interface FetchAgendaResult {
  eventos: RawScrapedEvent[];
  fontes: string[];
}

/**
 * Busca eventos da agenda economica de todas as fontes disponiveis.
 * Ordem: ForexFactory (primario) → Investing.com → Fallback estatico.
 * Fallback sempre contribui (eventos programados que scrapers podem nao ter).
 */
export async function fetchAgendaEvents(
  input: FetchAgendaInput,
): Promise<FetchAgendaResult> {
  const ctx: AgendaProviderContext = {
    tradeDate: input.tradeDate,
    fetchFn: input.fetchFn,
  };

  const fontes: string[] = [];

  // ForexFactory (primario — SSR)
  let ffEvents: RawScrapedEvent[] = [];
  try {
    ffEvents = await forexFactoryProvider.fetch(ctx);
    if (ffEvents.length > 0) fontes.push(forexFactoryProvider.name);
  } catch {
    // segue para o proximo
  }

  // Investing.com (secundario — API JSON)
  let invEvents: RawScrapedEvent[] = [];
  try {
    invEvents = await investingProvider.fetch(ctx);
    if (invEvents.length > 0) fontes.push(investingProvider.name);
  } catch {
    // segue para o proximo
  }

  // Fallback estatico (sempre — complementa com eventos programados)
  let fbEvents: RawScrapedEvent[] = [];
  try {
    fbEvents = await fallbackProvider.fetch(ctx);
    if (fbEvents.length > 0) fontes.push(fallbackProvider.name);
  } catch {
    // nao deveria falhar, mas...
  }

  const eventos = mergeAndDedup([ffEvents, invEvents, fbEvents]);

  // Ordena por horario
  eventos.sort((a, b) => a.hora_brt.localeCompare(b.hora_brt));

  console.log(
    JSON.stringify({
      event: "agenda_fetch_done",
      total: eventos.length,
      ff: ffEvents.length,
      inv: invEvents.length,
      fb: fbEvents.length,
      fontes,
      tradeDate: input.tradeDate,
    }),
  );

  return { eventos, fontes };
}
