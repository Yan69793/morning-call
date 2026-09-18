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
  /** Modelo default closed-book Portão 1 — strategist final (etapa 3 da cadeia). */
  STRATEGIST_MODEL?: string;
  /** Etapa 1, pesquisa web (plugin `web`). Não reutilizar STRATEGIST_MODEL para research. */
  RESEARCH_MODEL?: string;
  /** Etapa 2, analyst JSON sem web search. Não reutilizar STRATEGIST_MODEL para analyst. */
  ANALYST_MODEL?: string;
  /**
   * Teto de resultados da busca web da etapa 1. O plugin cobra POR RESULTADO
   * (medido 17/09/2026: US$ 0,0035 cada), entao este numero e a alavanca de custo
   * mais direta da rodada. Ausente = `RESEARCH_MAX_RESULTS_PADRAO` (5).
   */
  RESEARCH_MAX_RESULTS?: string;
  /**
   * Teto de max_tokens da chamada do strategist. O OpenRouter pre-autoriza o custo
   * deste numero antes de chamar o modelo; quando o credito da conta nao cobre, a
   * chamada morre com HTTP 402 (producao parada de 08/09 a 17/09 por isso). Esta var
   * permite baixar o teto sem novo deploy. Ausente ou nao inteiro positivo = 8000.
   */
  STRATEGIST_MAX_TOKENS?: string;
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
