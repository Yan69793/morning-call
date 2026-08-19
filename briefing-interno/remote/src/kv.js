// kv.js — espelhos e artefatos em KV (observabilidade, nao decisao).
//
// Um unico namespace SZ_AUTOMATION_KV e compartilhado pelos dois workers
// (briefing e fechamento), com prefixos por pipeline. A fonte autoritativa
// de idempotencia e o Durable Object (src/state-do.js); o KV pode divergir
// por ate ~60s (eventual consistency) e nenhuma decisao o le.

const TTL_7D = 7 * 86400;
const TTL_14D = 14 * 86400;
const TTL_30D = 30 * 86400;
const TTL_3D = 3 * 86400;

export async function mirrorState(env, pipeline, state) {
  if (!state || !state.date) return;
  await env.STATE_KV.put(
    `${pipeline}:state:${state.date}`,
    JSON.stringify(state),
    { expirationTtl: TTL_14D },
  );
}

export async function heartbeat(env, pipeline, { date, step, run_id, extras = {} }) {
  await env.STATE_KV.put(
    `${pipeline}:heartbeat`,
    JSON.stringify({
      pipeline,
      date,
      step,
      ts: new Date().toISOString(),
      run_id,
      ...extras,
    }),
    { expirationTtl: TTL_7D },
  );
}

export async function putArtefato(env, pipeline, date, kind, value) {
  await env.STATE_KV.put(
    `${pipeline}:artefatos:${date}:${kind}`,
    typeof value === "string" ? value : JSON.stringify(value),
    { expirationTtl: TTL_3D },
  );
}

export async function getArtefato(env, pipeline, date, kind) {
  const raw = await env.STATE_KV.get(`${pipeline}:artefatos:${date}:${kind}`);
  if (raw === null) return null;
  if (kind === "html") return raw; // artefato html e texto puro
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function cronUltimo(env, pipeline) {
  // Licao do sz-sites macro-cron-last: gravar o ts do DISPARO, nao do payload.
  await env.STATE_KV.put(
    `cron:ultimo:${pipeline}`,
    JSON.stringify({ ts: new Date().toISOString() }),
    { expirationTtl: TTL_30D },
  );
}

export async function getCronUltimo(env, pipeline) {
  const raw = await env.STATE_KV.get(`cron:ultimo:${pipeline}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function watchdogUltimo(env, pipeline, payload) {
  await env.STATE_KV.put(
    `watchdog:ultimo:${pipeline}`,
    JSON.stringify({ ...payload, ts: new Date().toISOString() }),
    { expirationTtl: TTL_30D },
  );
}

export async function getWatchdogUltimo(env, pipeline) {
  const raw = await env.STATE_KV.get(`watchdog:ultimo:${pipeline}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Agenda computada pelo worker (src/agenda.js), guardada no KV para a
// guarda anti-regressao (mesma regra do agenda_agent.py: agenda nova da
// MESMA janela com <= 1 evento contra uma vigente com >= 3 e preservada).
export async function getAgendaStored(env) {
  const raw = await env.STATE_KV.get("agenda:data");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function putAgendaStored(env, payload, agendaStatus) {
  await env.STATE_KV.put("agenda:data", JSON.stringify(payload));
  await env.STATE_KV.put(
    "agenda:ts",
    JSON.stringify({ ts: new Date().toISOString(), status: agendaStatus }),
  );
}
