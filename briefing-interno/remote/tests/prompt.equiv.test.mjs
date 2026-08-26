// prompt.equiv.test.mjs — equivalencia byte a byte do buildUserPrompt portado
// contra o _build_user_prompt do Python real (fixture prompt_esperado.txt,
// gerada sobre os JSONs congelados de 24/08: noticias/estado/precos do disco
// locais + agenda na fixture agenda_24.json — nunca no site vivo).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildUserPrompt } from "../src/generate/briefing.js";

const REPO = new URL("../../", import.meta.url); // = briefing-interno/
const FIXTURES = new URL("fixtures/", import.meta.url);
const DATA_REF = "20260824"; // unico dia com noticias+estado+precos completos

const noticias = JSON.parse(readFileSync(new URL(`logs/noticias_${DATA_REF}.json`, REPO), "utf8"));
const estado = JSON.parse(readFileSync(new URL(`logs/estado_${DATA_REF}.json`, REPO), "utf8"));
const exposicao = JSON.parse(readFileSync(new URL("projetos-exposicao.json", REPO), "utf8"));
const precos = JSON.parse(readFileSync(new URL(`logs/precos_${DATA_REF}.json`, REPO), "utf8"));
const agenda = readAgendaFixture();
const esperado = readFileSync(new URL("prompt_esperado.txt", FIXTURES), "utf8");

// A agenda do snapshot vive NA FIXTURE (agenda_24.json, congelada do site em
// 24/08), nao no arquivo vivo do site. Isso prende o snapshot a um estado
// estavel e elimina o drift da pendencia #5; o site nao e mais lido aqui.
function readAgendaFixture() {
  return JSON.parse(readFileSync(new URL("fixtures/agenda_24.json", import.meta.url), "utf8"));
}

test("buildUserPrompt bate byte a byte com o Python (24/08, agenda congelada + precos real)", () => {
  const obtido = buildUserPrompt(noticias, estado, exposicao, DATA_REF, agenda, "ok", precos);
  assert.equal(obtido, esperado);
});

test("blocoAgenda degradado adiciona a linha de fonte parcial e nunca inventa", async () => {
  const { blocoAgenda } = await import("../src/generate/briefing.js");
  const bloco = blocoAgenda(agenda, DATA_REF, "degradado");
  assert.ok(bloco.includes("FONTE PARCIAL"));
  assert.ok(bloco.includes("NAO complete com eventos de memoria"));
  const blocoOk = blocoAgenda(agenda, DATA_REF, "ok");
  assert.ok(!blocoOk.includes("FONTE PARCIAL"));
  assert.equal(blocoOk, bloco.replace(/\n- FONTE PARCIAL[^\n]*/, ""));
});

test("blocoPrecos: sem ativos injeta INDISPONIVEL, com ativos injeta a tabela real", async () => {
  const { blocoPrecos } = await import("../src/generate/briefing.js");
  const indisponivel = blocoPrecos({ ativos: {} });
  assert.ok(indisponivel.includes("INDISPONIVEL"));
  assert.ok(indisponivel.includes("Nao cite nivel, cotacao ou pontuacao"));
  const real = blocoPrecos(precos);
  assert.ok(real.includes("=== COTACOES (fechamento do ultimo pregao encerrado) ==="));
  assert.ok(real.includes("IBOV: 171.032 pontos"));
  assert.ok(real.includes("SELIC: 14,00% a.a."));
  assert.ok(!real.includes("INDISPONIVEL"));
  // o close cru do Yahoo nunca mais chega ao prompt (26/08/2026)
  assert.ok(!real.includes("171032.0"));
  assert.ok(!real.includes("14.0"));
});
