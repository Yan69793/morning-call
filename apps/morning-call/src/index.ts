/**
 * Entry Cloudflare Worker. Cron só dispara; lógica em orchestrator/run.ts.
 */
import type { Env } from "./env.js";
import { runMorningCall } from "./orchestrator/run.js";
import { todayTradeDateBrt } from "./data/calendar.js";

export type { Env };

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

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "morning-call",
        trade_date_brt: todayTradeDateBrt(),
      });
    }
    return new Response("not found", { status: 404 });
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    if (isMarkCron(controller.cron)) {
      // Marcação a mercado depende de feed de preço, que ainda não existe (ver report/mark.ts:
      // a função está pronta e testada, falta a fonte). No-op explícito e logado: silêncio aqui
      // seria indistinguível de cron que não disparou.
      console.log(
        JSON.stringify({
          event: "mark_cron_noop",
          cron: controller.cron,
          note: "markTrade pronto em report/mark.ts; falta feed de preço",
        }),
      );
      return;
    }
    ctx.waitUntil(
      runMorningCall({ env }).then((r) => {
        console.log(
          JSON.stringify({
            event: "morning_call_done",
            aborted: r.aborted,
            runId: r.runId,
            reason: r.reason,
            published: r.publishedCount,
            rejected: r.rejectedCount,
            aprovado: r.validation?.aprovado,
          }),
        );
      }),
    );
  },
};
