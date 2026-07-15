/**
 * Núcleo analítico compartilhado entre o Radar Quant Brasil e o Morning Call.
 *
 * Veio de `dashboard/shared/` do Radar Quant. Virou pacote por um motivo concreto: os tipos eram
 * mantidos em três cópias (`shared/types.ts`, `worker/src/types.ts`, `frontend/src/types/index.ts`)
 * sincronizadas à mão por `scripts/type-sync.ps1`, um script que só sabia *detectar* a divergência
 * e mandar copiar. Um workspace torna a divergência impossível em vez de detectável.
 *
 * Disciplina que este pacote carrega, e que o resto do portfólio deveria herdar:
 *  - dado ausente é `null`, nunca `0` (ver `computeMetrics`);
 *  - peso de indicador ausente é renormalizado, não tratado como zero (ver `weightedAvailable`);
 *  - `score` e `bias` são LEITURA DE ESTADO, nunca previsão nem probabilidade calibrada.
 */
export * from "./analytics.js";
export * from "./types.js";
export * from "./news.js";
export * from "./signal-rules.js";
export * from "./validate.js";
