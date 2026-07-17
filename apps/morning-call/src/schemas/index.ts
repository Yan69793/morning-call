/**
 * Contratos de I/O do Morning Call — a fonte de verdade dos tipos.
 *
 * Princípio: todo dado carrega origem e horário; toda operação carrega entrada, alvo e
 * invalidação; todo número derivado nasce em código. A ausência de qualquer campo obrigatório
 * INVALIDA o objeto, checado em runtime.
 * Ver docs/RUNTIME_AGENTS.md §3 e MORNING_CALL_OTIMIZADO.md §11 e §18.
 */
export * from "./common.js";
export * from "./data.js";
export * from "./quant.js";
export * from "./agents.js";
export * from "./trade.js";
export * from "./report.js";
export * from "./agenda.js";
