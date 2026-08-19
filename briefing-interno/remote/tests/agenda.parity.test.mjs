// agenda.parity.test.mjs — paridade da agenda portada contra o agenda_agent.py.
//
// O golden (tests/fixtures/agenda_golden.json) e gerado pelo proprio
// agenda_agent.py via tests/fixtures/generate_agenda_fixture.py. Divergencia
// aqui e falha de build: nao publicar o worker.
//
// Roda com: node --test tests/

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAgenda } from "../src/agenda.js";

const golden = JSON.parse(
  readFileSync(new URL("./fixtures/agenda_golden.json", import.meta.url), "utf8"),
);

test("paridade: toda data representativa bate com o agenda_agent.py", () => {
  const datas = Object.keys(golden.dates);
  assert.ok(datas.length >= 40, `golden com ${datas.length} datas (esperado >= 40)`);
  for (const iso of datas) {
    const expected = golden.dates[iso];
    const { payload, agendaStatus } = buildAgenda(iso, golden.ibge_all_items, {
      agoraIso: "FIXTURE",
    });
    assert.equal(agendaStatus, "ok", `agendaStatus da data ${iso}`);
    assert.deepStrictEqual(payload, expected, `payload da data ${iso}`);
  }
});

test("falha do IBGE marca agenda degradada e mantem os calendarios fixos", () => {
  const { payload, agendaStatus } = buildAgenda("2026-08-18", golden.ibge_all_items, {
    ibgeErros: 1,
    agoraIso: "FIXTURE",
  });
  assert.equal(agendaStatus, "degradado");
  assert.ok(
    payload.eventos.some((e) => e.evento === "Boletim Focus"),
    "Focus deterministico presente mesmo degradado",
  );
});

test("degradada nunca inventa evento IBGE quando a coleta falha por completo", () => {
  const { payload, agendaStatus } = buildAgenda("2026-08-18", [], {
    ibgeErros: 2,
    agoraIso: "FIXTURE",
  });
  assert.equal(agendaStatus, "degradado");
  assert.ok(
    !payload.eventos.some((e) => e.fonte === "IBGE"),
    "nenhum evento com fonte IBGE quando a API falhou",
  );
});

test("janela do fim de semana rola para a proxima semana (janela_seg_sex)", () => {
  const sabado = buildAgenda("2026-09-19", [], { agoraIso: "FIXTURE" });
  assert.equal(sabado.payload.janela.inicio, "2026-09-21");
  assert.equal(sabado.payload.janela.fim, "2026-09-25");
  const domingo = buildAgenda("2026-09-20", [], { agoraIso: "FIXTURE" });
  assert.equal(domingo.payload.janela.inicio, "2026-09-21");
});
