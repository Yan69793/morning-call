// collect/estado.js — porta de coletar_estado.py (estado dos 3 workers).
//
// GET nos workers do Morning Call, Radar Quant e VixRadar (URLs em vars, com
// defaults iguais aos do Python). Staleness com heuristica seg-sex (igual ao
// Python, sem feriado). Contador de dias consecutivos le o artefato de ONTEM
// do KV (no local era o arquivo do disco; no remote e a propria historia do
// remote — REGRA 4 neutralizada desde 13/08, campo e so informativo).
// Yahoo fallback quando stale >= 2 dias (15 simbolos).
//
// Saida: shape identico ao logs/estado_YYYYMMDD.json do pipeline local.

import exposicaoJson from "../assets/projetos-exposicao.json" with { type: "json" };
import { getArtefato } from "../kv.js";

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export const DEFAULT_URLS = {
  MORNING_CALL_URL: "https://morning-call.prospects-intel.workers.dev/api/report/latest",
  RADAR_QUANT_URL: "https://radar-quant-brasil.prospects-intel.workers.dev/api/radar/latest",
  VIXRADAR_URL: "https://radar-credito-api.prospects-intel.workers.dev",
};

export const YAHOO_SYMBOLS = {
  IBOV: "^BVSP",
  USDBRL: "BRL=X",
  SPX: "^GSPC",
  VIX: "^VIX",
  DXY: "DX-Y.NYB",
  GOLD: "GC=F",
  WTI: "CL=F",
  BTC: "BTC-USD",
  PETR4: "PETR4.SA",
  VALE3: "VALE3.SA",
  ITUB4: "ITUB4.SA",
  BBDC4: "BBDC4.SA",
  ABEV3: "ABEV3.SA",
  WEGE3: "WEGE3.SA",
};

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

function ultimoPregao(refDateIso) {
  // seg-sex sem verificacao de feriado (mesma heuristica do Python).
  const d = new Date(`${refDateIso}T00:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

export function calcStaleness(marketDateStr, refDateIso) {
  const ultimo = ultimoPregao(refDateIso);
  if (!marketDateStr) {
    return {
      stale: true,
      dias_atraso: null,
      market_date: null,
      ultimo_pregao: ultimo,
      motivo: "sem marketDate na resposta",
    };
  }
  // date.fromisoformat do Python 3.11 aceita "YYYY-MM-DD" e "YYYYMMDD".
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(marketDateStr));
  let iso;
  if (!m) {
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(marketDateStr));
    iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  } else {
    iso = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (!m || !iso) {
    return {
      stale: true,
      dias_atraso: null,
      market_date: marketDateStr,
      ultimo_pregao: ultimo,
      motivo: `marketDate invalido: ${marketDateStr}`,
    };
  }
  const md = new Date(`${iso}T00:00:00Z`);
  const ref = new Date(`${refDateIso}T00:00:00Z`);
  const dias = Math.round((ref - md) / 86400000);
  return {
    stale: dias > 0,
    dias_atraso: dias,
    market_date: iso,
    ultimo_pregao: ultimo,
  };
}

async function consecutiveStaleDays(currentDateTag, system, env) {
  const hoje = new Date(
    `${currentDateTag.slice(0, 4)}-${currentDateTag.slice(4, 6)}-${currentDateTag.slice(6, 8)}T00:00:00Z`,
  );
  const ontem = new Date(hoje.getTime() - 86400000);
  const ontemTag = ontem.toISOString().slice(0, 10).replace(/-/g, "");
  const data = await getArtefato(env, "briefing", ontemTag, "estado");
  if (!data) return 1;
  const systemData = (data.sistemas || {})[system] || {};
  const staleness = systemData.staleness || {};
  if (staleness.stale) {
    const prevDays = staleness.dias_consecutivos || 1;
    return prevDays + 1;
  }
  return 1;
}

function vixradarStatus(vx) {
  // T05: so conta como OK se dict com status string.
  if (vx && typeof vx === "object" && !Array.isArray(vx)) {
    const status = vx.status;
    if (typeof status === "string") return [true, status];
  }
  return [false, null];
}

// pyRound: round half-to-even de 2 casas, equivalente ao round(x, 2) do
// Python (o caminho numerico do Yahoo fallback; caminho raro e sem fixture
// de paridade byte, mas com o mesmo comportamento de arredondamento).
export function pyRound2(x) {
  const mult = 100;
  const shifted = x * mult;
  const floored = Math.floor(shifted);
  const diff = shifted - floored;
  if (diff > 0.5) return (floored + 1) / mult;
  if (diff < 0.5) return floored / mult;
  return (floored % 2 === 0 ? floored : floored + 1) / mult;
}

async function fetchYahoo(fetchImpl) {
  const results = {};
  for (const [ticker, yahooSymbol] of Object.entries(YAHOO_SYMBOLS)) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}` +
      "?interval=1d&range=5d";
    let data;
    try {
      data = await getJson(url, 15000, fetchImpl);
    } catch {
      continue;
    }
    if (!data) continue;
    try {
      const result = data.chart.result[0];
      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose;
      const changePercent =
        price !== null && price !== undefined && prev ? pyRound2(((price - prev) / prev) * 100) : null;
      results[ticker] = {
        price,
        previousClose: prev,
        changePercent,
        date: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10),
        fonte: "Yahoo Finance (fallback — scan esta fora do ar)",
      };
    } catch {
      continue;
    }
  }
  return results;
}

export async function coletarEstado({ dateTag, env, fetchImpl, nowMs }) {
  const f = fetchImpl || fetch;
  const now = nowMs || Date.now();
  const coletadoEm = new Date(now - 3 * 3600 * 1000).toISOString().replace("Z", "-03:00");
  const refDateIso = `${dateTag.slice(0, 4)}-${dateTag.slice(4, 6)}-${dateTag.slice(6, 8)}`;

  const mcUrl = env.MORNING_CALL_URL || DEFAULT_URLS.MORNING_CALL_URL;
  const rqUrl = env.RADAR_QUANT_URL || DEFAULT_URLS.RADAR_QUANT_URL;
  const vxUrl = env.VIXRADAR_URL || DEFAULT_URLS.VIXRADAR_URL;

  const sistemas = {};

  // --- Morning Call ---
  const mc = await getJson(mcUrl, 20000, f);
  if (mc && mc.ok) {
    sistemas["morning-call"] = {
      ok: true,
      trade_date: mc.trade_date,
      regime: mc.regime,
      vies: mc.vies,
      conviccao: mc.conviccao,
      n_trades: mc.n_trades,
      aprovado: mc.aprovado,
      data_coleta: coletadoEm,
    };
  } else {
    sistemas["morning-call"] = { ok: false, erro: "sem resposta ou invalido" };
  }

  // --- Radar Quant ---
  const rq = await getJson(rqUrl, 20000, f);
  if (rq && rq.marketDate) {
    const staleness = calcStaleness(rq.marketDate, refDateIso);
    const diasCons = staleness.stale
      ? await consecutiveStaleDays(dateTag, "radar-quant", env)
      : 0;
    staleness.dias_consecutivos = diasCons;
    sistemas["radar-quant"] = {
      ok: true,
      staleness,
      n_items: (rq.items || []).length,
      schema_version: rq.schemaVersion,
      data_coleta: coletadoEm,
    };
    if (staleness.stale && (staleness.dias_atraso || 0) >= 2) {
      const yahooData = await fetchYahoo(f);
      sistemas["radar-quant"].yahoo_fallback = {
        acionado: true,
        n_simbolos: Object.keys(yahooData).length,
        dados: yahooData,
      };
    }
  } else {
    sistemas["radar-quant"] = {
      ok: false,
      erro: "sem resposta ou invalido",
      data_coleta: coletadoEm,
    };
  }

  // --- VixRadar ---
  const vx = await getJson(vxUrl, 15000, f);
  const [vxOk, vxStatus] = vixradarStatus(vx);
  if (vxOk) {
    sistemas["vixradar"] = {
      ok: true,
      status: vxStatus,
      data_coleta: coletadoEm,
    };
  } else {
    sistemas["vixradar"] = { ok: false, erro: "sem resposta ou resposta sem status" };
  }

  const exposicaoResumo = {};
  for (const [slug, p] of Object.entries(exposicaoJson)) {
    exposicaoResumo[slug] = { nome: p.nome, exposicao: p.exposicao };
  }

  return {
    coletado_em: coletadoEm,
    data: dateTag,
    sistemas,
    exposicao_resumo: exposicaoResumo,
  };
}
