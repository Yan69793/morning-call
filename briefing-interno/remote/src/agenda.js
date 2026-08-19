// agenda.js — Porta deterministica de Site/automacao-yan-os/agents/agenda_agent.py.
//
// Decisao do Yan em 18/08/2026: a agenda e portada para dentro dos Workers
// (sz-briefing-remote e sz-fechamento-remote) como fonte AUTOSSUFICIENTE do
// Remote, para os dois pipelines funcionarem com o PC desligado por dias.
// O AgendaAgent local (08h00 dom+seg+qui) continua escrevendo o agenda-data.json
// do Site; este porte NAO le esse arquivo, computa do zero com as mesmas
// tabelas + API IBGE ao vivo.
//
// Paridade: tests/agenda.parity.test.mjs compara a saida contra um golden
// gerado pelo proprio agenda_agent.py (fixture gerada por
// tests/fixtures/generate_agenda_fixture.py). Divergencia e falha de build.
//
// Falha fechada em runtime: se a API IBGE falhar, agendaStatus = "degradado"
// e o payload sai so com os calendarios oficiais fixos (nunca evento
// inventado). O ramo degradado e registrado no estado da corrida.
//
// Manutencao anual: as tabelas *2026 hardcoded valem ate 2026-12-31.
// A partir de 2027, atualizar AQUI, em agenda_agent.py (Site) e nos dois
// workers remotos (o golden de paridade acusa qualquer divergencia).
//
// Este arquivo e copiado identico para os dois repos remotos. As duas copias
// devem evoluir juntas.

// ---------------------------------------------------------------------------
// Tabelas determinísticas 2026 (fonte: agenda_agent.py)
// ---------------------------------------------------------------------------

export const COPOM_2026 = [
  "2026-01-29", "2026-03-19", "2026-05-07",
  "2026-06-17", "2026-07-30", "2026-09-17",
  "2026-11-05", "2026-12-10",
];

export const FOMC_2026 = [
  { data: "2026-01-29", dot_plot: false },
  { data: "2026-03-19", dot_plot: true },
  { data: "2026-04-30", dot_plot: false },
  { data: "2026-06-17", dot_plot: true },
  { data: "2026-07-30", dot_plot: false },
  { data: "2026-09-17", dot_plot: true },
  { data: "2026-11-05", dot_plot: false },
  { data: "2026-12-10", dot_plot: true },
];

export const US_CPI_2026 = [
  "2026-02-13", "2026-03-11", "2026-04-10", "2026-05-12", "2026-06-10",
  "2026-07-14", "2026-08-12", "2026-09-11", "2026-10-14", "2026-11-10", "2026-12-10",
];

export const US_PPI_2026 = [
  "2026-02-27", "2026-03-18", "2026-04-14", "2026-05-13", "2026-06-11",
  "2026-07-15", "2026-08-13", "2026-09-10", "2026-10-15", "2026-11-13", "2026-12-15",
];

export const US_RETAIL_2026 = [
  "2026-03-06", "2026-04-01", "2026-04-21", "2026-05-14", "2026-06-17",
  "2026-07-16", "2026-08-14", "2026-09-16", "2026-10-15", "2026-11-17", "2026-12-16",
];

export const US_NFP_2026 = [
  "2026-02-11", "2026-03-06", "2026-04-03", "2026-05-08", "2026-06-05",
  "2026-07-02", "2026-08-07", "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
];

export const ECB_2026 = [
  "2026-02-05", "2026-03-19", "2026-04-30", "2026-06-11",
  "2026-07-23", "2026-09-10", "2026-10-29", "2026-12-17",
];

export const BOE_2026 = [
  "2026-02-05", "2026-03-19", "2026-04-30", "2026-06-18",
  "2026-07-30", "2026-09-17", "2026-11-05", "2026-12-17",
];

export const BOJ_2026 = [
  "2026-01-23", "2026-03-19", "2026-04-28", "2026-06-16",
  "2026-07-31", "2026-09-18", "2026-10-30", "2026-12-18",
];

export const CHINA_GDP_2026 = [
  "2026-01-16",  // Q4 2025
  "2026-04-16",  // Q1 2026
  "2026-07-15",  // Q2 2026
  "2026-10-19",  // Q3 2026
];

export const CHINA_CPI_2026 = [
  "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-13",
  "2026-11-10", "2026-12-10",
];

export const CHINA_PMI_2026 = [
  "2026-07-01", "2026-08-03", "2026-09-01", "2026-10-01",
  "2026-11-02", "2026-12-01",
];

export const EUROZONE_CPI_2026 = [
  "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-30",
  "2026-11-30",
];

export const UK_CPI_2026 = [
  "2026-07-22", "2026-08-19", "2026-09-16", "2026-10-21",
  "2026-11-18", "2026-12-16",
];

export const UK_LABOUR_2026 = [
  "2026-07-21", "2026-08-18", "2026-09-15", "2026-10-20",
  "2026-11-17", "2026-12-15",
];

export const UK_RETAIL_2026 = [
  "2026-07-24", "2026-08-21", "2026-09-18", "2026-10-23",
  "2026-11-20", "2026-12-18",
];

export const JP_CPI_2026 = [
  "2026-07-24", "2026-08-21", "2026-09-18", "2026-10-23",
  "2026-11-20", "2026-12-18",
];

export const GLOBAL_PMI_2026 = [
  "2026-07-24", "2026-08-21", "2026-09-23", "2026-10-23",
  "2026-11-23", "2026-12-16",
];

export const ZEW_2026 = [
  "2026-07-21", "2026-08-18", "2026-09-15", "2026-10-20",
  "2026-11-17", "2026-12-15",
];

export const CHINA_LPR_2026 = [
  "2026-07-20", "2026-08-20", "2026-09-21", "2026-10-20",
  "2026-11-20", "2026-12-21",
];

export const CANADA_CPI_2026 = [
  "2026-07-20", "2026-08-19", "2026-09-16", "2026-10-21",
  "2026-11-18", "2026-12-16",
];

export const US_NEW_HOME_2026 = [
  "2026-07-24", "2026-08-25", "2026-09-24", "2026-10-26",
  "2026-11-25", "2026-12-23",
];

export const US_EXISTING_HOME_2026 = [
  "2026-07-22", "2026-08-20", "2026-09-22", "2026-10-22",
  "2026-11-19", "2026-12-22",
];

const MESES_PT = [
  "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_EN = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Incluir eventos IBGE de baixa relevância? False = agenda macro mais limpa
// (padrão para wealth advisory). Igual ao agenda_agent.py.
export const INCLUIR_IBGE_BAIXA = false;

// Relevância por padrão no título/alias do produto IBGE (macro para wealth
// advisory). Mesmos regexes do agenda_agent.py, mesma ordem.
const IBGE_RELEVANCIA = [
  [/ipca|inpc|índice nacional de preços|indice nacional de precos/i, "alta"],
  [/pnad|desemprego|desocupação|desocupacao|mercado de trabalho/i, "alta"],
  [/\bpib\b|contas nacionais|produto interno/i, "alta"],
  [/produção industrial|producao industrial|pim/i, "alta"],
  [/pesquisa mensal de serviços|pesquisa mensal de servicos/i, "media"],
  [/pesquisa mensal de comércio|pesquisa mensal de comercio/i, "media"],
  [/índice de preços ao produtor|indice de precos ao produtor|ipp/i, "media"],
  [/pesquisa industrial mensal/i, "media"],
];

const PESO_RELEVANCIA = { alta: 3, media: 2, baixa: 1 };

// ---------------------------------------------------------------------------
// Helpers de data/hora (porta fiel dos helpers do agenda_agent.py)
// ---------------------------------------------------------------------------

// Python date.isoweekday(): 1=seg ... 7=dom. JS getUTCDay(): 0=dom ... 6=sab.
function pyIsoWeekday(d) {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

function parseIso(iso) {
  // iso = "YYYY-MM-DD" -> Date UTC meia-noite
  return new Date(iso + "T00:00:00Z");
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function naJanela(dataStr, ini, fim) {
  return ini <= dataStr && dataStr <= fim;
}

export function janelaSegSex(hojeISO) {
  // Semana corrente (segunda a sexta) contendo `hoje`; se fim de semana, a próxima.
  const hoje = parseIso(hojeISO);
  const wd = pyIsoWeekday(hoje);
  let proxSeg;
  if (wd <= 5) {
    proxSeg = addDays(hoje, -(wd - 1));
  } else {
    proxSeg = addDays(hoje, 8 - wd);
  }
  const proxSex = addDays(proxSeg, 4);
  return [toIso(proxSeg), toIso(proxSex)];
}

function nthWeekday(ano, mes, weekdayIso, n) {
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  let count = 0;
  while (true) {
    if (pyIsoWeekday(d) === weekdayIso) {
      count += 1;
      if (count === n) return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function isUsDst(d) {
  // DST dos EUA: 2º domingo de março ate 1º domingo de novembro.
  const inicio = nthWeekday(d.getUTCFullYear(), 3, 7, 2);
  const fim = nthWeekday(d.getUTCFullYear(), 11, 7, 1);
  return inicio <= d && d < fim;
}

export function etParaBrt(dataStr, horaEt) {
  // Converte HH:MM em horário do Leste (ET) para BRT (America/Sao_Paulo, sem DST).
  const d = parseIso(dataStr);
  const [h, m] = horaEt.split(":").map((x) => parseInt(x, 10));
  const offset = isUsDst(d) ? 1 : 2; // EDT=UTC-4 -> BRT+1 ; EST=UTC-5 -> BRT+2
  let total = h * 60 + m + offset * 60;
  total %= 24 * 60;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function refMesAnterior(dataStr) {
  // Mês/ano de referência = mês anterior ao mês da data de divulgação.
  const d = parseIso(dataStr);
  const mes = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth(); // 0-indexado -> anterior
  const ano = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  return [mes, ano];
}

export function relevanciaIbge(titulo) {
  const t = (titulo || "").toLowerCase();
  for (const [pat, rel] of IBGE_RELEVANCIA) {
    if (pat.test(t)) return rel;
  }
  return "baixa";
}

// ---------------------------------------------------------------------------
// Blocos de eventos (porta fiel, strings byte a byte)
// ---------------------------------------------------------------------------

function eventoFocus(janelaInicio) {
  return {
    data: janelaInicio,
    hora_brt: "08:25",
    regiao: "BR",
    evento: "Boletim Focus",
    evento_en: "Focus Market Report",
    descricao:
      "Medianas semanais do mercado para Selic, IPCA, câmbio e PIB — " +
      "principais referências de expectativas para a curva de juros e decisão do COPOM.",
    descricao_en:
      "Weekly market medians for Selic, CPI, FX and GDP — " +
      "key forward-guidance inputs for the rate curve and COPOM decisions.",
    fonte: "BCB",
    relevancia: "alta",
  };
}

const US_TEMPLATES = {
  CPI: {
    evento: "Índice de Preços ao Consumidor (CPI) — {ref}",
    evento_en: "Consumer Price Index (CPI) — {ref_en}",
    descricao:
      "Inflação ao consumidor nos EUA, cheia e núcleo. Principal referência de " +
      "curto prazo para a trajetória de juros do Fed e para o apetite a risco global.",
    descricao_en:
      "US consumer inflation, headline and core. The key near-term input for the " +
      "Fed's rate path and global risk appetite.",
    relevancia: "alta",
  },
  PPI: {
    evento: "Índice de Preços ao Produtor (PPI) — {ref}",
    evento_en: "Producer Price Index (PPI) — {ref_en}",
    descricao:
      "Inflação no atacado nos EUA. Antecede pressões de custo que se transmitem " +
      "ao consumidor e complementa a leitura do CPI para o Fed.",
    descricao_en:
      "US wholesale inflation. Signals cost pressures that feed through to consumers " +
      "and complements the CPI read for the Fed.",
    relevancia: "media",
  },
  RETAIL: {
    evento: "Vendas no Varejo (Advance) — {ref}",
    evento_en: "Advance Retail Sales — {ref_en}",
    descricao:
      "Vendas do varejo nos EUA. Principal leitura de curto prazo sobre a força do " +
      "consumo americano, que responde por cerca de dois terços do PIB.",
    descricao_en:
      "US retail sales. The key near-term read on the strength of American consumer " +
      "spending, which drives roughly two-thirds of GDP.",
    relevancia: "alta",
  },
  NFP: {
    evento: "Payroll (Nonfarm Payrolls) — {ref}",
    evento_en: "Nonfarm Payrolls — {ref_en}",
    descricao:
      "Principal termômetro do mercado de trabalho americano. Surpresas no NFP movem " +
      "o dólar, os Treasuries e, por extensão, o real e a curva de juros brasileira.",
    descricao_en:
      "Primary US labor market gauge. NFP surprises move the USD, Treasuries, and " +
      "consequently BRL and the Brazilian rate curve.",
    relevancia: "alta",
  },
};

function eventosUs(ini, fim) {
  const eventos = [];
  const series = [
    [US_CPI_2026, "CPI", "media_alta"],
    [US_PPI_2026, "PPI", null],
    [US_RETAIL_2026, "RETAIL", null],
    [US_NFP_2026, "NFP", null],
  ];
  for (const [datas, tipo] of series) {
    const tpl = US_TEMPLATES[tipo];
    for (const dataStr of datas) {
      if (!naJanela(dataStr, ini, fim)) continue;
      const [mes, ano] = refMesAnterior(dataStr);
      const ref = `${MESES_PT[mes]}/${ano}`;
      const refEn = `${MESES_EN[mes]} ${ano}`;
      eventos.push({
        data: dataStr,
        hora_brt: etParaBrt(dataStr, "08:30"),
        regiao: "US",
        evento: tpl.evento.replace("{ref}", ref),
        evento_en: tpl.evento_en.replace("{ref_en}", refEn),
        descricao: tpl.descricao,
        descricao_en: tpl.descricao_en,
        fonte: tipo === "RETAIL" ? "Census Bureau" : "BLS",
        relevancia: tpl.relevancia,
      });
    }
  }
  return eventos;
}

function eventosCopomFomc(ini, fim) {
  const eventos = [];
  for (const dataStr of COPOM_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    const d = parseIso(dataStr);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    eventos.push({
      data: dataStr,
      hora_brt: "18:30",
      regiao: "BR",
      evento: `COPOM — Decisão de juros (${mm}/${yyyy})`,
      evento_en: `COPOM — Rate Decision (${mm}/${yyyy})`,
      descricao:
        "O BCB divulga a decisão sobre a Selic ao final do segundo dia de reunião. " +
        "O comunicado e a ata subsequente moldam a curva de juros doméstica e o câmbio.",
      descricao_en:
        "BCB releases the Selic decision at the end of day two. The statement and " +
        "subsequent minutes shape the domestic rate curve and BRL.",
      fonte: "BCB",
      relevancia: "alta",
    });
  }
  for (const fomc of FOMC_2026) {
    const dataStr = fomc.data;
    if (!naJanela(dataStr, ini, fim)) continue;
    const d = parseIso(dataStr);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const sufixo = fomc.dot_plot ? " + Dot Plot" : "";
    const extra = fomc.dot_plot
      ? " Inclui o Summary of Economic Projections (Dot Plot) com projeção de " +
        "trajetória de juros dos diretores."
      : "";
    const extraEn = fomc.dot_plot
      ? " Includes the Summary of Economic Projections (Dot Plot) with " +
        "directors' rate-path forecast."
      : "";
    eventos.push({
      data: dataStr,
      hora_brt: etParaBrt(dataStr, "14:00"),
      regiao: "US",
      evento: `FOMC — Decisão de juros${sufixo} (${mm}/${yyyy})`,
      evento_en: `FOMC — Rate Decision${sufixo} (${mm}/${yyyy})`,
      descricao:
        "Decisão do Federal Reserve sobre os Fed Funds." + extra +
        " Impacto direto no diferencial Brasil–EUA e no real.",
      descricao_en:
        "Federal Reserve decision on the Fed Funds rate." + extraEn +
        " Direct impact on the Brazil–US rate differential and BRL.",
      fonte: "Fed",
      relevancia: "alta",
    });
  }
  return eventos;
}

// parseIbgeItems: porta do laco interno de _eventos_ibge (apos a coleta).
// Recebe os items crus da API (campo "items" da resposta) e devolve eventos
// no formato da agenda. Hora convertida de UTC para BRT (UTC-3), igual ao Python.
export function parseIbgeItems(items, ini, fim) {
  const eventos = [];
  for (const item of items || []) {
    const titulo = String(item.titulo || "").trim();
    const div = String(item.data_divulgacao || "").trim();
    if (!titulo || !div) continue;
    let d, mo, y, hh, mi, ss;
    const mFull = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(div.slice(0, 19));
    const mDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(div.slice(0, 10));
    if (mFull) {
      d = parseInt(mFull[1], 10); mo = parseInt(mFull[2], 10); y = parseInt(mFull[3], 10);
      hh = parseInt(mFull[4], 10); mi = parseInt(mFull[5], 10); ss = parseInt(mFull[6], 10);
    } else if (mDate) {
      d = parseInt(mDate[1], 10); mo = parseInt(mDate[2], 10); y = parseInt(mDate[3], 10);
      hh = 0; mi = 0; ss = 0;
    } else {
      continue;
    }
    const dt = new Date(Date.UTC(y, mo - 1, d, hh, mi, ss));
    const dataStr = toIso(dt);
    if (!naJanela(dataStr, ini, fim)) continue;
    const rel = relevanciaIbge(titulo);
    if (rel === "baixa" && !INCLUIR_IBGE_BAIXA) continue;
    // IBGE devolve horário em UTC (campo sem fuso). Converter para BRT (UTC-3).
    const brt = new Date(dt.getTime() - 3 * 3600 * 1000);
    const horaBrt = `${String(brt.getUTCHours()).padStart(2, "0")}:${String(brt.getUTCMinutes()).padStart(2, "0")}`;
    eventos.push({
      data: dataStr,
      hora_brt: horaBrt,
      regiao: "BR",
      evento: titulo,
      evento_en: titulo,
      descricao: `Divulgação programada do IBGE: ${titulo}.`,
      descricao_en: `Scheduled IBGE release: ${titulo}.`,
      fonte: "IBGE",
      relevancia: rel,
    });
  }
  return eventos;
}

// fetchIbge: coleta os meses civis que cobrem a janela, igual ao Python
// (a API v3 ignora filtros estreitos em ISO; filtramos localmente).
// Devolve { items, erros } com erros = número de meses com falha de rede.
export async function fetchIbge(ini, fim, fetchImpl) {
  const f = fetchImpl || fetch;
  const d0 = parseIso(ini);
  const d1 = parseIso(fim);
  const meses = [];
  let cursor = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1));
  const last = new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), 1));
  while (cursor <= last) {
    meses.push([cursor.getUTCFullYear(), cursor.getUTCMonth() + 1]);
    cursor = new Date(Date.UTC(
      cursor.getUTCMonth() === 11 ? cursor.getUTCFullYear() + 1 : cursor.getUTCFullYear(),
      cursor.getUTCMonth() === 11 ? 0 : cursor.getUTCMonth() + 1,
      1,
    ));
  }

  const items = [];
  let erros = 0;
  for (const [ano, mes] of meses) {
    const mesIni = `${ano}-${String(mes).padStart(2, "0")}-01`;
    let mesFim;
    if (mes === 12) {
      mesFim = `${ano}-12-31`;
    } else {
      const ultimoDia = new Date(Date.UTC(ano, mes, 0)); // dia 0 do mês seguinte
      mesFim = toIso(ultimoDia);
    }
    const url =
      "https://servicodados.ibge.gov.br/api/v3/calendario/" +
      `?de=${mesIni}&ate=${mesFim}&qtd=100`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const resp = await f(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      items.push(...(data.items || []));
    } catch (e) {
      erros += 1;
      console.log(`[agenda] IBGE mês ${ano}-${String(mes).padStart(2, "0")} falhou (opcional): ${e}`);
    }
  }
  return { items, erros };
}

function eventosSemanais(ini, fim) {
  // Eventos recorrentes toda semana: Jobless Claims (qui), EIA Oil (qua).
  const eventos = [];
  let cursor = parseIso(ini);
  const d1 = parseIso(fim);
  while (cursor <= d1) {
    const iso = toIso(cursor);
    if (pyIsoWeekday(cursor) === 3) {
      // quarta-feira (Python weekday()==2)
      eventos.push({
        data: iso,
        hora_brt: "11:30",
        regiao: "US",
        evento: "EUA — Estoques de petróleo bruto (EIA)",
        evento_en: "US — EIA Crude Oil Inventories",
        descricao:
          "Relatório semanal da Energy Information Administration com a variação " +
          "dos estoques de petróleo bruto, gasolina e destilados nos EUA. Impacto " +
          "direto nos preços do WTI/Brent e nas ações de energia.",
        descricao_en: "Weekly EIA crude oil inventory report. Direct impact on WTI/Brent and energy equities.",
        fonte: "EIA",
        relevancia: "media",
      });
    } else if (pyIsoWeekday(cursor) === 4) {
      // quinta-feira (Python weekday()==3)
      eventos.push({
        data: iso,
        hora_brt: "09:30",
        regiao: "US",
        evento: "EUA — Novos pedidos de seguro-desemprego",
        evento_en: "US — Initial Jobless Claims",
        descricao:
          "Número semanal de novos pedidos de auxílio-desemprego nos EUA. " +
          "Indicador antecedente da saúde do mercado de trabalho americano, " +
          "com impacto em Treasuries, DXY e expectativas para o FOMC.",
        descricao_en: "Weekly initial jobless claims. Leading indicator of US labor market health. Impacts Treasuries, DXY and FOMC expectations.",
        fonte: "Department of Labor",
        relevancia: "media",
      });
    }
    cursor = addDays(cursor, 1);
  }
  return eventos;
}

function eventosEcb(ini, fim) {
  const eventos = [];
  const tpl = {
    evento: "BCE — Decisão de juros na Zona do Euro",
    evento_en: "ECB — Eurozone Rate Decision",
    descricao:
      "Decisão do European Central Bank sobre as três taxas de juro de referência " +
      "(deposit facility, MRO, MLF). A presidente Christine Lagarde concede coletiva " +
      "às 14:45 CET. Impacto direto no euro (EUR/USD) e nos juros soberanos da Zona do Euro.",
    descricao_en:
      "ECB decision on the three key interest rates (deposit facility, MRO, MLF). " +
      "President Lagarde holds press conference at 14:45 CET. Direct impact on EUR/USD " +
      "and Eurozone sovereign yields.",
    fonte: "ECB",
    relevancia: "alta",
  };
  for (const dataStr of ECB_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    const d = parseIso(dataStr);
    const isSummer = [3, 4, 5, 6, 7, 8, 9, 10].includes(d.getUTCMonth() + 1);
    const offset = isSummer ? 5 : 4;
    const hora = `${String(14 + offset).padStart(2, "0")}:15`;
    eventos.push({
      data: dataStr,
      hora_brt: hora,
      regiao: "EU",
      evento: tpl.evento,
      evento_en: tpl.evento_en,
      descricao: tpl.descricao,
      descricao_en: tpl.descricao_en,
      fonte: tpl.fonte,
      relevancia: tpl.relevancia,
    });
  }
  return eventos;
}

function eventosBoe(ini, fim) {
  const eventos = [];
  const tpl = {
    evento: "BoE — Decisão de juros no Reino Unido (MPC)",
    evento_en: "BoE — UK Rate Decision (MPC)",
    descricao:
      "O Monetary Policy Committee do Bank of England divulga a decisão sobre a Bank Rate " +
      "e a ata da reunião simultaneamente. Impacto direto na GBP e nos gilts. " +
      "Quatro das oito reuniões incluem o Monetary Policy Report com projeções macro.",
    descricao_en:
      "The MPC announces the Bank Rate decision and minutes simultaneously. " +
      "Four meetings per year include the Monetary Policy Report with macro projections. " +
      "Direct impact on GBP and gilt yields.",
    fonte: "Bank of England",
    relevancia: "alta",
  };
  for (const dataStr of BOE_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    const d = parseIso(dataStr);
    const isSummer = [3, 4, 5, 6, 7, 8, 9, 10].includes(d.getUTCMonth() + 1);
    const offset = isSummer ? 4 : 3;
    const hora = `${String(12 + offset).padStart(2, "0")}:00`;
    eventos.push({
      data: dataStr,
      hora_brt: hora,
      regiao: "UK",
      evento: tpl.evento,
      evento_en: tpl.evento_en,
      descricao: tpl.descricao,
      descricao_en: tpl.descricao_en,
      fonte: tpl.fonte,
      relevancia: tpl.relevancia,
    });
  }
  return eventos;
}

function eventosBoj(ini, fim) {
  const eventos = [];
  const tpl = {
    evento: "BoJ — Decisão de juros no Japão",
    evento_en: "BoJ — Japan Rate Decision",
    descricao:
      "O Bank of Japan divulga a decisão sobre a policy rate e publica o Outlook Report " +
      "trimestral (jan, abr, jul, out). Impacto no USD/JPY, Nikkei 225 e JGBs. " +
      "Divulgação ocorre de madrugada no horário brasileiro (11:30 JST = 23:30 BRT do dia anterior).",
    descricao_en:
      "The BoJ announces its policy rate decision and publishes the quarterly Outlook Report " +
      "(Jan, Apr, Jul, Oct). Impact on USD/JPY, Nikkei 225 and JGBs.",
    fonte: "Bank of Japan",
    relevancia: "alta",
  };
  for (const dataStr of BOJ_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "23:30",
      regiao: "JP",
      evento: tpl.evento,
      evento_en: tpl.evento_en,
      descricao: tpl.descricao,
      descricao_en: tpl.descricao_en,
      fonte: tpl.fonte,
      relevancia: tpl.relevancia,
    });
  }
  return eventos;
}

function eventosChina(ini, fim) {
  const eventos = [];

  const tplGdp = {
    evento: "China — PIB trimestral",
    evento_en: "China — Quarterly GDP",
    descricao:
      "Produto Interno Bruto da China, segunda maior economia global. Divulgado pelo " +
      "National Bureau of Statistics (NBS) com breakdown por setor (indústria, serviços, " +
      "agricultura). Driver de commodities (minério de ferro, cobre, petróleo) e EM FX.",
    descricao_en:
      "China GDP released by NBS with sector breakdown. Key driver for commodities " +
      "(iron ore, copper, crude) and EM FX.",
    fonte: "NBS China",
    relevancia: "alta",
  };
  for (const dataStr of CHINA_GDP_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "23:00",
      regiao: "CN",
      evento: tplGdp.evento,
      evento_en: tplGdp.evento_en,
      descricao: tplGdp.descricao,
      descricao_en: tplGdp.descricao_en,
      fonte: tplGdp.fonte,
      relevancia: tplGdp.relevancia,
    });
  }

  const tplCpi = {
    evento: "China — IPC ao consumidor (CPI)",
    evento_en: "China — Consumer Price Index (CPI)",
    descricao:
      "Inflação ao consumidor na China. Leituras baixas sinalizam risco deflacionário " +
      "e fraqueza de demanda doméstica, com impacto em commodities e moedas de países " +
      "exportadores de matérias-primas (BRL, AUD, NZD, CLP).",
    descricao_en:
      "China consumer inflation. Low readings signal deflation risk and weak domestic " +
      "demand, impacting commodities and commodity-exporting currencies (BRL, AUD, NZD, CLP).",
    fonte: "NBS China",
    relevancia: "media",
  };
  for (const dataStr of CHINA_CPI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "22:30",
      regiao: "CN",
      evento: tplCpi.evento,
      evento_en: tplCpi.evento_en,
      descricao: tplCpi.descricao,
      descricao_en: tplCpi.descricao_en,
      fonte: tplCpi.fonte,
      relevancia: tplCpi.relevancia,
    });
  }

  const tplPmi = {
    evento: "China — PMI Industrial (NBS)",
    evento_en: "China — Manufacturing PMI (NBS)",
    descricao:
      "Índice de Gerentes de Compras da indústria chinesa, compilado pelo NBS. " +
      "Abaixo de 50 indica contração. Indicador antecedente de atividade industrial e " +
      "demanda por commodities. Também relevante o Caixin PMI (setor privado, ~2 dias depois).",
    descricao_en:
      "China manufacturing PMI by NBS. Below 50 signals contraction. Leading indicator " +
      "for industrial activity and commodity demand.",
    fonte: "NBS China",
    relevancia: "media",
  };
  for (const dataStr of CHINA_PMI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "22:00",
      regiao: "CN",
      evento: tplPmi.evento,
      evento_en: tplPmi.evento_en,
      descricao: tplPmi.descricao,
      descricao_en: tplPmi.descricao_en,
      fonte: tplPmi.fonte,
      relevancia: tplPmi.relevancia,
    });
  }

  return eventos;
}

function eventosEurozone(ini, fim) {
  const eventos = [];
  const tpl = {
    evento: "Zona do Euro — IPC Flash",
    evento_en: "Eurozone — CPI Flash Estimate",
    descricao:
      "Estimativa preliminar da inflação ao consumidor na Zona do Euro (índice cheio " +
      "e núcleo). Divulgado pelo Eurostat. Principal dado de inflação para o BCE " +
      "antes da decisão de juros seguinte.",
    descricao_en:
      "Preliminary Eurozone CPI estimate (headline and core) by Eurostat. Key inflation " +
      "data point ahead of ECB rate decisions.",
    fonte: "Eurostat",
    relevancia: "alta",
  };
  for (const dataStr of EUROZONE_CPI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "06:00",
      regiao: "EU",
      evento: tpl.evento,
      evento_en: tpl.evento_en,
      descricao: tpl.descricao,
      descricao_en: tpl.descricao_en,
      fonte: tpl.fonte,
      relevancia: tpl.relevancia,
    });
  }
  return eventos;
}

function eventosUkCpi(ini, fim) {
  const eventos = [];
  for (const dataStr of UK_CPI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "03:00",
      regiao: "UK",
      evento: "Reino Unido — IPC ao consumidor (CPI)",
      evento_en: "UK — Consumer Price Index (CPI)",
      descricao:
        "Inflação ao consumidor no Reino Unido, cheia e núcleo. Principal " +
        "referência de inflação para o Bank of England. Impacto em GBP, gilts e FTSE 100.",
      descricao_en: "UK headline and core CPI. Key inflation benchmark for Bank of England. Impacts GBP, gilts and FTSE 100.",
      fonte: "ONS",
      relevancia: "alta",
    });
  }
  return eventos;
}

function eventosUkLabour(ini, fim) {
  const eventos = [];
  for (const dataStr of UK_LABOUR_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "03:00",
      regiao: "UK",
      evento: "Reino Unido — Taxa de desemprego (ILO)",
      evento_en: "UK — ILO Unemployment Rate",
      descricao:
        "Taxa de desemprego e variação de rendimentos médios no Reino Unido. " +
        "Indicador-chave para o MPC do BoE calibrar o mercado de trabalho.",
      descricao_en: "UK unemployment rate and average earnings. Key labour market gauge for MPC decisions.",
      fonte: "ONS",
      relevancia: "media",
    });
  }
  return eventos;
}

function eventosUkRetail(ini, fim) {
  const eventos = [];
  for (const dataStr of UK_RETAIL_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "03:00",
      regiao: "UK",
      evento: "Reino Unido — Vendas no varejo",
      evento_en: "UK — Retail Sales",
      descricao:
        "Vendas no varejo do Reino Unido (variação mensal e anual). " +
        "Termômetro do consumo das famílias e da atividade econômica britânica.",
      descricao_en: "UK monthly and annual retail sales. Household consumption gauge for the British economy.",
      fonte: "ONS",
      relevancia: "media",
    });
  }
  return eventos;
}

function eventosJpCpi(ini, fim) {
  const eventos = [];
  for (const dataStr of JP_CPI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "20:30",
      regiao: "JP",
      evento: "Japão — IPC nacional (CPI)",
      evento_en: "Japan — National Consumer Price Index",
      descricao:
        "Inflação ao consumidor no Japão (cheia e núcleo, excluindo alimentos " +
        "frescos). Dado essencial para a trajetória da taxa do BoJ. Impacto em " +
        "USD/JPY, Nikkei 225 e JGBs.",
      descricao_en: "Japan headline and core CPI. Key data point for BoJ rate trajectory. Impacts USD/JPY, Nikkei 225 and JGBs.",
      fonte: "Statistics Bureau of Japan",
      relevancia: "alta",
    });
  }
  return eventos;
}

function eventosGlobalPmi(ini, fim) {
  const eventos = [];
  const regioes = [
    ["US", "EUA", "S&P Global US"],
    ["EU", "Zona do Euro", "S&P Global Eurozone"],
    ["UK", "Reino Unido", "S&P Global UK"],
    ["DE", "Alemanha", "S&P Global Germany"],
  ];
  for (const dataStr of GLOBAL_PMI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    for (const [reg, nome, fonte] of regioes) {
      eventos.push({
        data: dataStr,
        hora_brt: reg === "US" ? "10:45" : "05:00",
        regiao: reg,
        evento: `${nome} — PMI Industrial e Serviços (Flash)`,
        evento_en: `${nome} — Manufacturing & Services PMI (Flash)`,
        descricao:
          `Índice de Gerentes de Compras (${nome}) — leitura preliminar (flash) ` +
          `da indústria e serviços. Abaixo de 50 indica contração. Impacto direto ` +
          `em expectativas de PIB, juros e moedas.`,
        descricao_en: `${nome} flash PMI for manufacturing and services. Below 50 signals contraction.`,
        fonte,
        relevancia: "alta",
      });
    }
  }
  return eventos;
}

function eventosZew(ini, fim) {
  const eventos = [];
  for (const dataStr of ZEW_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "06:00",
      regiao: "EU",
      evento: "Alemanha/Zona do Euro — ZEW de Sentimento Econômico",
      evento_en: "Germany/Eurozone — ZEW Economic Sentiment",
      descricao:
        "Índice ZEW de sentimento econômico na Alemanha e Zona do Euro, baseado " +
        "em survey com analistas e investidores institucionais. Indicador antecedente " +
        "de atividade e confiança na maior economia europeia.",
      descricao_en: "ZEW survey of economic sentiment among analysts and institutional investors. Leading indicator for German/Eurozone activity.",
      fonte: "ZEW",
      relevancia: "alta",
    });
  }
  return eventos;
}

function eventosChinaLpr(ini, fim) {
  const eventos = [];
  for (const dataStr of CHINA_LPR_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "22:15",
      regiao: "CN",
      evento: "China — Taxa de Juros de Referência (LPR)",
      evento_en: "China — Loan Prime Rate (LPR)",
      descricao:
        "O PBOC anuncia a taxa LPR de 1 e 5 anos, referência para o crédito " +
        "bancário na China. Impacto no mercado imobiliário chinês, commodities, " +
        "minério de ferro e moedas de países exportadores (AUD, BRL, CLP).",
      descricao_en: "PBOC announces 1Y and 5Y Loan Prime Rate. Impacts Chinese property, commodities, iron ore and exporter currencies (AUD, BRL, CLP).",
      fonte: "PBOC",
      relevancia: "alta",
    });
  }
  return eventos;
}

function eventosCanadaCpi(ini, fim) {
  const eventos = [];
  for (const dataStr of CANADA_CPI_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "09:30",
      regiao: "CA",
      evento: "Canadá — IPC ao consumidor (CPI)",
      evento_en: "Canada — Consumer Price Index (CPI)",
      descricao:
        "Inflação ao consumidor no Canadá, referência para o Bank of Canada. " +
        "Impacto em CAD, bonds canadenses e expectativas de política monetária.",
      descricao_en: "Canada headline CPI. Key benchmark for Bank of Canada. Impacts CAD and rate expectations.",
      fonte: "Statistics Canada",
      relevancia: "media",
    });
  }
  return eventos;
}

function eventosUsHousing(ini, fim) {
  const eventos = [];
  for (const dataStr of US_NEW_HOME_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "11:00",
      regiao: "US",
      evento: "EUA — Vendas de imóveis novos",
      evento_en: "US — New Home Sales",
      descricao:
        "Vendas de imóveis residenciais novos nos EUA (annualized rate). " +
        "Indicador do mercado imobiliário e da saúde do consumo americano.",
      descricao_en: "US new single-family home sales. Housing market and consumer health indicator.",
      fonte: "Census Bureau",
      relevancia: "media",
    });
  }
  for (const dataStr of US_EXISTING_HOME_2026) {
    if (!naJanela(dataStr, ini, fim)) continue;
    eventos.push({
      data: dataStr,
      hora_brt: "11:00",
      regiao: "US",
      evento: "EUA — Vendas de imóveis usados",
      evento_en: "US — Existing Home Sales",
      descricao:
        "Vendas de imóveis residenciais existentes nos EUA. Cobre ~90% " +
        "do mercado imobiliário americano. Indicador de atividade e preços.",
      descricao_en: "US existing home sales. Covers ~90% of US housing market. Activity and price indicator.",
      fonte: "NAR",
      relevancia: "media",
    });
  }
  return eventos;
}

// _dedupe: remove duplicatas por (data, regiao, evento casefold) mantendo a de
// maior relevância. Ordem de primeira ocorrência preservada (Map do JS).
export function dedupeEventos(eventos) {
  const melhor = new Map();
  for (const e of eventos) {
    const chave = JSON.stringify([
      e.data,
      e.regiao !== undefined ? e.regiao : null,
      (e.evento || "").trim().toLowerCase(),
    ]);
    const atual = melhor.get(chave);
    if (atual === undefined) {
      melhor.set(chave, e);
      continue;
    }
    if ((PESO_RELEVANCIA[e.relevancia] || 0) > (PESO_RELEVANCIA[atual.relevancia] || 0)) {
      melhor.set(chave, e);
    }
  }
  return [...melhor.values()];
}

const FONTES_PRIMARIAS = [
  "IBGE — Calendário de divulgações (API v3/calendario)",
  "BCB — Calendário de divulgações + Boletim Focus/COPOM",
  "BLS — CPI, PPI, Nonfarm Payrolls (schedule oficial 2026)",
  "Census Bureau — Advance Retail Sales (schedule oficial 2026)",
  "Fed — FOMC calendar (federalreserve.gov)",
  "ECB — Governing Council calendar (ecb.europa.eu)",
  "Bank of England — MPC calendar (bankofengland.co.uk)",
  "Bank of Japan — MPM schedule (boj.or.jp)",
  "NBS China — GDP, CPI, PMI (stats.gov.cn)",
  "Eurostat — CPI Flash calendar (ec.europa.eu/eurostat)",
];

// buildAgenda: computa a agenda da semana de `hojeISO` com as mesmas regras do
// gerar_agenda() do agenda_agent.py. Recebe os items crus do IBGE (parseados
// internamente) e o número de meses do IBGE com falha. Devolve
// { payload, agendaStatus } com agendaStatus = "ok" | "degradado".
export function buildAgenda(hojeISO, ibgeItems, opts = {}) {
  const { ibgeErros = 0, agoraIso = "FIXTURE" } = opts;
  const [proxSeg, proxSex] = janelaSegSex(hojeISO);
  const ini = proxSeg;
  const fim = proxSex;

  let eventos = [eventoFocus(ini)];
  eventos = eventos.concat(
    eventosUs(ini, fim),
    eventosCopomFomc(ini, fim),
    parseIbgeItems(ibgeItems || [], ini, fim),
    eventosSemanais(ini, fim),
    eventosEcb(ini, fim),
    eventosBoe(ini, fim),
    eventosBoj(ini, fim),
    eventosChina(ini, fim),
    eventosEurozone(ini, fim),
    eventosUkCpi(ini, fim),
    eventosUkLabour(ini, fim),
    eventosUkRetail(ini, fim),
    eventosJpCpi(ini, fim),
    eventosGlobalPmi(ini, fim),
    eventosZew(ini, fim),
    eventosChinaLpr(ini, fim),
    eventosCanadaCpi(ini, fim),
    eventosUsHousing(ini, fim),
  );

  eventos = dedupeEventos(eventos);
  eventos.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    return a.hora_brt < b.hora_brt ? -1 : a.hora_brt > b.hora_brt ? 1 : 0;
  });

  const payload = {
    meta: {
      version: hojeISO,
      curator: "Szuchmacher Consultoria",
      fontes_primarias: FONTES_PRIMARIAS,
      disciplina: "Eventos programados em fontes oficiais. Sem antecipação de resultado.",
      disciplina_en: "Scheduled releases from official sources. No result anticipation.",
      idiomas: ["pt-BR", "en"],
    },
    gerado: agoraIso,
    janela: { inicio: ini, fim: fim },
    eventos,
  };

  return { payload, agendaStatus: ibgeErros > 0 ? "degradado" : "ok" };
}

// brtIsoNow: timestamp ISO-8601 em BRT (UTC-3 fixo), formato usado pelo Python
// (ex.: "2026-08-18T21:00:00-03:00"). Cosmético, usado no campo `gerado`.
export function brtIsoNow(now) {
  const ms = now == null ? Date.now() : typeof now === "number" ? now : now.getTime();
  const d = new Date(ms - 3 * 3600 * 1000);
  const iso = d.toISOString().slice(0, 19);
  return `${iso}-03:00`;
}

// brtToday: data BRT atual no formato YYYYMMDD (o "hoje" dos pipelines).
export function brtToday(now) {
  const ms = now == null ? Date.now() : typeof now === "number" ? now : now.getTime();
  const d = new Date(ms - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
