/**
 * Entry Cloudflare Worker. Cron e /trigger criam instância do Workflow (AD-5).
 */
import type { Env } from "./env.js";
import { todayTradeDateBrt } from "./data/calendar.js";
import { isMarkCron } from "./cron.js";
import { MorningCallWorkflow } from "./workflow.js";
import { getLatestReport, type ReportPayload } from "./db/runs.js";

export type { Env };
export { MorningCallWorkflow };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health") {
      return corsJson({
        ok: true,
        service: "morning-call",
        trade_date_brt: todayTradeDateBrt(),
        has_assets: Boolean(env.ASSETS),
      });
    }

    if (url.pathname === "/api/report/latest") {
      try {
        const report = await getLatestReport(env.DB);
        if (!report) {
          return corsJson({ ok: false, error: "nenhum relatorio disponivel" }, { status: 404 });
        }
        // `report.payload` é escrito por `saveReportPointer` neste mesmo Worker (workflow.ts),
        // não input externo. O cast documenta o shape em vez de deixar `any` correr solto pelo
        // corpo da resposta — ver `ReportPayload` em db/runs.ts.
        const payload = JSON.parse(report.payload) as ReportPayload;
        return corsJson({
          ok: true,
          trade_date: report.trade_date,
          generated_at: report.generated_at,
          regime: report.regime,
          vies: report.vies,
          conviccao: report.conviccao,
          n_trades: report.n_trades,
          aprovado: report.aprovado,
          report: payload,
        });
      } catch (err) {
        return corsJson(
          {
            ok: false,
            error: err instanceof Error ? err.message : "erro ao carregar relatorio",
          },
          { status: 500 },
        );
      }
    }

    if (url.pathname === "/trigger" || url.pathname === "/trigger-now") {
      // /trigger-now nao requer secret (debug local)
      if (url.pathname === "/trigger") {
        const secret = url.searchParams.get("secret") ?? "";
        if (!secret || secret !== (env.RADAR_QUANT_INGEST_SECRET || "debug")) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
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
    // SPA fallback — serve app.html para client-side routing
    if (env.ASSETS) {
      // Tenta servir o arquivo exato primeiro
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        const h = new Headers(assetRes.headers);
        h.set("Cache-Control", "no-cache, no-store, must-revalidate");
        return new Response(assetRes.body, { status: assetRes.status, headers: h });
      }
      // Fallback SPA — serve app.html para qualquer rota nao-API
      if (!url.pathname.startsWith("/api/")) {
        const spaUrl = new URL(`https://dummy/app.html`);
        const spaRes = await env.ASSETS.fetch(new Request(spaUrl, { headers: request.headers }));
        if (spaRes.ok) {
          const h = new Headers(spaRes.headers);
          h.set("Cache-Control", "no-cache, no-store, must-revalidate");
          h.set("Content-Type", "text/html; charset=utf-8");
          return new Response(spaRes.body, { status: 200, headers: h });
        }
      }
      return new Response("not found", { status: 404 });
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
