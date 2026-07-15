/**
 * Bindings do Worker. Secrets nunca logados.
 */
export interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  FRED_API_KEY?: string;
  /** Modelo default closed-book Portão 1 */
  STRATEGIST_MODEL?: string;
  /** Relatórios — opcional até criar bucket */
  REPORTS?: R2Bucket;
}
