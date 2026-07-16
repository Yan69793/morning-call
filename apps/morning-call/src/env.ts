/**
 * Bindings do Worker. Secrets nunca logados.
 */
export interface Env {
  DB: D1Database;
  WORKFLOW: Workflow<{ tradeDate?: string }>;
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
}
