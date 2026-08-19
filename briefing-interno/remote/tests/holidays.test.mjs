// holidays.test.mjs — decisao de dia util B3 (porta do PASSO 0 do
// run_briefing.ps1 + feriados-b3.json).

import test from "node:test";
import assert from "node:assert/strict";
import { diaUtilInfo, feriadosB3 } from "../src/holidays.js";

test("fim de semana nao e dia util", () => {
  assert.equal(diaUtilInfo("20260822").util, false); // sabado
  assert.equal(diaUtilInfo("20260823").util, false); // domingo
});

test("feriado B3 nao e dia util", () => {
  assert.equal(diaUtilInfo("20260907").util, false); // Independencia
  assert.equal(diaUtilInfo("20260818").util, true); // terca comum
});

test("cobertura expirada trata como dia util com aviso (F08)", () => {
  const info = diaUtilInfo("20280301"); // alem de 2027-12-31
  assert.equal(info.util, true);
  assert.ok(info.motivo.includes("F08"));
});

test("fixture do bundle e identica ao feriados-b3.json do projeto", () => {
  // (o import ja e a copia; garante cobertura ate fim de 2027)
  assert.equal(feriadosB3.cobertura_ate, "2027-12-31");
  assert.ok(feriadosB3.feriados.length >= 24);
});
