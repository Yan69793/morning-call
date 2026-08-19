// watchdog.js — watchdog remoto do briefing (cron 40 10 * * 1-5 = 07:40 BRT).
//
// Le o DO (fonte autoritativa, nao o KV). Logica:
//   sent (qualquer modo)                       -> silencio
//   processing com reserva fresca              -> silencio (ainda rodando)
//   ausente / failed remoto (attempts < 2) /
//   processing remoto com reserva expirada     -> RECOVER: dispara o ciclo
//      (cobre cron que nao despachou; o claim capa as tentativas)
//   resto                                       -> alerta via Resend
//
// Falha LOCAL nunca e re-executada pelo remote. O alerta instrui checar a
// sentinela local (cobre o caso: local enviou com o worker fora do ar).

import { brtToday } from "./agenda.js";
import { diaUtilInfo } from "./holidays.js";
import { runPipeline } from "./run.js";
import { heartbeat, watchdogUltimo } from "./kv.js";

const TTL_MS = 10 * 60 * 1000;

export async function enviarAlerta({ env, subject, text, fetchImpl }) {
  const to = env.ALERT_EMAIL || env.TO_EMAIL;
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL || !to) {
    console.log("[watchdog] credenciais Resend ausentes, alerta NAO enviado");
    return false;
  }
  try {
    const resp = await (fetchImpl || fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, text }),
    });
    const data = await resp.json();
    if (!resp.ok || !data || !data.id) throw new Error(`Resend HTTP ${resp.status}`);
    return true;
  } catch (exc) {
    console.log(`[watchdog] falha ao enviar alerta: ${exc}`);
    return false;
  }
}

export async function watchdog({ env, ctx, dateTag, trigger = "cron", fetchImpl, nowMs }) {
  const now = nowMs || Date.now();
  const date = dateTag || brtToday(now);
  const pipeline = "briefing";
  const info = diaUtilInfo(date);
  if (!info.util) {
    await watchdogUltimo(env, pipeline, { status: "skip", motivo: info.motivo });
    return { pipeline, date, status: "skip", motivo: info.motivo };
  }

  const doStub = env.PIPELINE_STATE.get(env.PIPELINE_STATE.idFromName("global"));
  const doCall = async (path, body) => {
    const resp = await doStub.fetch(`http://do${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return await resp.json();
  };

  const { state, reserva } = await doCall("/state", { date });

  if (state && state.status === "sent") {
    await watchdogUltimo(env, pipeline, { status: "ok", execution_mode: state.execution_mode });
    return { pipeline, date, status: "ok", execution_mode: state.execution_mode };
  }

  const fresh = reserva && now - reserva.ts < TTL_MS * 1.5;
  if (state && state.status === "processing" && fresh) {
    await watchdogUltimo(env, pipeline, { status: "processing" });
    return { pipeline, date, status: "processing" };
  }

  const recoverEnabled = env.RECOVER_ON_WATCHDOG === "true";
  const podeRecover =
    recoverEnabled &&
    (!state ||
      (state.status === "failed" && state.execution_mode === "remote" && (state.attempts || 1) < 2) ||
      (state.status === "processing" && !fresh && state.execution_mode === "remote" && (state.attempts || 1) < 2));

  if (podeRecover) {
    await heartbeat(env, pipeline, { date, step: "watchdog_recover", run_id: null });
    await runPipeline({ env, ctx, dateTag: date, mode: "remote", dry: false, trigger: "watchdog-recover", fetchImpl, nowMs });
    const after = await doCall("/state", { date });
    if (after.state && after.state.status === "sent") {
      await watchdogUltimo(env, pipeline, { status: "ok_recovered" });
      return { pipeline, date, status: "ok_recovered" };
    }
  }

  const modo = state ? state.execution_mode : "desconhecido";
  const erro = state
    ? `${state.error_code || "sem erro registrado"}: ${state.error_summary || ""}`
    : "nenhuma execucao reivindicou o dia (cron pode nao ter despachado)";
  const avisoLocal =
    modo === "local" || !state
      ? " Se o pipeline local tiver enviado, a sentinela local cobre o caso (worker fora do ar na janela do claim)."
      : "";

  await enviarAlerta({
    env,
    subject: `ALERTA: Briefing Matinal ${date}`,
    text:
      `Briefing Matinal ${date} nao foi enviado dentro da janela esperada. ` +
      `Modo: ${modo}. ${erro}.${avisoLocal}`,
    fetchImpl,
  });
  await watchdogUltimo(env, pipeline, { status: "alerta", state });
  return { pipeline, date, status: "alerta", modo, erro };
}
