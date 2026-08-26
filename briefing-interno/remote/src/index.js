// index.js — router do sz-briefing-remote.
//
// Endpoints:
//   GET  /health        publico, le o espelho KV (consultavel com PC desligado)
//   POST /run           RUN_TRIGGER_KEY (x-run-trigger-key); ?dry=1 ?force=1 ?date=YYYYMMDD
//   POST /watchdog      RUN_TRIGGER_KEY (disparo manual do watchdog, para teste)
//   POST /claim         LOCAL_CLAIM_KEY (x-local-claim-key) — integracao local
//   POST /complete      LOCAL_CLAIM_KEY
//   GET  /state         LOCAL_CLAIM_KEY ?date=YYYYMMDD (le o DO, nao o KV)
//
// scheduled(): mesmo handler do /run e do /watchdog (uma funcao, dois gatilhos).
// Crons em UTC (BRT = UTC-3 fixo):
//   0  10 * * 1-5  -> 07:00 BRT  run (local primario as 06:55; remote seguro)
//   35 10 * * 1-5  -> 07:35 BRT  retry unico de falha remota
//   40 10 * * 1-5  -> 07:40 BRT  watchdog
//
// O cron roda SEMPRE em dry (nunca envia). O envio real exige /run manual sem
// ?dry=1 (RUN_TRIGGER_KEY humana), e o watchdog alerta que o briefing esta
// pronto. REGRA 6 em producao desde o deploy v ad24c1bc—sem numeros conferidos
// nao ha envio (fail-closed).

import { PipelineStateDO } from "./state-do.js";
import { runPipeline } from "./run.js";
import { watchdog } from "./watchdog.js";
import { brtToday } from "./agenda.js";
import { getCronUltimo, getWatchdogUltimo } from "./kv.js";

const CRON_RUN = "0 10 * * 1-5";
const CRON_RETRY = "35 10 * * 1-5";
const CRON_WATCHDOG = "40 10 * * 1-5";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function doCall(env, path, body) {
  const stub = env.PIPELINE_STATE.get(env.PIPELINE_STATE.idFromName("global"));
  const resp = await stub.fetch(`http://do${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return await resp.json();
}

async function health(env, nowMs) {
  const now = nowMs || Date.now();
  const date = brtToday(now);
  const out = { pipeline: "briefing", date, ok: true, kv_bound: !!env.STATE_KV, do_bound: !!env.PIPELINE_STATE };
  try {
    if (!env.STATE_KV) {
      out.ok = false;
      out.error = "STATE_KV_unbound";
      return out;
    }
    const stateRaw = await env.STATE_KV.get(`briefing:state:${date}`);
    let state = null;
    try { state = stateRaw ? JSON.parse(stateRaw) : null; } catch { state = null; }
    const hbRaw = await env.STATE_KV.get(`briefing:heartbeat:${date}`);
    let heartbeat = null;
    try { heartbeat = hbRaw ? JSON.parse(hbRaw) : null; } catch { heartbeat = null; }
    out.state = state;
    out.heartbeat = heartbeat;
    out.cron_ultimo = await getCronUltimo(env, "briefing");
    out.watchdog_ultimo = await getWatchdogUltimo(env, "briefing");
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message ? err.message : err).slice(0, 300);
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json(await health(env));
    }

    if (url.pathname === "/run" && request.method === "POST") {
      if (request.headers.get("x-run-trigger-key") !== env.RUN_TRIGGER_KEY) {
        return json({ error: "unauthorized" }, 401);
      }
      const dry = url.searchParams.get("dry") === "1";
      const force = url.searchParams.get("force") === "1";
      const date = url.searchParams.get("date") || undefined;
      const result = await runPipeline({
        env,
        ctx,
        dateTag: date,
        mode: "remote",
        dry,
        force,
        trigger: "manual",
      });
      return json(result);
    }

    if (url.pathname === "/watchdog" && request.method === "POST") {
      if (request.headers.get("x-run-trigger-key") !== env.RUN_TRIGGER_KEY) {
        return json({ error: "unauthorized" }, 401);
      }
      return json(await watchdog({ env, ctx, trigger: "manual" }));
    }

    // Integracao local (chave escopada: so claim/complete/state)
    if (request.headers.get("x-local-claim-key") === env.LOCAL_CLAIM_KEY) {
      if (url.pathname === "/claim" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return json(await doCall(env, "/claim", { ...body, claimant: body.claimant || "local" }));
      }
      if (url.pathname === "/complete" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return json(await doCall(env, "/complete", { ...body, claimant: body.claimant || "local" }));
      }
      if (url.pathname === "/state") {
        const date = url.searchParams.get("date") || brtToday();
        return json(await doCall(env, "/state", { date }));
      }
    }

    return json({ error: "not_found" }, 404);
  },

  async scheduled(event, env, ctx) {
    // Licao do sz-sites macro-cron-last: registrar o ts do DISPARO.
    const ts = new Date().toISOString();
    await env.STATE_KV.put(
      "cron:ultimo:briefing",
      JSON.stringify({ ts, cron: event.cron }),
      { expirationTtl: 30 * 86400 },
    );
    if (event.cron === CRON_RUN) {
      // dry:true sempre — cron nunca envia sozinho, so segura e avisa (plano 2026-08-19).
      return runPipeline({ env, ctx, mode: "remote", dry: true, trigger: "cron-run" });
    }
    if (event.cron === CRON_RETRY) {
      return runPipeline({ env, ctx, mode: "remote", dry: true, trigger: "cron-retry" });
    }
    if (event.cron === CRON_WATCHDOG) {
      return watchdog({ env, ctx, trigger: "cron-watchdog" });
    }
    // Cron desconhecido: comportamento conservador, watchdog.
    return watchdog({ env, ctx, trigger: "cron-desconhecido" });
  },
};

export { PipelineStateDO };
