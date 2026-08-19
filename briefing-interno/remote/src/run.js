// run.js — orquestrador do ciclo diario do briefing (cron e /run chamam aqui).
//
// Mesma logica do run_briefing.ps1: PASSO 0 dia util -> claim atomico ->
// coleta noticias -> coleta estado -> agenda -> geracao+validacao em laco de
// 3 tentativas -> envio (ou dry). Nenhuma decisao le KV: claim/complete
// acontecem no Durable Object; o KV so guarda espelhos e artefatos.

import {
  brtToday,
  brtIsoNow,
  janelaSegSex,
  fetchIbge,
  buildAgenda,
} from "./agenda.js";
import { diaUtilInfo } from "./holidays.js";
import { coletarNoticias } from "./collect/noticias.js";
import { coletarEstado } from "./collect/estado.js";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  geraComCadeia,
} from "./generate/briefing.js";
import { validar } from "./validate/briefing.js";
import {
  buildStyledEmail,
  buildPlainText,
  dataFormatada,
  parseExtraRecipients,
  sendResend,
} from "./send/resend.js";
import {
  mirrorState,
  heartbeat,
  putArtefato,
  getAgendaStored,
  putAgendaStored,
} from "./kv.js";
import exposicaoJson from "./assets/projetos-exposicao.json" with { type: "json" };

const TTL_MS = 10 * 60 * 1000; // reserva do briefing (remota): 10 min, renovada por heartbeat
const MAX_TENTATIVAS = 3;

export async function runPipeline({
  env,
  ctx,
  dateTag,
  mode = "remote",
  dry = false,
  force = false,
  trigger = "manual",
  fetchImpl,
  nowMs,
}) {
  const now = nowMs || Date.now();
  const date = dateTag || brtToday(now);
  const pipeline = "briefing";
  const runId = crypto.randomUUID();
  const claimant = mode === "local" ? "local" : "remote";

  const doStub = env.PIPELINE_STATE.get(env.PIPELINE_STATE.idFromName("global"));
  async function doCall(path, body) {
    const resp = await doStub.fetch(`http://do${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return await resp.json();
  }

  async function beat(step, extras = {}) {
    await heartbeat(env, pipeline, { date, step, run_id: runId, extras });
    // Renova a reserva no DO: execucao viva nunca expira.
    if (!dry) {
      const r = await doCall("/renew", { date, claimant, run_id: run_id, ttl_ms: TTL_MS });
      if (!r.ok) {
        const err = new Error("reserva_perdida");
        err.code = "RESERVA_PERDIDA";
        throw err;
      }
    }
  }

  // ---------------------------------------------------------------- PASSO 0
  const info = diaUtilInfo(date);
  if (!info.util && !force) {
    await heartbeat(env, pipeline, { date, step: "dia_util", run_id: runId, extras: { motivo: info.motivo } });
    return { pipeline, date, status: "skipped", motivo: info.motivo };
  }

  // ---------------------------------------------------------------- CLAIM
  const claim = await doCall("/claim", {
    date,
    claimant,
    run_id: runId,
    ttl_ms: TTL_MS,
    force,
    pipeline,
  });
  if (!claim.granted) {
    await heartbeat(env, pipeline, {
      date,
      step: "claim",
      run_id: runId,
      extras: { reason: claim.reason, holder: claim.holder || null },
    });
    return {
      pipeline,
      date,
      status: "skipped",
      reason: claim.reason,
      holder: claim.holder || null,
      nota: claim.nota || null,
    };
  }

  const stateBase = {
    agenda_status: null,
    model_used: null,
    tentativas_aprovacao: null,
  };

  async function finish(update) {
    const complete = await doCall("/complete", {
      date,
      claimant,
      run_id: runId,
      update,
    });
    if (complete.ok) {
      await mirrorState(env, pipeline, complete.state);
    }
    return complete;
  }

  try {
    // ------------------------------------------------------------ PASSO 1
    const noticias = await coletarNoticias(date, fetchImpl, now);
    await putArtefato(env, pipeline, date, "noticias", noticias.payload);
    stateBase.rss_coletados = noticias.payload.n_itens;
    stateBase.feeds_falhos = noticias.falhas;
    await beat("coleta_noticias", { n_itens: noticias.payload.n_itens, falhas: noticias.falhas });

    // ------------------------------------------------------------ PASSO 2
    const estado = await coletarEstado({ dateTag: date, env, fetchImpl, nowMs: now });
    await putArtefato(env, pipeline, date, "estado", estado);
    await beat("coleta_estado");

    // ------------------------------------------------------------ AGENDA
    const hojeIso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const [ini, fim] = janelaSegSex(hojeIso);
    const ibge = await fetchIbge(ini, fim, fetchImpl);
    let { payload: agendaPayload, agendaStatus } = buildAgenda(hojeIso, ibge.items, {
      ibgeErros: ibge.erros,
      agoraIso: brtIsoNow(now),
    });
    // Guarda anti-regressao (mesma regra do agenda_agent.py): agenda nova da
    // MESMA janela com <= 1 evento contra uma vigente com >= 3 e preservada.
    const stored = await getAgendaStored(env);
    if (
      stored &&
      stored.janela &&
      stored.janela.inicio === agendaPayload.janela.inicio &&
      stored.janela.fim === agendaPayload.janela.fim &&
      agendaPayload.eventos.length <= 1 &&
      (stored.eventos || []).length >= 3
    ) {
      agendaPayload = stored;
    }
    await putAgendaStored(env, agendaPayload, agendaStatus);
    stateBase.agenda_status = agendaStatus;
    await beat("agenda", { agenda_status: agendaStatus, n_eventos: agendaPayload.eventos.length });

    // ------------------------------------------- PASSOS 3+4 (3 tentativas)
    const models = [env.OPENROUTER_MODEL || "google/gemma-3-27b-it"];
    if (env.OPENROUTER_FALLBACK_MODEL) models.push(env.OPENROUTER_FALLBACK_MODEL);
    const userPrompt = buildUserPrompt(
      noticias.payload,
      estado,
      exposicaoJson,
      date,
      agendaPayload,
      agendaStatus,
    );

    let html = null;
    let modelUsed = null;
    let validacaoLog = null;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      await beat(`geracao_t${tentativa}`);
      const gerado = await geraComCadeia({
        apiKey: env.OPENROUTER_API_KEY,
        models,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        openrouterUrl: env.OPENROUTER_URL,
        fetchImpl,
      });
      html = gerado.html;
      modelUsed = gerado.model;
      await putArtefato(env, pipeline, date, "html", html);

      await beat(`validacao_t${tentativa}`);
      const v = validar(html, noticias.payload, estado, exposicaoJson);
      v.log.data = date;
      await putArtefato(env, pipeline, date, "validacao", v.log);
      validacaoLog = v.log;
      if (v.resultado === "APROVADO") {
        stateBase.model_used = modelUsed;
        stateBase.tentativas_aprovacao = tentativa;
        stateBase.urls_aprovadas = v.log.n_urls_no_html;
        break;
      }
      if (tentativa < MAX_TENTATIVAS) {
        await heartbeat(env, pipeline, { date, step: `reprovado_t${tentativa}`, run_id: runId });
      }
    }

    if (validacaoLog.resultado !== "APROVADO") {
      const complete = await finish({
        status: "failed",
        validation_status: "reprovado",
        tentativas_aprovacao: MAX_TENTATIVAS,
        error_code: "VALIDACAO_REPROVADA",
        error_summary: `portao reprovou nas ${MAX_TENTATIVAS} tentativas`,
        ...stateBase,
      });
      return { pipeline, date, run_id: runId, status: "failed", complete };
    }

    // ------------------------------------------------------------ PASSO 5
    if (dry) {
      // Dry-run: exerce tudo exceto o POST do Resend. NUNCA marca o dia como
      // enviado (o estado fica failed/dry para nao bloquear o ciclo real).
      const complete = await finish({
        status: "failed",
        validation_status: "aprovado",
        delivery_status: "dry",
        idempotency_status: "nao_enviado_dry",
        error_code: "DRY_RUN",
        error_summary: "dry-run: envio simulado, nenhum e-mail postado",
        ...stateBase,
      });
      await beat("dry_finalizado");
      return { pipeline, date, run_id: runId, status: "dry_ok", complete };
    }

    const dataFmt = dataFormatada(date);
    const styled = buildStyledEmail(html, dataFmt);
    const plain = buildPlainText(html);
    const extraBcc = parseExtraRecipients(env.TO_EMAIL_EXTRA || "");

    await beat("enviando");
    const emailId = await sendResend({
      apiKey: env.RESEND_API_KEY,
      fromEmail: env.FROM_EMAIL,
      toEmail: env.TO_EMAIL,
      subject: `Briefing Matinal — ${dataFmt}`,
      html: styled,
      text: plain,
      bccList: extraBcc.length ? extraBcc : null,
      fetchImpl,
    });
    const complete = await finish({
      status: "sent",
      validation_status: "aprovado",
      delivery_status: "enviado",
      idempotency_status: "enviado",
      resend_id: emailId,
      ...stateBase,
    });
    await beat("finalizado", { resend_id: emailId });
    return { pipeline, date, run_id: runId, status: "sent", emailId, complete };
  } catch (exc) {
    const code = exc.code || "ERRO_INTERNO";
    const summary = String(exc && exc.message ? exc.message : exc).slice(0, 300);
    if (code === "RESERVA_PERDIDA") {
      // Perdeu o claim no meio do caminho (outra origem assumiu): nada mais a
      // fazer aqui, a outra origem responde pelo dia.
      await heartbeat(env, pipeline, { date, step: "reserva_perdida", run_id: runId });
      return { pipeline, date, run_id: runId, status: "aborted", reason: "reserva_perdida" };
    }
    try {
      await finish({
        status: "failed",
        error_code: code,
        error_summary: summary,
        ...stateBase,
      });
    } catch {
      /* complete pode falhar se a reserva foi perdida; o estado fica como esta */
    }
    return { pipeline, date, run_id: runId, status: "failed", error_code: code, error_summary: summary };
  }
}
