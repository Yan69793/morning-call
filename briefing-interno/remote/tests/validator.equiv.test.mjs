// validator.equiv.test.mjs — equivalencia do validador portado contra o
// validador Python real. Data de referencia: 20260824 — unico dia com html,
// noticias/estado/precos completos e validacao_20260824.json APROVADO real do
// Python. Os dias 17-21 nao tem precos proprio e a REGRA 6 (fail-closed)
// os reprova em bloco; a paridade das regras 1-5+6 e coberta aqui no dia
// completo, e o caso REPROVADO (REGRA 1) usa o briefing_20260820 com a URL
// de web search que contradiz o pool.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validar, normalizeUrl } from "../src/validate/briefing.js";

const REPO = new URL("../../", import.meta.url); // = briefing-interno/
const read = (p) => JSON.parse(readFileSync(new URL(p, REPO), "utf8"));
const readHtml = (n) => readFileSync(new URL(`outputs/${n}`, REPO), "utf8");

const DATA = "20260824";
const noticias = read(`logs/noticias_${DATA}.json`);
const estado = read(`logs/estado_${DATA}.json`);
const exposicao = read("projetos-exposicao.json");
const precos = read(`logs/precos_${DATA}.json`);
const htmlAprovado = readHtml(`briefing_${DATA}.html`);

test(`HTML aprovado de ${DATA} segue APROVADO no port (regras 1-6)`, () => {
  const r = validar(htmlAprovado, noticias, estado, exposicao, precos);
  assert.equal(r.resultado, "APROVADO", JSON.stringify(r.problemas, null, 2));
  assert.equal(r.log.n_direcionais, 4);
  assert.equal(r.log.n_confiancas, 4);
});

test("veredictos batem com o validacao_20260824.json real do Python", () => {
  const realLog = read(`logs/validacao_${DATA}.json`);
  assert.equal(realLog.resultado, "APROVADO");
  const r = validar(htmlAprovado, noticias, estado, exposicao, precos);
  assert.equal(r.log.n_direcionais, realLog.n_direcionais);
  assert.equal(r.log.n_confiancas, realLog.n_confiancas);
  assert.equal(r.log.n_urls_no_html, realLog.n_urls_no_html);
});

test("sem precos o port reprova na REGRA 6 (fail-closed numerico)", () => {
  const r = validar(htmlAprovado, noticias, estado, exposicao, null);
  assert.equal(r.resultado, "REPROVADO");
  assert.ok(r.problemas.some((p) => p.includes("REGRA 6: precos_YYYYMMDD.json nao encontrado")));
});

test("normalizeUrl bate com a _normalize_url do Python (casos do pool real)", () => {
  assert.equal(
    normalizeUrl("https://g1.globo.com/mundo/noticia/2026/08/teera.ghtml"),
    "g1.globo.com/mundo/noticia/2026/08/teera.ghtml",
  );
  assert.equal(normalizeUrl("https://www.Infomoney.com.br/mercados/abc/"), "infomoney.com.br/mercados/abc");
  assert.equal(normalizeUrl("www.poder360.com.br/economia"), "poder360.com.br/economia");
  assert.equal(normalizeUrl("https://agenciabrasil.ebc.com.br/x.ghtml."), "agenciabrasil.ebc.com.br/x.ghtml");
});
