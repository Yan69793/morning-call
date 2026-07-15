/**
 * Entry Cloudflare Worker. Cron só dispara; lógica em orchestrator/run.ts.
 */
import type { Env } from "./env.js";
import { runMorningCall } from "./orchestrator/run.js";
import { todayTradeDateBrt } from "./data/calendar.js";

export type { Env };

function isMarkCron(cron: string): boolean {
  // wrangler: "30 21 * * 1-5" = 18:30 BRT mark
  return cron.includes("21") || cron.startsWith("30 21");
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
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

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (isMarkCron(controller.cron)) {
      // Mark job: implementação de preço live fica na Wave B+; loga no-op seguro
      console.log(JSON.stringify({ event: "mark_cron", cron: controller.cron, note: "mark pipeline ready via report/mark.ts" }));
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
