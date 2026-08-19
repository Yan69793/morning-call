// state-do.test.mjs — maquina de estados do claim (a prova de idempotencia).
// Roda o PipelineStateDO contra um storage fake, sem workerd.

import test from "node:test";
import assert from "node:assert/strict";
import { PipelineStateDO } from "../src/state-do.js";

function makeDo() {
  const map = new Map();
  const storage = {
    async get(key) {
      return map.has(key) ? map.get(key).value : undefined;
    },
    async put(key, value, opts) {
      map.set(key, { value, opts });
    },
    async delete(key) {
      map.delete(key);
    },
  };
  return new PipelineStateDO({ storage }, {});
}

const DIA = "20260819";

test("claim novo concede e cria estado processing", async () => {
  const do1 = makeDo();
  const c = await do1.claim({
    date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000, pipeline: "briefing",
  });
  assert.equal(c.granted, true);
  assert.equal(c.state.status, "processing");
  assert.equal(c.state.execution_mode, "remote");
  assert.equal(c.state.attempts, 1);
});

test("segunda origem com reserva fresca recebe ja_reservado", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  const c = await do1.claim({ date: DIA, claimant: "local", run_id: "r2", ttl_ms: 600000 });
  assert.equal(c.granted, false);
  assert.equal(c.reason, "ja_reservado");
  assert.equal(c.holder, "remote");
});

test("mesma origem reivindica de novo e renova a reserva", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "local", run_id: "r1", ttl_ms: 600000 });
  const c = await do1.claim({ date: DIA, claimant: "local", run_id: "r2", ttl_ms: 600000 });
  assert.equal(c.granted, true);
  assert.equal(c.renewed, true);
});

test("complete exige o run_id da reserva (not_holder)", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  const c = await do1.complete({ date: DIA, claimant: "remote", run_id: "rX", update: { status: "sent" } });
  assert.equal(c.ok, false);
  assert.equal(c.reason, "not_holder");
});

test("complete do detentor fecha sent; claim seguinte recebe ja_enviado", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  const comp = await do1.complete({
    date: DIA, claimant: "remote", run_id: "r1",
    update: { status: "sent", delivery_status: "enviado", validation_status: "aprovado" },
  });
  assert.equal(comp.ok, true);
  assert.equal(comp.state.status, "sent");
  const c = await do1.claim({ date: DIA, claimant: "local", run_id: "r2", ttl_ms: 600000 });
  assert.equal(c.granted, false);
  assert.equal(c.reason, "ja_enviado");
});

test("falha local nunca e re-executada pelo remote (stale, sem takeover)", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "local", run_id: "r1", ttl_ms: 600000 });
  // reserva expirada (ttl_ms 0 no claim seguinte força expiracao)
  const c = await do1.claim({ date: DIA, claimant: "remote", run_id: "r2", ttl_ms: 0 });
  assert.equal(c.granted, false);
  assert.equal(c.reason, "stale");
});

test("falha remota com attempts < 2 permite takeover unico (retry)", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  await do1.complete({
    date: DIA, claimant: "remote", run_id: "r1",
    update: { status: "failed", error_code: "X" },
  });
  const c = await do1.claim({ date: DIA, claimant: "remote", run_id: "r2", ttl_ms: 600000 });
  assert.equal(c.granted, true);
  assert.equal(c.state.attempts, 2);
  assert.equal(c.state.retried, true);
});

test("failed com attempts >= 2 esgota (attempts_exhausted)", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  await do1.complete({ date: DIA, claimant: "remote", run_id: "r1", update: { status: "failed" } });
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r2", ttl_ms: 600000 });
  await do1.complete({ date: DIA, claimant: "remote", run_id: "r2", update: { status: "failed" } });
  const c = await do1.claim({ date: DIA, claimant: "remote", run_id: "r3", ttl_ms: 600000 });
  assert.equal(c.granted, false);
  assert.equal(c.reason, "attempts_exhausted");
});

test("force assume stale local (acao manual deliberada)", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "local", run_id: "r1", ttl_ms: 600000 });
  const c = await do1.claim({
    date: DIA, claimant: "remote", run_id: "r2", ttl_ms: 0, force: true,
  });
  assert.equal(c.granted, true);
});

test("renew exige o mesmo detentor", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  const ok = await do1.renew({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  assert.equal(ok.ok, true);
  const nok = await do1.renew({ date: DIA, claimant: "remote", run_id: "rX", ttl_ms: 600000 });
  assert.equal(nok.ok, false);
  assert.equal(nok.reason, "not_holder");
});

test("readState devolve estado e reserva", async () => {
  const do1 = makeDo();
  await do1.claim({ date: DIA, claimant: "remote", run_id: "r1", ttl_ms: 600000 });
  const s = await do1.readState({ date: DIA });
  assert.equal(s.state.status, "processing");
  assert.equal(s.reserva.claimant, "remote");
});
