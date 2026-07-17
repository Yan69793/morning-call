/**
 * Interface do provedor de agenda economica.
 * Segue o mesmo padrao de DataProvider em data/types.ts.
 */
import type { RawScrapedEvent } from "../../schemas/agenda.js";

export interface AgendaProviderContext {
  tradeDate: string;
  fetchFn?: typeof fetch;
}

export interface AgendaProvider {
  /** Nome do provedor para logging e provenance. */
  readonly name: string;
  /** Busca eventos do calendario economico para a data. */
  fetch(ctx: AgendaProviderContext): Promise<RawScrapedEvent[]>;
}
