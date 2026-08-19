// prompt.equiv.test.mjs — equivalencia byte a byte do buildUserPrompt portado
// contra o _build_user_prompt do Python real (fixture prompt_esperado.txt,
// gerada sobre os JSONs reais de 18/08 + a agenda-data.json vigente).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildUserPrompt } from "../src/generate/briefing.js";

const REPO = new URL("../../", import.meta.url); // = briefing-interno/
const FIXTURES = new URL("fixtures/", import.meta.url);
// tests/ -> remote/ -> briefing-interno/ -> Morning Call/ -> FREQUENTE/
const SITE = new URL("../../../../Site/site-producao/", import.meta.url);

const noticias = JSON.parse(readFileSync(new URL("logs/noticias_20260818.json", REPO), "utf8"));
const estado = JSON.parse(readFileSync(new URL("logs/estado_20260818.json", REPO), "utf8"));
const exposicao = JSON.parse(readFileSync(new URL("projetos-exposicao.json", REPO), "utf8"));
const agenda = JSON.parse(readFileSync(new URL("agenda-data.json", SITE), "utf8"));
const esperado = readFileSync(new URL("prompt_esperado.txt", FIXTURES), "utf8");

test("buildUserPrompt bate byte a byte com o Python (18/08, agenda real)", () => {
  const obtido = buildUserPrompt(noticias, estado, exposicao, "20260818", agenda, "ok");
  assert.equal(obtido, esperado);
});

test("blocoAgenda degradado adiciona a linha de fonte parcial e nunca inventa", async () => {
  const { blocoAgenda } = await import("../src/generate/briefing.js");
  const bloco = blocoAgenda(agenda, "20260818", "degradado");
  assert.ok(bloco.includes("FONTE PARCIAL"));
  assert.ok(bloco.includes("NAO complete com eventos de memoria"));
  const blocoOk = blocoAgenda(agenda, "20260818", "ok");
  assert.ok(!blocoOk.includes("FONTE PARCIAL"));
  assert.equal(blocoOk, bloco.replace(/\n- FONTE PARCIAL[^\n]*/, ""));
});
