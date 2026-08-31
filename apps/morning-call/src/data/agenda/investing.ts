/**
 * Scraper do Investing.com — calendario economico.
 *
 * A pagina de calendario do Investing.com e renderizada com React,
 * entao o HTML inicial nao contem os dados. Tentamos:
 * 1. API interna que a pagina usa (XHR) — endpoint /economic-calendar/Service/getCalendar
 * 2. Fallback: array vazio (ForexFactory ou fallback estatico cobrem)
 *
 * URL base: https://www.investing.com/economic-calendar/
 */
import type { RawScrapedEvent } from "../../schemas/agenda.js";
import type { AgendaProvider, AgendaProviderContext } from "./types.js";
import { fetchWithTimeout } from "../http.js";

function mapCountryToPais(country: string): RawScrapedEvent["pais"] {
  const lower = country.toLowerCase().trim();
  if (lower.includes("brazil") || lower.includes("brasil")) return "BR";
  if (lower.includes("united states") || lower.includes("u.s.")) return "EUA";
  if (lower.includes("china")) return "CN";
  if (lower.includes("japan")) return "JP";
  if (
    lower.includes("euro") ||
    lower.includes("german") ||
    lower.includes("france") ||
    lower.includes("italy") ||
    lower.includes("spain")
  )
    return "EZ";
  if (lower.includes("united kingdom") || lower.includes("u.k.")) return "UK";
  return "GLOBAL";
}

function mapImportance(level: string): "alta" | "media" | "baixa" | undefined {
  const n = parseInt(level, 10);
  if (n >= 3) return "alta";
  if (n === 2) return "media";
  if (n === 1) return "baixa";
  return undefined;
}

type QuantityUnit = "BRL" | "USD" | "BRL_por_USD" | "pct" | "bps" | "index_points" | "ratio" | "contratos";

function parseInvestingQuantity(
  text: string,
): { value: number; unit: QuantityUnit } | null {
  if (!text || text.trim() === "") return null;
  const clean = text.replace(/,/g, "").trim();
  // Tenta extrair numero com sinal e unidade
  const match = /(-?[\d.]+)\s*(%|[KMB]?)/i.exec(clean);
  if (!match) return null;
  const value = parseFloat(match[1] ?? "");
  if (isNaN(value)) return null;
  const suffix = (match[2] ?? "").toUpperCase();
  const unit: QuantityUnit = suffix === "%" ? "pct" : suffix === "K" ? "pct" : "index_points";
  return { value, unit };
}

export const investingProvider: AgendaProvider = {
  name: "investing.com",

  async fetch(ctx: AgendaProviderContext): Promise<RawScrapedEvent[]> {
    const fetchFn = ctx.fetchFn ?? fetchWithTimeout;
    try {
      // Tenta a API de calendario que o frontend React consome
      // O endpoint retorna JSON com eventos do dia
      const dateStr = ctx.tradeDate; // YYYY-MM-DD
      const apiUrl = `https://www.investing.com/economic-calendar/Service/getCalendarFilteredData?date=${dateStr}&country[]=25&country[]=72&country[]=37&country[]=39&country[]=5&country[]=26&importance[]=1&importance[]=2&importance[]=3`;

      const resp = await fetchFn(apiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        console.warn(
          JSON.stringify({
            event: "agenda_scrape_inv_fail",
            status: resp.status,
            tradeDate: ctx.tradeDate,
          }),
        );
        return [];
      }

      // `Body.json<T>()` é genérico sem default: chamar `<T>()` aqui é o que fixa o tipo. Um `as`
      // depois do call funcionaria também, mas o eslint acusaria assertion desnecessária, porque
      // a assertion já alimenta a inferência do genérico por contexto, o que a torna redundante
      // com ela mesma — o argumento explícito é a forma sem essa duplicidade.
      const body = await resp.json<{ data?: unknown[] }>();
      if (!body.data || !Array.isArray(body.data)) return [];

      const events: RawScrapedEvent[] = [];
      for (const row of body.data) {
        const r = row as Record<string, string>;
        const timeStr = (r.time ?? r.timeFull ?? "").toString().trim().slice(0, 5);
        const eventName = (r.event ?? r.eventName ?? "").toString().trim();
        if (!timeStr || !eventName) continue;

        const evento: RawScrapedEvent = {
          hora_brt: timeStr,
          evento: eventName,
          pais: mapCountryToPais((r.country ?? "").toString()),
          importancia_indicativa: mapImportance(
            (r.importance ?? "0").toString(),
          ),
        };

        if (!evento.evento || !evento.hora_brt) continue;

        const forecast = parseInvestingQuantity(
          (r.forecast ?? "").toString(),
        );
        const previous = parseInvestingQuantity(
          (r.previous ?? "").toString(),
        );
        if (forecast) evento.consenso = forecast;
        if (previous) evento.anterior = previous;

        events.push(evento);
      }

      console.log(
        JSON.stringify({
          event: "agenda_scrape_inv_ok",
          count: events.length,
          tradeDate: ctx.tradeDate,
        }),
      );
      return events;
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "agenda_scrape_inv_error",
          error: err instanceof Error ? err.message : "desconhecido",
          tradeDate: ctx.tradeDate,
        }),
      );
      return [];
    }
  },
};
