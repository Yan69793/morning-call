// validator.regra6.test.mjs — REGRA 6 (porta de _check_numeros_mercado).
//
// Usa HTMLs e precos_*.json REAIS do disco (falha fechada numerica). O caso
// canonico e o briefing_20260820.html, que afirmou Ibovespa em 118.753,48
// quando o fechamento de 19/08 foi 167.830 — o portao precisa REPROVAR. O
// briefing_20260824.html (IBOV correto) precisa APROVAR. Sem precos o portao
// reprova por fail-closed (o erro mais caro nao pode passar aprovado).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validar,
  checkNumerosMercado,
  normalizar,
  parseNumBR,
} from "../src/validate/briefing.js";

const REPO = new URL("../../", import.meta.url); // = briefing-interno/
const read = (p) => JSON.parse(readFileSync(new URL(p, REPO), "utf8"));
const readHtml = (n) => readFileSync(new URL(`outputs/${n}`, REPO), "utf8");
const expo = read("projetos-exposicao.json");

// ---- helpers de paridade -------------------------------------------------

test("parseNumBR bate com _parse_num_br do Python (milhar, decimal, misto)", () => {
  assert.equal(parseNumBR("118.753,48"), 118753.48);
  assert.equal(parseNumBR("5,17"), 5.17);
  assert.equal(parseNumBR("171.032"), 171032);
  assert.equal(parseNumBR("1.5"), 1.5);
  assert.equal(parseNumBR("14"), 14);
  assert.equal(parseNumBR(""), null);
  assert.equal(parseNumBR("abc"), null);
});

test("normalizar tira acento e baixa (casa alias com o texto)", () => {
  assert.equal(normalizar("Ibovespa"), "ibovespa");
  assert.equal(normalizar("Índice de Preços"), "indice de precos");
  assert.equal(normalizar("DÓLAR"), "dolar");
});

// ---- caso canonico: 20/08 inventou IBOV -----------------------------------

test("REGRA 6 REPROVA o briefing_20260820 (IBOV 118.753,48 vs fechamento 167.830)", () => {
  const noticias = read("logs/noticias_20260820.json");
  const estado = read("logs/estado_20260820.json");
  const precos = read("logs/precos_20260820.json");
  const r = validar(readHtml("briefing_20260820.html"), noticias, estado, expo, precos);
  assert.equal(r.resultado, "REPROVADO");
  const regra6 = r.problemas.find((p) => p.startsWith("REGRA 6: IBOV"));
  assert.ok(regra6, `REGRA 6 esperada: ${JSON.stringify(r.problemas)}`);
  assert.ok(regra6.includes("118753.48"), regra6);
  assert.ok(regra6.includes("167830"), regra6);
  // o numero do dolar corrigido NAO deve reprovar (5,17 vs 5,1714)
  assert.ok(!r.problemas.some((p) => p.includes("USDBRL")));
});

// ---- 24/08 aprovado e consultado de forma consistente ---------------------

test("24/08 com precos real: IBOV citado correto nao reprova", () => {
  const noticias = read("logs/noticias_20260824.json");
  const estado = read("logs/estado_20260824.json");
  const precos = read("logs/precos_20260824.json");
  const r = validar(readHtml("briefing_20260824.html"), noticias, estado, expo, precos);
  assert.equal(r.resultado, "APROVADO", JSON.stringify(r.problemas));
});

// ---- fail-closed numerico --------------------------------------------------

test("sem precos o portao reprova (fail-closed na classe de numero)", () => {
  const noticias = read("logs/noticias_20260824.json");
  const estado = read("logs/estado_20260824.json");
  const r = validar(readHtml("briefing_20260824.html"), noticias, estado, expo, null);
  assert.equal(r.resultado, "REPROVADO");
  assert.ok(r.problemas.some((p) => p.includes("REGRA 6: precos_YYYYMMDD.json nao encontrado")));
});

test("precos vazio (0 ativos) reprova como cego — arquivo no lugar e pior", () => {
  const noticias = read("logs/noticias_20260824.json");
  const estado = read("logs/estado_20260824.json");
  const r = validar(readHtml("briefing_20260824.html"), noticias, estado, expo, { ativos: {} });
  assert.equal(r.resultado, "REPROVADO");
  assert.ok(r.problemas.some((p) => p.includes("REGRA 6: precos sem nenhum ativo")));
});

// ---- casos de numero exato de paridade ------------------------------------

test("checkNumerosMercado: ativo sem numero na janela nao e erro; errado reprova, certo passa", () => {
  // html sintetico: cita IBOV certo e dolar errado
  const html =
    "<p>O Ibovespa fechou em 171.032 pontos e o dolar a R$ 6,00, acima.</p>";
  const precos = read("logs/precos_20260824.json");
  const [p, o] = checkNumerosMercado(html, precos);
  const ibovErr = p.find((x) => x.includes("REGRA 6: IBOV"));
  const usdErr = p.find((x) => x.includes("REGRA 6: USDBRL"));
  // Ibovespa 171.032 vs fechamento 171032.0 (dentro de 0.5%) -> ok
  // dolar 6.0 vs 5.1625 (divergencia 16%) -> reprova
  assert.equal(ibovErr, undefined, `IBOV correto nao deve reprovar: ${JSON.stringify(p)}`);
  assert.ok(usdErr && usdErr.includes("6"), `USDBRL errado deve reprovar: ${JSON.stringify(p)}`);
  const okIbov = o.find((x) => x.startsWith("IBOV"));
  assert.ok(okIbov && okIbov.includes("confere"), JSON.stringify(o));
});

test("checkNumerosMercado: precos sem close reproduz o problema cego", () => {
  const precos = { ativos: { IBOV: { trade_date: "2026-08-19" } } }; // sem close
  const [p] = checkNumerosMercado("<p>Ibovespa em 171.032 pontos</p>", precos);
  assert.ok(p.some((x) => x.includes("sem close ou sem trade_date")));
});

// ---- camadas 1 e 3 (26/08/2026, espelho de test_regra6_numeros.py) ---------

test("camada 1: numero sem marcador confere (defeito de 26/08, cru e formatado)", () => {
  const precos = {
    ativos: {
      IBOV: { classe: "indice", unidade: "pct", tolerancia: 0.5, close: 174577.0, trade_date: "2026-08-25" },
    },
  };
  for (const html of [
    "<p>O Ibovespa subiu 0,41% a 174577.0 no fechamento de ontem.</p>",
    "<p>O Ibovespa subiu 0,41% a 174.577 no fechamento de ontem.</p>",
  ]) {
    const [p, o] = checkNumerosMercado(html, precos);
    assert.deepEqual(p, [], JSON.stringify(p));
    assert.equal(o.length, 1, JSON.stringify(o));
    assert.ok(o[0].includes("174577"), JSON.stringify(o));
  }
});

test("camada 3: indice sem marcador fora do fechamento reprova", () => {
  const precos = {
    ativos: {
      IBOV: { classe: "indice", unidade: "pct", tolerancia: 0.5, close: 174577.0, trade_date: "2026-08-25" },
    },
  };
  const [p, o] = checkNumerosMercado(
    "<p>O Ibovespa avancou para 118.753 no fechamento de ontem.</p>",
    precos,
  );
  assert.ok(p.some((x) => x.includes("REGRA 6: IBOV")), JSON.stringify(p));
  assert.deepEqual(o, []);
});

test("ano nao cai na banda e nao gera claim (sem excecao de ano)", () => {
  const precos = {
    ativos: {
      SPX: { classe: "indice", unidade: "pct", tolerancia: 0.5, close: 7677.28, trade_date: "2026-08-25" },
    },
  };
  const [p, o] = checkNumerosMercado(
    "<p>O S&P 500 subiu 12% desde 2026 com o novo ciclo.</p>",
    precos,
  );
  assert.deepEqual(p, []);
  assert.deepEqual(o, []);
});

test("cambio sem marcador fora da tolerancia fica silencioso (limite aceito)", () => {
  const precos = {
    ativos: {
      USDBRL: { classe: "cambio", unidade: "pct", tolerancia: 1.0, close: 5.1714, trade_date: "2026-08-25" },
    },
  };
  const [p, o] = checkNumerosMercado(
    "<p>O dolar abriu a 5,00 depois da abertura dos mercados.</p>",
    precos,
  );
  assert.deepEqual(p, []);
  assert.deepEqual(o, []);
});
