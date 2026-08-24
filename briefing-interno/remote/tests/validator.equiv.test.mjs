// validator.equiv.test.mjs — equivalencia do validador portado contra o
// validador Python real, usando os HTMLs e JSONs do disco (18/08).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validar, normalizeUrl } from "../src/validate/briefing.js";

const REPO = new URL("../../", import.meta.url); // = briefing-interno/
const read = (p) =>
  JSON.parse(readFileSync(new URL(p, REPO), "utf8"));

const noticias = read("logs/noticias_20260818.json");
const estado = read("logs/estado_20260818.json");
const exposicao = read("projetos-exposicao.json");
const htmlAprovado = readFileSync(
  new URL("outputs/briefing_20260818.html", REPO),
  "utf8",
);
const htmlReprovado = readFileSync(
  new URL("outputs/briefing_20260818.html.pre-fix-bak", REPO),
  "utf8",
);

test("HTML aprovado de 18/08 segue APROVADO no port", () => {
  const r = validar(htmlAprovado, noticias, estado, exposicao);
  assert.equal(r.resultado, "APROVADO", JSON.stringify(r.problemas, null, 2));
  assert.equal(r.log.n_direcionais, 3);
  assert.equal(r.log.n_confiancas, 5);
  assert.equal(r.log.n_urls_fora_pool, 0);
});

test("pre-fix-bak (:online) segue REPROVADO na REGRA 1 no port", () => {
  // O pool das 16h24 (rodada :online) foi sobrescrito pela coleta das 21h39,
  // entao a contagem original (2 URLs) nao e reproduzivel com o JSON atual.
  // O que se prova: REGRA 1 dispara e a URL do TSE/deepfakes (assinatura do
  // web search) aparece na lista de fora do pool.
  const r = validar(htmlReprovado, noticias, estado, exposicao);
  assert.equal(r.resultado, "REPROVADO");
  const regra1 = r.problemas.find((p) => p.startsWith("REGRA 1:"));
  assert.ok(regra1, `REGRA 1 esperada, problemas: ${JSON.stringify(r.problemas)}`);
  assert.ok(regra1.includes("g1.globo.com/politica/eleicoes"), regra1);
  assert.ok(regra1.includes("infomoney.com.br/mercados/ibovespa-hoje-bolsa-de-valores-ao-vivo"), regra1);
});

test("veredictos batem com o validacao_20260818.json real do Python", () => {
  const realLog = read("logs/validacao_20260818.json");
  assert.equal(realLog.resultado, "APROVADO");
  const r = validar(htmlAprovado, noticias, estado, exposicao);
  assert.equal(r.log.n_direcionais, realLog.n_direcionais);
  assert.equal(r.log.n_confiancas, realLog.n_confiancas);
  assert.equal(r.log.n_urls_no_html, realLog.n_urls_no_html);
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
