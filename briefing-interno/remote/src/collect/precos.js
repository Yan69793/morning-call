// collect/precos.js — porta de coletar_precos.py (cotacao de fechamento).
//
// Mesma arquitetura do local, criado em 24/08/2026 para matar o numero
// escrito de memoria: o briefing citava nivel de indice sem receber cotacao
// no prompt. Este modulo alimenta dois consumidores no remote:
//   - generate/briefing.js, que injeta o bloco COTACOES no prompt sempre;
//   - validate/briefing.js REGRA 6, que confronta numero citado com cotacao.
//
// Duas fontes, sem chave: Yahoo Finance v8 chart (indice/acao/commodity/
// cripto/cambio) e BCB (PTAX Olinda para o dolar oficial, SGS serie 432 para
// a meta Selic). O trade_date e sempre o do pregao encerrado, nunca o dia de
// coleta — a barra do pregao corrente e descartada (3 filtros, ver
// barrasDiarias).
//
// Saida: shape identico ao logs/precos_YYYYMMDD.json do pipeline local.
// Erro de fonte vira entrada em `erros`, nunca excecao que derruba a coleta
// dos outros ativos. Se nenhum ativo vier, o run.js aborta como failed
// (fail-closed da REGRA 6, igual ao exit != 0 do Python).

import { YAHOO_SYMBOLS } from "./estado.js";
import { UA } from "./noticias.js";

export const PTAX_URL =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
  "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
  "?@dataInicial='{ini}'&@dataFinalCotacao='{fim}'&$format=json&$top=100";
export const SGS_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados" +
  "?formato=json&dataInicial={ini}&dataFinal={fim}";
export const SGS_META_SELIC = 432;

// ATIVOS_META portado de _comum.py. Tolerancia por classe, nao unica: 1% em
// cima de 5,16 (dolar) sao 5 centavos, 1% em cima de 170.000 (Ibovespa) sao
// 1.700 pontos. "pct" compara variacao percentual; "bp" compara pontos-base
// (juro), onde 0,25 p.p. e uma decisao de Copom inteira.
//
// display_unit e display_decimals (26/08/2026): a precisao de EXIBICAO por
// ativo, usada pelo generate/briefing.js para formatar o nivel no bloco
// COTACOES. O close cru do Yahoo (174577.0) nao deve chegar ao prompt: o
// modelo copia literal, e numero cru vira aberracao no briefing. Formata com
// casas fixas, ponto de milhar e virgula de decimal, sem Intl (paridade
// byte a byte com o _fmt_num_br do Python). display_unit vazio = numero sem
// unidade.
export const ATIVOS_META = {
  IBOV: { classe: "indice", unidade: "pct", tolerancia: 0.5, display_unit: "pontos", display_decimals: 0 },
  SPX: { classe: "indice", unidade: "pct", tolerancia: 0.5, display_unit: "pontos", display_decimals: 2 },
  USDBRL: { classe: "cambio", unidade: "pct", tolerancia: 1.0, display_unit: "R$", display_decimals: 4 },
  DXY: { classe: "cambio", unidade: "pct", tolerancia: 1.0, display_unit: "pontos", display_decimals: 2 },
  VIX: { classe: "volatilidade", unidade: "pct", tolerancia: 2.0, display_unit: "pontos", display_decimals: 2 },
  GOLD: { classe: "commodity", unidade: "pct", tolerancia: 0.5, display_unit: "US$", display_decimals: 2 },
  WTI: { classe: "commodity", unidade: "pct", tolerancia: 0.5, display_unit: "US$", display_decimals: 2 },
  BTC: { classe: "cripto", unidade: "pct", tolerancia: 1.5, display_unit: "US$", display_decimals: 2 },
  PETR4: { classe: "acao", unidade: "pct", tolerancia: 0.5, display_unit: "R$", display_decimals: 2 },
  VALE3: { classe: "acao", unidade: "pct", tolerancia: 0.5, display_unit: "R$", display_decimals: 2 },
  ITUB4: { classe: "acao", unidade: "pct", tolerancia: 0.5, display_unit: "R$", display_decimals: 2 },
  BBDC4: { classe: "acao", unidade: "pct", tolerancia: 0.5, display_unit: "R$", display_decimals: 2 },
  ABEV3: { classe: "acao", unidade: "pct", tolerancia: 0.5, display_unit: "R$", display_decimals: 2 },
  WEGE3: { classe: "acao", unidade: "pct", tolerancia: 0.5, display_unit: "R$", display_decimals: 2 },
  SELIC: { classe: "juro", unidade: "bp", tolerancia: 5.0, display_unit: "% a.a.", display_decimals: 2 },
};

// brtIso: mesma convencao do restante do remote (BRT = UTC-3 fixo, sem
// horario de verao desde 2019). O fuso e fake de proposito: apenas desloca o
// relogio, que e tudo que a data BRT precisa aqui.
function brtIso(nowMs) {
  return new Date(nowMs - 3 * 3600 * 1000).toISOString();
}

// pyRound: round half-to-even do Python (round(x, n)), o arredondamento do
// caminho numerico. O JS so tem Math.round (half-away); a diferenca so
// aparece em .5 exato, raro em float, mas a paridade nao custa nada.
// Exportado em 26/08/2026 para o fmtNumBR do generate/briefing.js: o
// arredondamento do nivel exibido precisa bater com o f-string do Python.
export function pyRound(x, ndigits) {
  const mult = 10 ** ndigits;
  const shifted = x * mult;
  const floored = Math.floor(shifted);
  const diff = shifted - floored;
  if (diff > 0.5) return (floored + 1) / mult;
  if (diff < 0.5) return floored / mult;
  return (floored % 2 === 0 ? floored : floored + 1) / mult;
}

// arredondaCotacao: corta o ruido de float do Yahoo (7674.3701171875,
// 15.130000114440918). Duas casas acima de 100, quatro abaixo — o que separa
// indice de par de moedas sem tabela por ativo (porta de _comum.py).
export function arredondaCotacao(valor) {
  if (valor === null || valor === undefined) return null;
  return pyRound(Number(valor), Math.abs(Number(valor)) >= 100 ? 2 : 4);
}

async function getJson(url, timeoutMs, fetchImpl) {
  const f = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await f(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// barrasDiarias: porta de _barras_diarias do _comum.py. Extrai (trade_date,
// close) das barras diarias de um chart do Yahoo. Sao tres filtros, e os tres
// sao necessarios (medido em 24/08/2026):
//   1. descarta barra com data igual ou posterior a hoje no fuso da bolsa
//      (mata o pregao em curso);
//   2. descarta a barra cujo timestamp e o proprio regularMarketTime (barra
//      sintetica com a cotacao ao vivo);
//   3. deduplica por data ficando com a PRIMEIRA ocorrencia (a oficial).
export function barrasDiarias(result, nowMs) {
  const meta = result.meta || {};
  const offsetSec = meta.gmtoffset || 0;
  const marketTime = meta.regularMarketTime;
  const timestamps = result.timestamp || [];
  const closes = (() => {
    try {
      return result.indicators?.quote?.[0]?.close || [];
    } catch {
      return [];
    }
  })();

  const hojeBolsa = new Date(nowMs + offsetSec * 1000).toISOString().slice(0, 10);
  const porData = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined) continue;
    const ts = timestamps[i];
    if (marketTime !== null && marketTime !== undefined && ts === marketTime) continue;
    const d = new Date(ts * 1000 + offsetSec * 1000).toISOString().slice(0, 10);
    if (d >= hojeBolsa) continue;
    if (porData.has(d)) continue;
    porData.set(d, Number(close));
  }
  return [...porData.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// fetchYahooFechamentos: porta de fetch_yahoo_fechamentos do _comum.py.
// Devolve ({ticker: {close, trade_date, previous_close, change_percent,
// simbolo}}, lista de erros). trade_date vem da barra, nunca do dia de coleta.
export async function fetchYahooFechamentos(symbols, fetchImpl, nowMs) {
  const out = {};
  const erros = [];
  for (const [ticker, simbolo] of Object.entries(symbols)) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}` +
      "?interval=1d&range=1mo";
    const data = await getJson(url, 15000, fetchImpl);
    if (!data) {
      erros.push(`${ticker}: Yahoo sem resposta (${simbolo})`);
      continue;
    }
    let result;
    try {
      result = data.chart.result[0];
    } catch {
      erros.push(`${ticker}: resposta do Yahoo sem chart.result (${simbolo})`);
      continue;
    }
    const barras = barrasDiarias(result, nowMs);
    if (!barras.length) {
      erros.push(`${ticker}: nenhuma barra de pregao encerrado (${simbolo})`);
      continue;
    }
    const [tradeDate, close] = barras[barras.length - 1];
    const anterior = barras.length >= 2 ? barras[barras.length - 2][1] : null;
    out[ticker] = {
      close: arredondaCotacao(close),
      trade_date: tradeDate,
      previous_close: arredondaCotacao(anterior),
      change_percent: anterior ? pyRound(((close - anterior) / anterior) * 100, 2) : null,
      simbolo,
    };
  }
  return [out, erros];
}

// fetchPtax: dolar oficial de fechamento pelo PTAX (Olinda). Devolve
// (dado, erro). Janela de 10 dias para atravessar fim de semana e feriado; a
// ultima cotacao da lista e a do ultimo dia com PTAX divulgado, exatamente o
// pregao encerrado que o briefing cita.
export async function fetchPtax(fetchImpl, nowMs) {
  const hoje = brtIso(nowMs).slice(0, 10);
  const ini = new Date(nowMs - 3 * 3600 * 1000 - 10 * 86400000).toISOString().slice(0, 10);
  // PTAX espera MM-DD-YYYY, o resto do codigo usa ISO — a URL e montada no
  // formato proprio da API (mesmo do Python).
  const fmt = (iso) => `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;
  const url = PTAX_URL.replace("{ini}", fmt(ini)).replace("{fim}", fmt(hoje));
  const data = await getJson(url, 20000, fetchImpl);
  if (!data) return [null, "PTAX: sem resposta do Olinda"];
  const valores = data.value || [];
  if (!valores.length) return [null, "PTAX: janela de 10 dias sem cotacao divulgada"];

  const ultimo = valores[valores.length - 1];
  const anterior = valores.length >= 2 ? valores[valores.length - 2] : null;
  let venda;
  try {
    venda = Number(ultimo.cotacaoVenda);
  } catch {
    return [null, "PTAX: resposta sem cotacaoVenda ou dataHoraCotacao"];
  }
  if (venda === undefined || Number.isNaN(venda) || !("dataHoraCotacao" in ultimo)) {
    return [null, "PTAX: resposta sem cotacaoVenda ou dataHoraCotacao"];
  }
  // str(...)[:10] do Python trunca o timestamp ISO em 10 chars (a data).
  const tradeDate = String(ultimo.dataHoraCotacao).slice(0, 10);

  let prev = null;
  if (anterior) {
    try {
      prev = Number(anterior.cotacaoVenda);
    } catch {
      prev = null;
    }
    if (prev !== undefined && Number.isNaN(prev)) prev = null;
  }

  return [
    {
      close: venda,
      trade_date: tradeDate,
      previous_close: prev,
      change_percent: prev ? pyRound(((venda - prev) / prev) * 100, 2) : null,
    },
    null,
  ];
}

// fetchSelic: meta Selic do Copom pela serie 432 do SGS. Devolve (dado, erro).
// A janela termina em hoje de proposito: a serie e publicada para frente e o
// ultimo item bruto tem data futura, o que quebraria a ancoragem da REGRA 6.
export async function fetchSelic(fetchImpl, nowMs) {
  const hoje = brtIso(nowMs).slice(0, 10);
  const ini = new Date(nowMs - 3 * 3600 * 1000 - 60 * 86400000).toISOString().slice(0, 10);
  const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const url = SGS_URL.replace("{codigo}", String(SGS_META_SELIC))
    .replace("{ini}", fmt(ini))
    .replace("{fim}", fmt(hoje));
  const data = await getJson(url, 20000, fetchImpl);
  if (!data) return [null, "SGS 432: sem resposta"];
  if (!Array.isArray(data) || !data.length) {
    return [null, "SGS 432: resposta vazia ou fora do formato de lista"];
  }

  const passados = [];
  for (const item of data) {
    let dIso;
    let valor;
    try {
      const [dia, mes, ano] = String(item.data).split("/");
      dIso = `${ano}-${mes}-${dia}`;
      valor = Number(item.valor);
    } catch {
      continue;
    }
    if (dIso === undefined || Number.isNaN(valor)) continue;
    if (dIso <= hoje) passados.push([dIso, valor]);
  }

  if (!passados.length) {
    return [null, "SGS 432: janela de 60 dias so tem datas futuras"];
  }

  const [tradeDate, valor] = passados[passados.length - 1];
  // Anterior util e o ultimo valor DIFERENTE, ou seja o patamar anterior do
  // Copom (a serie e um degrau, comparar com o dia anterior nao diz nada).
  let prev = null;
  for (let i = passados.length - 2; i >= 0; i--) {
    if (passados[i][1] !== valor) {
      prev = passados[i][1];
      break;
    }
  }

  return [
    {
      close: valor,
      trade_date: tradeDate,
      previous_close: prev,
      change_percent: null, // juro nao se compara em %, se compara em bp
    },
    null,
  ];
}

// quorum: porta de _quorum do coletar_precos.py. Duas fontes independentes
// concordando dentro da tolerancia dao "ok"; divergencia acima da tolerancia
// marca "divergencia" (o validador trata como reprovacao: sem numero
// confiavel para conferir o briefing contra); fonte unica fica "fonte_unica".
export function quorum(ticker, principal, secundaria) {
  const meta = ATIVOS_META[ticker] || {};
  const registro = { ...principal };
  registro.classe = meta.classe;
  registro.unidade = meta.unidade;
  registro.tolerancia = meta.tolerancia;

  if (!secundaria || !secundaria.close) {
    registro.quorum = "fonte_unica";
    return registro;
  }
  const a = principal.close;
  const b = secundaria.close;
  if (!a) {
    registro.quorum = "fonte_unica";
    return registro;
  }

  const divergencia = (Math.abs(a - b) / Math.abs(a)) * 100;
  registro.divergencia_pct = pyRound(divergencia, 3);
  registro.fonte_secundaria = secundaria;
  const tol = meta.tolerancia || 1.0;
  if (meta.unidade === "bp") {
    registro.quorum = Math.abs(a - b) * 100 <= tol ? "ok" : "divergencia";
  } else {
    registro.quorum = divergencia <= tol ? "ok" : "divergencia";
  }
  return registro;
}

// coletarPrecos: porta do main() do coletar_precos.py. Devolve o payload no
// shape do precos_YYYYMMDD.json local. Nunca lanca: falha de fonte vira
// entrada em `erros`. Chamador (run.js) decide o abort quando 0 ativos.
export async function coletarPrecos({ dateTag, fetchImpl, nowMs }) {
  const now = nowMs || Date.now();
  const erros = [];
  const ativos = {};

  const [yahoo, errosYahoo] = await fetchYahooFechamentos(YAHOO_SYMBOLS, fetchImpl, now);
  erros.push(...errosYahoo);

  const [ptax, erroPtax] = await fetchPtax(fetchImpl, now);
  if (erroPtax) erros.push(erroPtax);
  const [selic, erroSelic] = await fetchSelic(fetchImpl, now);
  if (erroSelic) erros.push(erroSelic);

  for (const [ticker, dado] of Object.entries(yahoo)) {
    if (ticker === "USDBRL") continue; // tratado abaixo, com PTAX mandando
    const registro = quorum(ticker, dado, null);
    registro.fonte = `Yahoo Finance (${dado.simbolo})`;
    ativos[ticker] = registro;
  }

  // USD/BRL: PTAX e a taxa de referencia oficial, Yahoo entra como segunda
  // opiniao. Elas divergem de forma legitima (PTAX e fixing das 13h, Yahoo e
  // spot de 24h), por isso a tolerancia de cambio e 1% e nao 0,1%.
  const yUsd = yahoo.USDBRL;
  if (ptax) {
    const registro = quorum("USDBRL", ptax, yUsd);
    registro.fonte = "BCB PTAX (Olinda), venda";
    if (yUsd) {
      registro.fonte_secundaria.fonte = `Yahoo Finance (${yUsd.simbolo})`;
    }
    ativos.USDBRL = registro;
  } else if (yUsd) {
    const registro = quorum("USDBRL", yUsd, null);
    registro.fonte = `Yahoo Finance (${yUsd.simbolo}), PTAX indisponivel`;
    ativos.USDBRL = registro;
  }

  if (selic) {
    const registro = quorum("SELIC", selic, null);
    registro.fonte = "BCB SGS serie 432 (meta Selic Copom)";
    ativos.SELIC = registro;
  }

  return {
    coletado_em: brtIso(now).replace("Z", "-03:00"),
    data_coleta: dateTag,
    n_ativos: Object.keys(ativos).length,
    ativos,
    erros,
  };
}
