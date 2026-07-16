/**
 * Constantes e helpers de cron. Separado do entry point porque o Workers runtime
 * tenta expor todo named export do módulo principal como handler; constantes
 * string/função pura quebram a inicialização do worker.
 */

/** Cron da marcação a mercado, 18:30 BRT. Precisa bater com `wrangler.toml`. */
export const MARK_CRON = "30 21 * * 1-5";

/**
 * Qual job este disparo é.
 *
 * Era `cron.includes("21") || cron.startsWith("30 21")`, que acerta o cron de hoje por sorte:
 * qualquer expressão com "21" em qualquer posição (minuto 21, dia 21, `21 9 * * *`) seria lida
 * como marcação e o Morning Call do dia não sairia. Comparação exata não tem essa ambiguidade.
 */
export function isMarkCron(cron: string): boolean {
  return cron.trim() === MARK_CRON;
}
