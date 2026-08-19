// emissor.equiv.test.mjs — equivalencia byte a byte do build_styled_email
// portado contra o Python real (fixtures geradas por
// generate_briefing_fixtures.py a partir dos HTMLs reais do disco).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStyledEmail,
  buildPlainText,
  stripFonteEConfianca,
  dataFormatada,
  pyStrip,
} from "../src/send/resend.js";

const REPO = new URL("../../", import.meta.url); // = briefing-interno/

for (const [dataTag, fixtureName] of [
  ["20260817", "styled_esperado_20260817.html"],
  ["20260818", "styled_esperado_20260818.html"],
]) {
  test(`buildStyledEmail ${dataTag} bate byte a byte com o Python`, () => {
    const html = readFileSync(new URL(`outputs/briefing_${dataTag}.html`, REPO), "utf8");
    const esperado = readFileSync(
      new URL(`tests/fixtures/${fixtureName}`, new URL("../", import.meta.url)),
      "utf8",
    );
    const dataFmt = dataFormatada(dataTag);
    const obtido = buildStyledEmail(html, dataFmt);
    assert.equal(obtido, esperado);
  });
}

test("stripFonteEConfianca: parentese de confianca sai com o espaco junto", () => {
  assert.equal(
    stripFonteEConfianca("Vale tende a subir (confianca: 0.7) hoje"),
    "Vale tende a subir hoje",
  );
  assert.equal(
    stripFonteEConfianca("X Confianca: 0.8. fim"),
    "X fim",
  );
  // colchete que nao parece URL fica
  assert.equal(
    stripFonteEConfianca("dado via [fallback Yahoo Finance]"),
    "dado via [fallback Yahoo Finance]",
  );
  // colchete com URL sai
  assert.equal(
    stripFonteEConfianca("conforme [https://g1.globo.com/economia/x.ghtml] hoje"),
    "conforme  hoje",
  );
});

test("pyStrip remove espacos e \\xa0 como o str.strip do Python", () => {
  assert.equal(pyStrip("  a  "), "a");
  assert.equal(pyStrip(" a "), "a");
});

test("buildPlainText extrai texto puro do HTML aprovado", () => {
  const html = readFileSync(new URL("outputs/briefing_20260818.html", REPO), "utf8");
  const plain = buildPlainText(html);
  assert.ok(plain.includes("RESUMO"));
  assert.ok(!plain.includes("<"));
});
