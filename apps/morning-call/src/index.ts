/**
 * Entry Cloudflare Worker. Cron e /trigger criam instância do Workflow (AD-5).
 */
import type { Env } from "./env.js";
import { todayTradeDateBrt } from "./data/calendar.js";
import { isMarkCron } from "./cron.js";
import { MorningCallWorkflow } from "./workflow.js";
import { getLatestReport, type ReportPayload } from "./db/runs.js";
import { getOpenTrades, saveMark } from "./db/trades.js";
import { fetchInstrumentPrice } from "./data/prices.js";
import { runMarkCron } from "./report/run-mark.js";

export type { Env };
export { MorningCallWorkflow };

// MC-021 (14/08/2026): regra da casa, CORS fail-closed. Nada de "*".
// Sem CORS_ORIGINS configurada, nenhuma origem recebe header.
function corsHeadersFor(request: Request, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const origin = request.headers.get("Origin");
  const allowed = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

function corsJson(request: Request, env: Env, data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(corsHeadersFor(request, env))) {
    headers.set(k, v);
  }
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// MC-022 (14/08/2026): comparacao timing-safe, mesmo padrao do ingest do
// radar-quant. Sem secret configurado, negar sempre (nada de "debug").
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ka = await crypto.subtle.importKey("raw", enc.encode(a), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigA = await crypto.subtle.sign("HMAC", ka, enc.encode("trigger"));
  const kb = await crypto.subtle.importKey("raw", enc.encode(b), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigB = await crypto.subtle.sign("HMAC", kb, enc.encode("trigger"));
  const ua = new Uint8Array(sigA);
  const ub = new Uint8Array(sigB);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= (ua[i] ?? 0) ^ (ub[i] ?? 0);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeadersFor(request, env) });
    }

    if (url.pathname === "/health") {
      return corsJson(request, env, {
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
          return corsJson(request, env, { ok: false, error: "nenhum relatorio disponivel" }, { status: 404 });
        }
        // `report.payload` é escrito por `saveReportPointer` neste mesmo Worker (workflow.ts),
        // não input externo. O cast documenta o shape em vez de deixar `any` correr solto pelo
        // corpo da resposta — ver `ReportPayload` em db/runs.ts.
        const payload = JSON.parse(report.payload) as ReportPayload;
        return corsJson(request, env, {
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
          request,
          env,
          {
            ok: false,
            error: err instanceof Error ? err.message : "erro ao carregar relatorio",
          },
          { status: 500 },
        );
      }
    }

    if (url.pathname === "/trigger" || url.pathname === "/trigger-now") {
      // MC-022/MC-028/MC-029 (14/08/2026): secret proprio (TRIGGER_SECRET) no
      // header x-trigger-secret, fail-closed (sem secret configurado, nega
      // sempre). A query string so cai como compatibilidade e vai para os
      // request logs, usar o header. /trigger-now so abre sem secret fora
      // de producao.
      const debugLocal = url.pathname === "/trigger-now" && env.ENVIRONMENT !== "production";
      if (!debugLocal) {
        const configured = env.TRIGGER_SECRET ?? "";
        const header = request.headers.get("x-trigger-secret") ?? "";
        const query = url.searchParams.get("secret") ?? "";
        const candidate = header || query;
        if (!configured || !candidate || !(await timingSafeEqual(candidate, configured))) {
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
      const tradeDate = todayTradeDateBrt();
      const markedAt = new Date().toISOString();
      ctx.waitUntil(
        runMarkCron(tradeDate, markedAt, {
          getOpenTrades: () => getOpenTrades(env.DB),
          fetchPrice: (instrumento, d, o) => fetchInstrumentPrice(instrumento, d, o),
          saveMark: (row) => saveMark(env.DB, row),
        })
          .then((result) => {
            console.log(
              JSON.stringify({
                event: "mark_cron_done",
                cron: controller.cron,
                trade_date: tradeDate,
                marcados: result.marcados.length,
                pulados: result.pulados,
              }),
            );
          })
          .catch((err) => {
            console.error(
              JSON.stringify({
                event: "mark_cron_failed",
                cron: controller.cron,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
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
