import type { DataPoint } from "../schemas/data.js";

export interface DataProviderContext {
  /** Pregão BR de referência YYYY-MM-DD */
  tradeDate: string;
  /** InstantUTC da coleta */
  observedAt: string;
  /** fetch injetável (testes / Workers) */
  fetchFn?: typeof fetch;
  /** secrets opcionais */
  secrets?: {
    fredApiKey?: string;
  };
}

export interface DataProvider {
  readonly name: string;
  fetch(ctx: DataProviderContext): Promise<DataPoint[]>;
}
