/**
 * Scraper do ForexFactory — calendario economico.
 *
 * A pagina de calendario do ForexFactory usa server-side rendering:
 * a tabela de eventos esta no HTML inicial. Extraimos via regex.
 *
 * URL: https://www.forexfactory.com/calendar
 * Fallback: se o fetch falhar ou nao encontrar eventos, retorna array vazio.
 */
import type { RawScrapedEvent } from "../../schemas/agenda.js";
import type { AgendaProvider, AgendaProviderContext } from "./types.js";

const FOREX_FACTORY_URL = "https://www.forexfactory.com/calendar";

/**
 * Parse da pagina HTML do ForexFactory.
 * Extrai eventos do calendario para a data especificada.
 *
 * A estrutura HTML relevante e:
 * <tr class="calendar__row" data-event-id="...">
 *   <td class="calendar__time">08:00</td>
 *   <td class="calendar__currency">BRL</td>
 *   <td class="calendar__event">IPCA (IBGE)</td>
 *   <td class="calendar__impact">High</td>
 *   <td class="calendar__forecast">0.32%</td>
 *   <td class="calendar__previous">0.25%</td>
 * </tr>
 */
function parseHtml(html: string, tradeDate: string): RawScrapedEvent[] {
  const events: RawScrapedEvent[] = [];

  // Regex para extrair linhas da tabela de calendario
  // Cada linha contem: hora, moeda (pais), evento, impacto, forecast, previous
  const rowRegex =
    /<tr[^>]*class="[^"]*calendar__row[^"]*"[^>]*data-event-id="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[2] ?? "";

    // Extrair campos da linha
    const time = extractCell(rowHtml, "calendar__time") ?? "";
    const currency = extractCell(rowHtml, "calendar__currency") ?? "";
    const eventName = extractCell(rowHtml, "calendar__event") ?? "";
    const impact = extractCell(rowHtml, "calendar__impact") ?? "";
    const forecast = extractCell(rowHtml, "calendar__forecast") ?? "";
    const previous = extractCell(rowHtml, "calendar__previous") ?? "";

    if (!time || !eventName || !currency) continue;

    const pais = mapCurrencyToPais(currency);
    const importancia = mapImpactToImportancia(impact);

    const evento: RawScrapedEvent = {
      hora_brt: time.trim().slice(0, 5).padStart(5, "0"), // normalizar HH:MM
      evento: decodeHtmlEntities(eventName.trim()),
      pais,
      importancia_indicativa: importancia,
    };

    if (forecast && forecast.trim() !== "" && forecast.trim() !== "—") {
      const q = parseQuantity(forecast.trim());
      if (q) evento.consenso = q;
    }
    if (previous && previous.trim() !== "" && previous.trim() !== "—") {
      const q = parseQuantity(previous.trim());
      if (q) evento.anterior = q;
    }

    events.push(evento);
  }

  return events;
}

function extractCell(html: string, className: string): string | undefined {
  const regex = new RegExp(
    `<td[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`,
    "i",
  );
  const m = regex.exec(html);
  if (!m || !m[1]) return undefined;
  return m[1].replace(/<[^>]+>/g, "").trim();
}

function mapCurrencyToPais(currency: string): RawScrapedEvent["pais"] {
  const map: Record<string, RawScrapedEvent["pais"]> = {
    BRL: "BR",
    USD: "EUA",
    CNY: "CN",
    JPY: "JP",
    EUR: "EZ",
    GBP: "UK",
    CHF: "EZ",
    CAD: "GLOBAL",
    AUD: "GLOBAL",
    NZD: "GLOBAL",
  };
  return map[currency.toUpperCase()] ?? "GLOBAL";
}

function mapImpactToImportancia(
  impact: string,
): "alta" | "media" | "baixa" | undefined {
  const lower = impact.toLowerCase().trim();
  if (lower.includes("high") || lower.includes("alto")) return "alta";
  if (lower.includes("medium") || lower.includes("medio")) return "media";
  if (lower.includes("low") || lower.includes("baixo")) return "baixa";
  return undefined;
}

type QuantityUnit = "BRL" | "USD" | "BRL_por_USD" | "pct" | "bps" | "index_points" | "ratio" | "contratos";

function parseQuantity(
  text: string,
): { value: number; unit: QuantityUnit } | null {
  // Remove HTML entities e espacos
  const clean = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();

  // Tenta extrair numero com possivel unidade
  const numMatch = /(-?[\d,.]+)\s*(%|[KMB]?|\$?\s*[KMB]?)/i.exec(clean);
  if (!numMatch) return null;

  const value = parseFloat((numMatch[1] ?? "").replace(",", ""));
  if (isNaN(value)) return null;

  let unit: QuantityUnit = "pct";
  const suffix = (numMatch[2] ?? "").trim().toUpperCase();
  if (suffix === "%" || suffix === "") unit = "pct";
  else if (suffix === "K") unit = "pct";
  else if (suffix === "B" || suffix === "$B") unit = "USD";
  else unit = "index_points";

  return { value, unit };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export const forexFactoryProvider: AgendaProvider = {
  name: "forexfactory.com",

  async fetch(ctx: AgendaProviderContext): Promise<RawScrapedEvent[]> {
    const fetchFn = ctx.fetchFn ?? fetch;
    try {
      const resp = await fetchFn(FOREX_FACTORY_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html",
        },
      });

      if (!resp.ok) {
        console.log(
          JSON.stringify({
            event: "agenda_scrape_ff_fail",
            status: resp.status,
            tradeDate: ctx.tradeDate,
          }),
        );
        return [];
      }

      const html = await resp.text();
      const events = parseHtml(html, ctx.tradeDate);
      console.log(
        JSON.stringify({
          event: "agenda_scrape_ff_ok",
          count: events.length,
          tradeDate: ctx.tradeDate,
        }),
      );
      return events;
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "agenda_scrape_ff_error",
          error: err instanceof Error ? err.message : "desconhecido",
          tradeDate: ctx.tradeDate,
        }),
      );
      return [];
    }
  },
};
