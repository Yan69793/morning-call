// state-do.js — PipelineStateDO, a fonte autoritativa de idempotencia.
//
// Padrao do vixradar-verificacao-async (claim atomico no storage do DO,
// serializado pelo runtime do Durable Object). Este arquivo e copiado
// identico para os dois workers remotos; as duas copias evoluem juntas.
//
// Regras de claim (em ordem):
//   1. state sent            -> JA_ENVIADO (o chamador espelha a sentinela)
//   2. reserva fresca alheia -> JA_RESERVADO
//   3. reserva fresca propria -> renova (retry da mesma origem)
//   4. processing + reserva expirada -> takeover UMA vez, so se
//      execution_mode == remote e attempts < 2 (falha local nunca e
//      re-executada pelo remote; /run?force=1 assume manualmente)
//   5. failed + attempts < 2 -> nova tentativa
//   6. ausente -> claim novo
// complete exige o run_id da reserva (so o detentor conclui).
//
// Nenhuma decisao le o KV: claim/complete/state/watchdog leem este storage.
// O KV (src/kv.js) e so observabilidade.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export class PipelineStateDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  stateKey(date) {
    return `state:${date}`;
  }

  reservaKey(date) {
    return `reserva:${date}`;
  }

  async fetch(request) {
    const url = new URL(request.url);
    let body = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    } else if (request.method === "GET") {
      body = Object.fromEntries(url.searchParams.entries());
    }
    if (url.pathname === "/claim") return json(await this.claim(body));
    if (url.pathname === "/complete") return json(await this.complete(body));
    if (url.pathname === "/state") return json(await this.readState(body));
    if (url.pathname === "/renew") return json(await this.renew(body));
    return json({ error: "not_found" }, 404);
  }

  async claim({ date, claimant, run_id, ttl_ms = 600000, force = false, pipeline = "briefing" }) {
    const st = await this.state.storage.get(this.stateKey(date));
    const r = await this.state.storage.get(this.reservaKey(date));
    const now = Date.now();

    if (st && st.status === "sent") {
      return { granted: false, reason: "ja_enviado", state: st };
    }

    const fresh = !!r && now - r.ts < ttl_ms;
    if (fresh && r.claimant !== claimant && !force) {
      return {
        granted: false,
        reason: "ja_reservado",
        holder: r.claimant,
        held_ms: now - r.ts,
        state: st,
      };
    }
    if (fresh && r.claimant === claimant && !force) {
      await this.state.storage.put(
        this.reservaKey(date),
        { claimant, run_id, ts: now },
        { expirationTtl: Math.ceil(ttl_ms / 1000) },
      );
      return { granted: true, renewed: true, state: st };
    }

    // Reserva expirada ou ausente: decide entre takeover e claim novo.
    let attempts = 1;
    let retried = false;
    if (st && st.status === "processing") {
      const podeTomar = force || (st.execution_mode === "remote" && (st.attempts || 1) < 2);
      if (!podeTomar) {
        return {
          granted: false,
          reason: "stale",
          holder: r ? r.claimant : null,
          state: st,
          nota: "falha local nunca e re-executada pelo remote; use /run?force=1 para assumir manualmente",
        };
      }
      attempts = (st.attempts || 1) + 1;
      retried = true;
    } else if (st && st.status === "failed") {
      if (!force && (st.attempts || 1) >= 2) {
        return { granted: false, reason: "attempts_exhausted", state: st };
      }
      attempts = (st.attempts || 1) + 1;
      retried = true;
    }

    const executionMode = claimant === "local" ? "local" : "remote";
    const newState = {
      pipeline,
      date,
      run_id,
      execution_mode: executionMode,
      status: "processing",
      attempts,
      retried,
      started_at: new Date(now).toISOString(),
      finished_at: null,
      validation_status: null,
      delivery_status: null,
      idempotency_status: null,
      error_code: null,
      error_summary: null,
      agenda_status: null,
      rss_coletados: null,
      feeds_falhos: null,
      urls_aprovadas: null,
      tentativas_aprovacao: null,
      model_used: null,
      steps: [],
    };
    await this.state.storage.put(this.stateKey(date), newState);
    await this.state.storage.put(
      this.reservaKey(date),
      { claimant, run_id, ts: now },
      { expirationTtl: Math.ceil(ttl_ms / 1000) },
    );
    return { granted: true, attempts, state: newState };
  }

  async renew({ date, claimant, run_id, ttl_ms = 600000 }) {
    const r = await this.state.storage.get(this.reservaKey(date));
    if (!r || r.claimant !== claimant || r.run_id !== run_id) {
      return { ok: false, reason: "not_holder" };
    }
    await this.state.storage.put(
      this.reservaKey(date),
      { ...r, ts: Date.now() },
      { expirationTtl: Math.ceil(ttl_ms / 1000) },
    );
    return { ok: true };
  }

  async complete({ date, claimant, run_id, update }) {
    const r = await this.state.storage.get(this.reservaKey(date));
    if (!r || r.run_id !== run_id) {
      return { ok: false, reason: "not_holder" };
    }
    const st = await this.state.storage.get(this.stateKey(date));
    if (!st) return { ok: false, reason: "no_state" };
    const merged = { ...st, ...(update || {}), finished_at: new Date().toISOString() };
    if (merged.status !== "sent" && merged.status !== "failed") {
      merged.status = update && update.status === "sent" ? "sent" : "failed";
    }
    await this.state.storage.put(this.stateKey(date), merged);
    await this.state.storage.delete(this.reservaKey(date));
    const runlog = (await this.state.storage.get(`runlog:${date}`)) || [];
    runlog.push({
      run_id,
      claimant,
      status: merged.status,
      finished_at: merged.finished_at,
      error_code: merged.error_code || null,
    });
    await this.state.storage.put(`runlog:${date}`, runlog);
    return { ok: true, state: merged };
  }

  async readState({ date }) {
    const st = await this.state.storage.get(this.stateKey(date));
    const r = await this.state.storage.get(this.reservaKey(date));
    return {
      state: st || null,
      reserva: r ? { claimant: r.claimant, run_id: r.run_id, ts: r.ts } : null,
    };
  }
}
