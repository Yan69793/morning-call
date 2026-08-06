/**
 * Provedor de fallback estatico.
 *
 * Contem eventos economicos pre-conhecidos (Copom, FOMC, payroll, IPCA, feriados)
 * e regras de calendario. Usado quando ambos os scrapers falham.
 *
 * O LLM recebe esta tabela + eventos do scraper que funcionou.
 * NAO substitui dados reais — complementa com eventos programados.
 */
import type { RawScrapedEvent } from "../../schemas/agenda.js";
import type { AgendaProvider, AgendaProviderContext } from "./types.js";
import { isB3TradingDay, isNyseTradingDay } from "../calendar.js";

/**
 * Eventos programados com data fixa conhecida.
 * Array de tuplas [data, evento] para evitar chaves duplicadas.
 * Ampliar conforme necessario.
 */
const SCHEDULED_EVENTS: Array<[string, Omit<RawScrapedEvent, "consenso" | "anterior">]> = [
  // Copom — datas de 2026
  ["2026-07-29", { hora_brt: "18:30", evento: "Decisao Copom (Selic)", pais: "BR", importancia_indicativa: "alta" }],
  ["2026-09-16", { hora_brt: "18:30", evento: "Decisao Copom (Selic)", pais: "BR", importancia_indicativa: "alta" }],
  ["2026-11-04", { hora_brt: "18:30", evento: "Decisao Copom (Selic)", pais: "BR", importancia_indicativa: "alta" }],
  ["2026-12-09", { hora_brt: "18:30", evento: "Decisao Copom (Selic)", pais: "BR", importancia_indicativa: "alta" }],

  // FOMC — datas de 2026
  ["2026-07-29", { hora_brt: "16:00", evento: "Decisao FOMC (Fed Funds)", pais: "EUA", importancia_indicativa: "alta" }],
  ["2026-09-23", { hora_brt: "16:00", evento: "Decisao FOMC (Fed Funds)", pais: "EUA", importancia_indicativa: "alta" }],
  ["2026-11-04", { hora_brt: "16:00", evento: "Decisao FOMC (Fed Funds)", pais: "EUA", importancia_indicativa: "alta" }],
  ["2026-12-16", { hora_brt: "16:00", evento: "Decisao FOMC (Fed Funds)", pais: "EUA", importancia_indicativa: "alta" }],
];

/**
 * Eventos recorrentes por dia da semana ou periodicidade.
 */
function getRecurringEvents(tradeDate: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];
  const d = new Date(`${tradeDate}T12:00:00.000Z`);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon...
  const dom = d.getUTCDate(); // dia do mes

  // Payroll — primeira sexta-feira do mes (aproximado)
  if (dayOfWeek === 5 && dom <= 7) {
    events.push({
      hora_brt: "10:30",
      evento: "Payroll (BLS)",
      pais: "EUA",
      importancia_indicativa: "alta",
    });
  }

  // IPCA — meio do mes (aproximadamente dia 10-12, se dia util)
  if (dom >= 9 && dom <= 13 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    events.push({
      hora_brt: "08:00",
      evento: "IPCA (IBGE)",
      pais: "BR",
      importancia_indicativa: "alta",
    });
  }

  // IGP-M — final do mes (aproximadamente dia 28-30)
  if (dom >= 27 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    events.push({
      hora_brt: "09:00",
      evento: "IGP-M (FGV)",
      pais: "BR",
      importancia_indicativa: "media",
    });
  }

  // Focus Bulletin — toda segunda-feira
  if (dayOfWeek === 1) {
    events.push({
      hora_brt: "08:25",
      evento: "Boletim Focus (BCB)",
      pais: "BR",
      importancia_indicativa: "media",
    });
  }

  // PMI — primeira semana do mes
  if (dom <= 5 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    events.push({
      hora_brt: "11:00",
      evento: "PMI Industrial (S&P Global)",
      pais: "EUA",
      importancia_indicativa: "alta",
    });
  }

  // Jobless Claims — toda quinta-feira (EUA)
  if (dayOfWeek === 4) {
    events.push({
      hora_brt: "10:30",
      evento: "Jobless Claims (DoL)",
      pais: "EUA",
      importancia_indicativa: "media",
    });
  }

  // CPI EUA — meio do mes
  if (dom >= 10 && dom <= 15 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    events.push({
      hora_brt: "10:30",
      evento: "CPI (BLS)",
      pais: "EUA",
      importancia_indicativa: "alta",
    });
  }

  return events;
}

export const fallbackProvider: AgendaProvider = {
  name: "fallback-estatico",

  // Sem `async`: não há nenhum `await` real aqui, os eventos vêm de tabela estática em memória.
  // `Promise.resolve` no retorno satisfaz a interface `AgendaProvider` sem prometer uma espera
  // que não existe.
  fetch(ctx: AgendaProviderContext): Promise<RawScrapedEvent[]> {
    const tradeDate = ctx.tradeDate;
    const b3Open = isB3TradingDay(tradeDate);
    const nyseOpen = isNyseTradingDay(tradeDate);

    const events: RawScrapedEvent[] = [];

    // Eventos com data fixa
    const scheduled = SCHEDULED_EVENTS
      .filter(([date]) => date === tradeDate)
      .map(([, event]) => event);
    events.push(...scheduled);

    // Eventos recorrentes (so em dias de pregao)
    if (b3Open || nyseOpen) {
      const recurring = getRecurringEvents(tradeDate);
      events.push(...recurring);
    }

    // Feriados sao eventos relevantes
    if (!b3Open) {
      events.push({
        hora_brt: "—",
        evento: "Feriado B3 — mercado fechado",
        pais: "BR",
        importancia_indicativa: "alta",
      });
    }
    if (!nyseOpen) {
      events.push({
        hora_brt: "—",
        evento: "Feriado NYSE — mercado fechado",
        pais: "EUA",
        importancia_indicativa: "alta",
      });
    }

    console.log(
      JSON.stringify({
        event: "agenda_fallback",
        count: events.length,
        tradeDate,
        b3Open,
        nyseOpen,
      }),
    );

    return Promise.resolve(events);
  },
};
