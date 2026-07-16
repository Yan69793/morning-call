/**
 * Entry Cloudflare Worker. Cron e /trigger criam instância do Workflow (AD-5).
 */
import type { Env } from "./env.js";
import { todayTradeDateBrt } from "./data/calendar.js";
import { isMarkCron } from "./cron.js";
import { MorningCallWorkflow } from "./workflow.js";

export type { Env };
export { MorningCallWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "morning-call",
        trade_date_brt: todayTradeDateBrt(),
      });
    }
    if (url.pathname === "/trigger") {
      const secret = url.searchParams.get("secret") ?? "";
      if (!secret || secret !== (env.RADAR_QUANT_INGEST_SECRET ?? "debug")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const tradeDateBrt = todayTradeDateBrt();
      try {
        const instance = await env.WORKFLOW.create({});
        return Response.json({
          ok: true,
          message: "workflow iniciado",
          trade_date_brt: tradeDateBrt,
          workflowId: instance.id,
        });
      } catch (err) {
        return Response.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "desconhecido",
          },
          { status: 500 },
        );
      }
    }
    return new Response("not found", { status: 404 });
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    if (isMarkCron(controller.cron)) {
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
      env.WORKFLOW.create({}).then((instance) => {
        console.log(
          JSON.stringify({
            event: "workflow_created",
            workflowId: instance.id,
            cron: controller.cron,
          }),
        );
      }),
    );
  },
};
