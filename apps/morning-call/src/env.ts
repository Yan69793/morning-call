/**
 * Bindings do Worker. Secrets nunca logados.
 */
export interface Env {
  DB: D1Database;
  WORKFLOW: Workflow<{ tradeDate?: string }>;
  ASSETS?: Fetcher;
  OPENROUTER_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  FRED_API_KEY?: string;
  /** Modelo default closed-book Portão 1 */
  STRATEGIST_MODEL?: string;
  /** Relatórios — opcional até criar bucket */
  REPORTS?: R2Bucket;
  /** URL base do Radar Quant Worker para envio do resumo macro (ex.: https://radar-quant-brasil.prospects-intel.workers.dev) */
  RADAR_QUANT_INGEST_URL?: string;
  /** Secret compartilhado com o endpoint de ingest do Radar Quant */
  RADAR_QUANT_INGEST_SECRET?: string;
  /** Origens permitidas para CORS, separadas por virgula. Fail-closed: sem a var, nenhuma origem passa. */
  CORS_ORIGINS?: string;
  /** Secret proprio do /trigger e /trigger-now. Fail-closed: sem ele, negar sempre. */
  TRIGGER_SECRET?: string;
  /** "production" no deploy; /trigger-now so abre sem secret fora de producao. */
  ENVIRONMENT?: string;
}
