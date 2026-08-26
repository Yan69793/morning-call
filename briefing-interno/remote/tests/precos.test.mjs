// precos.test.mjs — cobertura do coletor de precos portado (collect/precos.js).
//
// Sem rede: todo fetch e mockado por URL. Cobre os 3 filtros de barra do
// Yahoo (pregao corrente, barra sintetica do regularMarketTime, dedupe por
// data), os erros de fonte registrados em `erros` (nunca excecao), o parse do
// PTAX (truncado em 10 chars) e do SGS (datas futuras fora, patamar anterior),
// o quorum (fonte_unica/ok/divergencia, pct e bp) e o shape final do payload.

import test from "node:test";
import assert from "node:assert/strict";
import {
  barrasDiarias,
  arredondaCotacao,
  fetchYahooFechamentos,
  fetchPtax,
  fetchSelic,
  quorum,
  coletarPrecos,
  ATIVOS_META,
} from "../src/collect/precos.js";

// ---- helpers ---------------------------------------------------------------

const AGORA = Date.parse("2026-08-25T12:00:00Z"); // 25/08/2026 12:00 UTC
const OFFSET_SP = -10800; // gmtoffset de Sao Paulo (mesmo do ^BVSP real)

// ts que cai no dia `dateStr` no fuso da bolsa (offset -3h):
// (ts + offsetSec) precisa cair naquele dia em UTC.
const tsPara = (dateStr) => Date.parse(`${dateStr}T00:00:00Z`) / 1000 + 3 * 3600;

function mockResp(data) {
  return { ok: true, json: async () => data };
}

// chart do Yahoo com barras diarias construidas; `marketTimeTs` opcional.
function chartResult(barras, { marketTimeTs = null, gmtoffset = OFFSET_SP } = {}) {
  return {
    meta: { gmtoffset, regularMarketTime: marketTimeTs },
    timestamp: barras.map((b) => b[0]),
    indicators: { quote: [{ close: barras.map((b) => b[1]) }] },
  };
}

// fetch mockado que roteia por substring da URL. Rota desconhecida lanca
// (falha de rede) — o getJson captura e vira erro registrado em `erros`.
function mockFetch(routes) {
  return async (url) => {
    for (const [chave, resp] of routes) {
      if (url.includes(chave)) {
        if (resp === null) throw new Error("mock: rede fora do ar");
        return mockResp(resp);
      }
    }
    throw new Error(`mock: rota nao roteada: ${url}`);
  };
}

// ---- barrasDiarias ---------------------------------------------------------

test("barrasDiarias aplica os 3 filtros: pregao corrente, barra sintetica, dedupe", () => {
  const barras = [
    [tsPara("2026-08-21"), 171032],
    [tsPara("2026-08-24"), 171907], // oficial
    [tsPara("2026-08-24"), 171999.5], // sintetica duplicada do mesmo dia (descarta)
    [tsPara("2026-08-25"), 172100], // pregao corrente (descarta)
  ];
  const marketTime = tsPara("2026-08-25") + 3600; // barra ao vivo
  const result = chartResult(barras, { marketTimeTs: marketTime });
  // barra sintetica com ts == regularMarketTime (filtro 2) adicionada
  result.timestamp.push(marketTime);
  result.indicators.quote[0].close.push(172200);

  const obtido = barrasDiarias(result, AGORA);
  assert.deepStrictEqual(obtido, [
    ["2026-08-21", 171032],
    ["2026-08-24", 171907], // primeira ocorrencia vence
  ]);
});

test("barrasDiarias ignora close nulo e devolve [] sem barras validas", () => {
  const result = chartResult([
    [tsPara("2026-08-25"), null],
    [tsPara("2026-08-24"), null],
  ]);
  assert.deepStrictEqual(barrasDiarias(result, AGORA), []);
});

// ---- arredondaCotacao ------------------------------------------------------

test("arredondaCotacao: 2 casas acima de 100, 4 abaixo, null passa", () => {
  assert.equal(arredondaCotacao(7674.3701171875), 7674.37);
  assert.equal(arredondaCotacao(15.130000114440918), 15.13);
  assert.equal(arredondaCotacao(171907.0), 171907);
  assert.equal(arredondaCotacao(Number("5.1512000000001")), 5.1512);
  assert.equal(arredondaCotacao(null), null);
  assert.equal(arredondaCotacao(undefined), null);
});

// ---- fetchYahooFechamentos -------------------------------------------------

test("fetchYahooFechamentos devolve close/trade_date/change_percent por simbolo", async () => {
  const routes = new Map([
    [
      "%5EBVSP",
      {
        chart: {
          result: [
            chartResult([
              [tsPara("2026-08-21"), 170448.875],
              [tsPara("2026-08-24"), 171907.0],
            ]),
          ],
        },
      },
    ],
  ]);
  const [out, erros] = await fetchYahooFechamentos({ IBOV: "^BVSP" }, mockFetch(routes), AGORA);
  assert.deepStrictEqual(erros, []);
  assert.deepStrictEqual(out.IBOV, {
    close: 171907,
    trade_date: "2026-08-24",
    previous_close: 170448.88,
    change_percent: 0.86, // round((171907-170448.875)/170448.875*100, 2)
    simbolo: "^BVSP",
  });
});

test("fetchYahooFechamentos registra erros: sem resposta, sem chart.result, sem barra", async () => {
  const routes = new Map([
    ["SEM_RESPOSTA", null], // rota explicita com null = rede fora do ar (throw)
    ["SEM_RESULT", { chart: {} }],
    ["SEM_BARRA", { chart: { result: [chartResult([])] } }],
  ]);
  const symbols = { A: "SEM_RESPOSTA", B: "SEM_RESULT", C: "SEM_BARRA" };
  const [out, erros] = await fetchYahooFechamentos(symbols, mockFetch(routes), AGORA);
  assert.deepStrictEqual(out, {});
  assert.equal(erros.length, 3);
  assert.ok(erros.some((e) => e.includes("A: Yahoo sem resposta")));
  assert.ok(erros.some((e) => e.includes("B: resposta do Yahoo sem chart.result")));
  assert.ok(erros.some((e) => e.includes("C: nenhuma barra de pregao encerrado")));
});

// ---- fetchPtax -------------------------------------------------------------

test("fetchPtax parseia e trunca dataHoraCotacao em 10 chars", async () => {
  const routes = new Map([
    [
      "CotacaoDolarPeriodo",
      {
        value: [
          { cotacaoVenda: "5.1500", dataHoraCotacao: "2026-08-21T13:00:00-03:00" },
          { cotacaoVenda: "5.1512", dataHoraCotacao: "2026-08-24T13:00:00-03:00" },
        ],
      },
    ],
  ]);
  const [dado, erro] = await fetchPtax(mockFetch(routes), AGORA);
  assert.equal(erro, null);
  assert.equal(dado.close, 5.1512);
  assert.equal(dado.trade_date, "2026-08-24"); // nao "2026-08-24T13:00:00-03:00"
  assert.equal(dado.previous_close, 5.15);
  assert.equal(dado.change_percent, 0.02);
});

test("fetchPtax: sem resposta e janela vazia viram erro", async () => {
  const [d1, e1] = await fetchPtax(mockFetch(new Map([["Cotacao", null]])), AGORA);
  assert.equal(d1, null);
  assert.ok(e1.includes("PTAX: sem resposta"));

  const [d2, e2] = await fetchPtax(
    mockFetch(new Map([["Cotacao", { value: [] }]])),
    AGORA,
  );
  assert.equal(d2, null);
  assert.ok(e2.includes("janela de 10 dias sem cotacao"));
});

// ---- fetchSelic ------------------------------------------------------------

test("fetchSelic: datas futuras fora, patamar anterior e o ultimo valor diferente", async () => {
  // serie 432 publicada para frente: 28/08 e 16/09 sao futuros e saem.
  const routes = new Map([
    [
      "bcdata.sgs.432",
      [
        { data: "24/08/2026", valor: "14.00" },
        { data: "25/08/2026", valor: "14.00" },
        { data: "28/08/2026", valor: "14.00" },
        { data: "16/09/2026", valor: "15.00" },
      ],
    ],
  ]);
  const [dado, erro] = await fetchSelic(mockFetch(routes), AGORA);
  assert.equal(erro, null);
  assert.equal(dado.trade_date, "2026-08-25"); // ultimo passado, nao o futuro
  assert.equal(dado.close, 14);
  assert.equal(dado.previous_close, null); // nenhum valor anterior DIFERENTE de 14
  assert.equal(dado.change_percent, null);
});

test("fetchSelic: patamar anterior diferente e encontrado", async () => {
  const routes = new Map([
    [
      "bcdata.sgs.432",
      [
        { data: "20/08/2026", valor: "13.75" },
        { data: "21/08/2026", valor: "14.00" },
        { data: "24/08/2026", valor: "14.00" },
      ],
    ],
  ]);
  const [dado] = await fetchSelic(mockFetch(routes), AGORA);
  assert.equal(dado.close, 14);
  assert.equal(dado.previous_close, 13.75);
});

test("fetchSelic: lista vazia e fora do formato viram erro", async () => {
  const [d1, e1] = await fetchSelic(mockFetch(new Map([["sgs.432", null]])), AGORA);
  assert.equal(d1, null);
  assert.ok(e1.includes("SGS 432: sem resposta"));

  const [d2, e2] = await fetchSelic(mockFetch(new Map([["sgs.432", { nao: "lista" }]])), AGORA);
  assert.equal(d2, null);
  assert.ok(e2.includes("fora do formato de lista"));
});

// ---- quorum ----------------------------------------------------------------

test("quorum: fonte_unica sem secundaria, ok dentro da tolerancia, divergencia acima", () => {
  const meta = ATIVOS_META.IBOV; // pct, tolerancia 0.5
  assert.equal(quorum("IBOV", { close: 171907 }, null).quorum, "fonte_unica");
  assert.equal(quorum("IBOV", { close: 171907 }, null).tolerancia, meta.tolerancia);

  // divergencia de 0.1% < 0.5% -> ok
  assert.equal(
    quorum("IBOV", { close: 100 }, { close: 100.1 }).quorum,
    "ok",
  );
  // divergencia de 1% > 0.5% -> divergencia
  const div = quorum("IBOV", { close: 100 }, { close: 101 });
  assert.equal(div.quorum, "divergencia");
  assert.equal(div.divergencia_pct, 1);
  assert.ok(div.fonte_secundaria);
});

test("quorum: SELIC compara em bp, nao em pct", () => {
  // 0,02 p.p. = 2 bp, dentro da tolerancia de 5 bp
  assert.equal(quorum("SELIC", { close: 14.0 }, { close: 14.02 }).quorum, "ok");
  // 0,1 p.p. = 10 bp, acima (longe do rolamento de float do limite exato)
  assert.equal(quorum("SELIC", { close: 14.0 }, { close: 14.1 }).quorum, "divergencia");
  // 5 bp e o limite exato; o float de 10x o desloca para "acima" (mesma
  // paridade com o Python, que computa abs(14.0-14.05)*100 = 5.0000...7).
  assert.equal(quorum("SELIC", { close: 14.0 }, { close: 14.05 }).quorum, "divergencia");
});

// ---- coletarPrecos (shape final) -------------------------------------------

test("coletarPrecos monta o payload com PTAX mandando no USDBRL e erros registrados", async () => {
  const routes = new Map([
    [
      "%5EBVSP",
      { chart: { result: [chartResult([[tsPara("2026-08-24"), 171907.0]])] } },
    ],
    [
      "BRL%3DX",
      { chart: { result: [chartResult([[tsPara("2026-08-24"), 5.1505]])] } },
    ],
    [
      "CotacaoDolarPeriodo",
      {
        value: [{ cotacaoVenda: "5.1512", dataHoraCotacao: "2026-08-24T13:00:00-03:00" }],
      },
    ],
    [
      "bcdata.sgs.432",
      [{ data: "24/08/2026", valor: "14.00" }],
    ],
  ]);
  const p = await coletarPrecos({
    dateTag: "20260825",
    fetchImpl: mockFetch(routes),
    nowMs: AGORA,
  });

  assert.equal(p.data_coleta, "20260825");
  assert.ok(p.coletado_em.endsWith("-03:00"), `coletado_em em BRT: ${p.coletado_em}`);
  assert.equal(p.n_ativos, 3);

  // 12 simbolos do YAHOO_SYMBOLS nao roteados caem como "rede fora do ar"
  // → viram erro registrado em `erros` (os ativos de interesse sao 3).
  assert.equal(p.erros.length, 12);
  assert.ok(p.erros.every((e) => e.includes("sem resposta")));

  // USDBRL: PTAX e primario, Yahoo vira fonte_secundaria com quorum ok
  // (divergencia 5.1512 vs 5.1505 = 0.014% < 1%).
  const usd = p.ativos.USDBRL;
  assert.equal(usd.close, 5.1512);
  assert.equal(usd.fonte, "BCB PTAX (Olinda), venda");
  assert.equal(usd.quorum, "ok");
  assert.equal(usd.fonte_secundaria.fonte, "Yahoo Finance (BRL=X)");

  assert.equal(p.ativos.IBOV.close, 171907);
  assert.equal(p.ativos.IBOV.fonte, "Yahoo Finance (^BVSP)");
  assert.equal(p.ativos.SELIC.close, 14);
  assert.equal(p.ativos.SELIC.fonte, "BCB SGS serie 432 (meta Selic Copom)");
});

test("coletarPrecos: ativo com Yahoo quebrado vira erro, nao excecao", async () => {
  const routes = new Map([
    ["%5EBVSP", null], // Yahoo fora do ar para o IBOV
    [
      "CotacaoDolarPeriodo",
      { value: [{ cotacaoVenda: "5.1512", dataHoraCotacao: "2026-08-24T13:00:00-03:00" }] },
    ],
    ["bcdata.sgs.432", [{ data: "24/08/2026", valor: "14.00" }]],
  ]);
  const p = await coletarPrecos({
    dateTag: "20260825",
    fetchImpl: mockFetch(routes),
    nowMs: AGORA,
  });
  assert.ok(p.erros.some((e) => e.includes("IBOV: Yahoo sem resposta")));
  assert.equal(p.ativos.IBOV, undefined);
  assert.equal(p.ativos.USDBRL.close, 5.1512); // PTAX segue independente
  assert.equal(p.n_ativos, 2);
});
