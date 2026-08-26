// Paridade de formatacao com o Python via fixture compartilhada.
// Le o MESMO fmt_vectors.json que tests/test_fmt_precos.py usa e exige saida
// identica de fmtNumBR/fmtNivel. O toFixed arredonda o MESMO double que o
// f-string do Python; rodar pyRound antes introduziria erro de float a mais
// (2.675*100 = 267.5 exato) e o vetor 2.675 quebraria aqui.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { fmtNivel, fmtNumBR } from "../src/generate/briefing.js";

const fixture = JSON.parse(
  readFileSync(new URL("fixtures/fmt_vectors.json", import.meta.url), "utf-8"),
);

test("fmtNumBR bate com o Python nos vetores compartilhados", () => {
  for (const v of fixture.decimais) {
    assert.equal(
      fmtNumBR(v.valor, v.decimais),
      v.esperado,
      `valor ${v.valor} dec ${v.decimais}`,
    );
  }
});

test("fmtNivel bate com o Python nos vetores compartilhados", () => {
  for (const v of fixture.niveis) {
    assert.equal(fmtNivel(v.ticker, v.valor), v.esperado, `ticker ${v.ticker}`);
  }
});
