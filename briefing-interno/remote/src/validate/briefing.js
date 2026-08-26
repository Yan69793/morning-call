// validate/briefing.js — porta de validar_briefing.py (o PORTAO do briefing).
//
// 5 regras, fail-closed. REGRA 1: toda URL/citacao precisa bater com o pool
// de noticias do dia por host+caminho normalizados (mesma _normalize_url).
// REGRA 4 neutralizada desde 13/08 (secao Radar Quant removida).
//
// Paridade byte: os 10 padroes direcionais, os regexes de URL/citacao e a
// _normalize_url sao copias fiéis; tests/validator.equiv.test.mjs roda os
// HTMLs reais do disco (aprovado e reprovado) e exige os MESMOS veredictos.

export const NOMES_PROJETOS_EXPOSTOS = new Set([
  "VixRadar", "Morning Call", "Radar Quant", "ATLAS",
  "Fechamento Diario e Site", "Mercado de Apostas",
  "Plataforma de Carreira Executiva", "Jornada Interior",
  "Meu Assessor", "MultiAsset-Supabase",
]);

export const NOMES_PROJETOS_SEM_EXPOSICAO = new Set([
  "Jarvis", "graphify", "Agente Yan", "Tapetier", "Szuchmacher IA",
]);

export const DIRECTIONAL_PATTERNS = [
  /tende\s+a\s+(subir|cair|valorizar|desvalorizar)/i,
  /deve\s+(subir|cair|valorizar|desvalorizar|recuar|avancar)/i,
  /vai\s+(subir|cair|valorizar|desvalorizar)/i,
  /press[aã]o\s+(de|para)\s+(alta|baixa|compra|venda)/i,
  /potencial\s+de\s+(alta|baixa|valorizacao)/i,
  /sinal\s+(positivo|negativo|de\s+alta|de\s+baixa)/i,
  /expectativa\s+(positiva|negativa|de\s+alta|de\s+baixa)/i,
  /vi[eé]s\s+(altista|baixista|positivo|negativo|de\s+alta|de\s+baixa)/i,
  // 14/08/2026: drift prompt x validador — "deve pressionar" e
  // "revisao para baixo/cima" sao padrao valido de chamada direcional.
  /(tende|deve|pode)\s+(a\s+)?pressionar/i,
  /revis[aã]o\s+para\s+(baixo|cima)/i,
];

export const URL_PATTERN = /https?:\/\/[^\s<>"'[\]]+/g;
export const CITATION_PATTERN = /\[([^[\]]+)\]/g;
export const INTERNAL_DOMAINS = ["szuchmacher.com.br", "localhost", "127.0.0.1"];
export const CONFIANCA_PATTERN = /confian[cç]a\s*[:=]?\s*(\d+[.,]\d+)/gi;

// _normalize_url: host + caminho, sem esquema, sem www, sem barra final.
export function normalizeUrl(u) {
  let s = u.trim();
  s = s.replace(/\.$/, "").replace(/\)$/, "");
  if (!s.startsWith("http")) {
    s = "https://" + s;
  }
  const m = /^https?:\/\/([^/?#]+)(\/[^?#]*)?/.exec(s);
  if (!m) return null;
  let host = m[1].toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const path = (m[2] || "/").replace(/\/+$/, "");
  return `${host}${path}`;
}

// buildUrlPool: pool normalizado a partir do artefato de noticias.
export function buildUrlPool(noticias) {
  const pool = new Set();
  for (const item of noticias?.itens || []) {
    if (!item.url) continue;
    const n = normalizeUrl(item.url);
    if (n) pool.add(n);
  }
  return pool;
}

export function findDirectionalParagraphs(html) {
  // Remove tags para buscar so no texto (mesma transformacao do Python).
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const encontrados = [];
  for (const pattern of DIRECTIONAL_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) {
      const start = Math.max(0, match.index - 150);
      const end = Math.min(text.length, match.index + match[0].length + 150);
      const trecho = text.slice(start, end).trim();
      if (!encontrados.includes(trecho)) encontrados.push(trecho);
    }
  }
  return encontrados;
}

export function extractUrls(html) {
  const urls = [];
  for (const m of html.matchAll(URL_PATTERN)) {
    if (!urls.includes(m[0])) urls.push(m[0]);
  }
  return urls;
}

export function findProjectMentions(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const textLower = text.toLowerCase();
  const mencionados = new Set();
  for (const nome of NOMES_PROJETOS_EXPOSTOS) {
    if (textLower.includes(nome.toLowerCase())) mencionados.add(nome);
  }
  for (const nome of NOMES_PROJETOS_SEM_EXPOSICAO) {
    if (textLower.includes(nome.toLowerCase())) mencionados.add(`PROIBIDO:${nome}`);
  }
  return mencionados;
}

// REGRA 4 neutralizada em 13/08/2026 (retorna sempre OK). O codigo antigo
// fica documentado no Python original; se a secao Radar Quant voltar,
// reativar a checagem nos dois lados.
export function checkRadarQuantStaleness() {
  return [true, "Secao Radar Quant removida do briefing (decisao 13/08), staleness nao se aplica"];
}

function findCitations(html) {
  // Citacoes entre colchetes que parecem URL (mesmo filtro do Python).
  const citacoes = new Set();
  for (const m of html.matchAll(CITATION_PATTERN)) {
    const c = m[1].trim();
    if (/^[a-zA-Z0-9./-]+\.[a-z]{2,}(\/|$)/.test(c)) citacoes.add(c);
  }
  return citacoes;
}

// ============================================================================
// REGRA 6 (porta de _check_numeros_mercado do validar_briefing.py). Confronta
// nivel citado no texto com a cotacao real do pregao. Fail-closed: sem
// arquivo de precos (ou com 0 ativos) o portao fica cego justamente na classe
// de erro mais cara (numero inventado indo para cliente) e reprova. Preferimos
// travar o envio a aprovar sem conferir — mesma regra do local.
// ============================================================================

import { ATIVOS_META } from "../collect/precos.js";

// Como o ativo aparece escrito no briefing (porta de _comum.py). Minusculo,
// sem acento: o casamento normaliza os dois lados. "cambio", "vale" e
// "petroleo" sozinhos ficaram de fora de proposito: casam com texto comum
// ("vale a pena", "politica cambial") e trariam o numero da frase errada.
export const ATIVOS_ALIASES = {
  IBOV: ["ibovespa", "ibov"],
  SPX: ["s&p 500", "s&p500", "sp500", "standard & poor", "spx"],
  USDBRL: ["dolar", "usd/brl", "usdbrl", "real frente ao dolar"],
  DXY: ["dxy", "indice do dolar"],
  VIX: ["vix"],
  GOLD: ["ouro", "gold"],
  WTI: ["wti", "petroleo wti", "petroleo bruto"],
  BTC: ["bitcoin", "btc"],
  PETR4: ["petr4", "petrobras"],
  VALE3: ["vale3"],
  ITUB4: ["itub4", "itau"],
  BBDC4: ["bbdc4", "bradesco"],
  ABEV3: ["abev3", "ambev"],
  WEGE3: ["wege3", "weg"],
  SELIC: ["selic", "taxa basica de juros", "meta selic"],
};

// Nivel de mercado so conta quando vem com marcador de unidade. Sem isso,
// "sequencia de 11 quedas" e "235 mil pedidos" virariam candidatos e
// reprovariam briefing correto. Pontuacao so conta como NIVEL depois de
// preposicao de destino ("fechou em 167.830 pontos", nao "caiu 1.200 pontos").
const NIVEL_PATTERNS = [
  /(?:r\$|us\$|\$)\s*([\d][\d.,]*)/i,
  /\b(?:para|em|aos?|ate)\s+([\d][\d.,]*)\s*pontos?\b/i,
];

// Verbo de variacao logo antes do numero indica delta, nao nivel (porta de
// DELTA_VERBOS + DELTA_ANTES). Lista explicita, igual ao Python.
const DELTA_VERBOS = [
  "caiu", "cairam", "subiu", "subiram", "recuou", "recuaram",
  "avancou", "avancaram", "ganhou", "ganharam", "perdeu", "perderam",
  "variou", "variaram", "oscilou", "oscilaram", "valorizou", "valorizaram",
  "desvalorizou", "desvalorizaram",
];
const DELTA_ANTES = new RegExp(
  "\\b(?:" + DELTA_VERBOS.join("|") + ")\\s+" +
    "(?:cerca de\\s+)?(?:r\\$|us\\$|\\$)?\\s*$",
);

// Taxa de juro e nivel, nao variacao, apesar de vir escrita com %. Exige
// "ao ano" ou "a.a." de proposito: "Selic subiu 0,25%" e variacao.
const TAXA_PATTERN = /([\d][\d.,]*)\s*%\s*(?:a\.?\s?a\.?|ao\s+ano)/i;

// Numero em janela de projecao nao e cotacao (porta de PROJECAO_PATTERN). Caso
// real: "o JPMorgan alerta que as eleicoes podem levar o dolar a R$ 5,50" —
// R$ 5,50 e previsao de terceiro, nao fechamento.
const PROJECAO_PATTERN =
  /(pode(m)?\s+(levar|chegar|ir|atingir|alcancar)|projet\w+|previs\w+|estimativ\w+|estima\b|alerta\s+que|cenario|meta\s+de|deve\s+chegar|ate\s+o\s+(fim|final)|aposta\w*|espera\s+que)/;

// Fim de frase. O lookahead pelo espaco evita cortar dentro de "118.753,48",
// onde o ponto e separador de milhar e nao tem espaco depois.
const FIM_DE_FRASE = /[.;!?]\s/;

// normalizar: porta de _normalizar (minusculo + sem acento, via NFKD). O JS
// nao tem unicodedata; decompor com regex cobre os acentos do pt-BR.
export function normalizar(texto) {
  const semAcento = texto
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return semAcento.toLowerCase();
}

// parseNumBR: porta de _parse_num_br. "118.753,48" -> 118753.48; "5,17" ->5.17;
// "171.032" -> 171032.0; "1.5" -> 1.5.
export function parseNumBR(bruto) {
  const b = String(bruto).trim().replace(/[.,]+$/, "");
  if (!b || !/\d/.test(b)) return null;
  if (b.includes(",")) return Number(b.replace(/\./g, "").replace(",", "."));
  if (b.includes(".")) {
    const partes = b.split(".");
    if (partes.slice(1).every((p) => p.length === 3)) return Number(b.replace(/\./g, ""));
    return Number(b);
  }
  return Number(b);
}

// frases: spans (inicio, fim) de cada frase do texto normalizado.
function frases(texto) {
  const spans = [];
  let ini = 0;
  for (const m of texto.matchAll(new RegExp(FIM_DE_FRASE.source, "g"))) {
    spans.push([ini, m.index]);
    ini = m.index + m[0].length;
  }
  if (ini < texto.length) spans.push([ini, texto.length]);
  return spans;
}

// candidatosDeNivel: numeros que afirmam nivel de mercado, com a posicao.
// So conta numero com marcador de unidade; delta antes do numero descarta o
// candidato (porta de _candidatos_de_nivel).
function candidatosDeNivel(texto) {
  const achados = [];
  const pats = [...NIVEL_PATTERNS, TAXA_PATTERN];
  for (const pat of pats) {
    const flags = `${pat.flags.includes("i") ? "i" : ""}g`;
    for (const m of texto.matchAll(new RegExp(pat.source, flags))) {
      // Recorte ancora no NUMERO (start do grupo 1), nao no inicio do match.
      const pos = m.index + m[0].indexOf(m[1]);
      if (DELTA_ANTES.test(texto.slice(Math.max(0, pos - 30), pos))) continue;
      const v = parseNumBR(m[1]);
      if (v !== null && !Number.isNaN(v)) achados.push([pos, v]);
    }
  }
  return achados.sort((a, b) => a[0] - b[0]);
}

// NUMERO_GENERICO + todosOsNumeros: camada 1 da REGRA 6 (conferir sem
// marcador, corrige 26/08/2026 — o briefing saiu com "IBOV +1.55% a
// 174577.0", numero cru que candidatosDeNivel nao pegava porque so conta
// nivel com R$/US$/pontos/% a.a., e o portao registrou "nada a conferir").
const NUMERO_GENERICO = /[\d][\d.,]*/g;

function todosOsNumeros(texto) {
  const achados = [];
  for (const m of texto.matchAll(NUMERO_GENERICO)) {
    const pos = m.index;
    if (DELTA_ANTES.test(texto.slice(Math.max(0, pos - 30), pos))) continue;
    const v = parseNumBR(m[0]);
    if (v !== null && !Number.isNaN(v)) achados.push([pos, v]);
  }
  return achados;
}

// atribuiPorTicker: cada numero pertence a UMA mencao, a mais proxima antes
// dele dentro da mesma frase. Extraido em 26/08/2026 porque a REGRA 6 passou
// a rodar duas varreduras (todos os numeros e candidatos de nivel) sobre o
// mesmo mecanismo de atribuicao. Janela por caractere nao serve — caso real
// do briefing_20260818.html.
function atribuiPorTicker(numeros, texto, mencoes) {
  const porTicker = {};
  for (const [pos, valor] of numeros) {
    const frase = frases(texto).find(([a, b]) => a <= pos && pos < b);
    if (!frase) continue;
    const [fa, fb] = frase;
    if (PROJECAO_PATTERN.test(texto.slice(fa, fb))) continue;
    const antes = mencoes.filter((m) => fa <= m[0] && m[0] < pos);
    const depois = mencoes.filter((m) => pos < m[0] && m[0] < fb);
    const dono = antes.length ? antes[antes.length - 1] : depois.length ? depois[0] : null;
    if (!dono) continue;
    if (!porTicker[dono[2]]) porTicker[dono[2]] = [];
    porTicker[dono[2]].push(valor);
  }
  return porTicker;
}

// checkNumerosMercado: porta de _check_numeros_mercado. Devolve (problemas,
// oks, avisos). Tres camadas, conservador para nao reprovar briefing bom:
//   camada 1: TODO numero do texto que bate com o close confirma o ativo,
//     mesmo sem "R$"/"pontos" na frase. Nunca reprova;
//   camada 2: nivel com marcador (R$/US$/pontos/% a.a.) que nao bate reprova;
//   camada 3: numero solto dentro de [0.5*close, 1.5*close] em indice/cripto
//     que nao bate reprova (sem excecao de ano: com SPX ~7.677 a banda e
//     [3.838, 11.515], o "2026" nao cai nela).
// Limitacao aceita: nivel errado sem unidade em cambio, juro, commodity,
// volatilidade e acao continua invisivel (a prosa legitima deles poe numero
// incidental perto do close; reprovar seria falso positivo).
export function checkNumerosMercado(html, precos) {
  const problemas = [];
  const oks = [];
  const avisos = [];

  const texto = normalizar(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const ativos = (precos && precos.ativos) || {};

  // Mapa de mencoes por alias, do mais longo ao mais curto, sem sobreposicao,
  // cortando a janela de um ativo quando comeca a mencao do vizinho.
  const mencoes = [];
  const pares = [];
  for (const [ticker, lista] of Object.entries(ATIVOS_ALIASES)) {
    if (!(ticker in ativos)) continue;
    for (const alias of lista) pares.push([ticker, normalizar(alias)]);
  }
  pares.sort((a, b) => b[1].length - a[1].length);
  for (const [ticker, alvo] of pares) {
    const re = new RegExp(`\\b${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    for (const m of texto.matchAll(re)) {
      if (mencoes.some(([ini, fim]) => m.index < fim && ini < m.index + m[0].length)) continue;
      mencoes.push([m.index, m.index + m[0].length, ticker]);
    }
  }
  mencoes.sort((a, b) => a[0] - b[0]);

  // Camada 1: todos os numeros conferem (so ok). Camadas 2/3: candidatos de
  // nivel com marcador, mais os numeros em banda de indice/cripto, reprovam.
  const todosPorTicker = atribuiPorTicker(todosOsNumeros(texto), texto, mencoes);
  const claimsPorTicker = atribuiPorTicker(candidatosDeNivel(texto), texto, mencoes);

  // Camada 3: numero em banda de magnitude vira claim de nivel para
  // indice/cripto. A faixa e do ticker DONO (a atribuicao ja rodou), entao um
  // numero na banda do Ibovespa atribuido ao SPX nao vira claim do SPX.
  for (const [ticker, dado] of Object.entries(ativos)) {
    const meta = ATIVOS_META[ticker] || {};
    const classe = dado.classe || meta.classe || "";
    const close = dado && dado.close;
    if (classe !== "indice" && classe !== "cripto") continue;
    if (close === null || close === undefined) continue;
    const ini = close * 0.5;
    const fim = close * 1.5;
    for (const v of todosPorTicker[ticker] || []) {
      if (v >= ini && v <= fim) {
        if (!claimsPorTicker[ticker]) claimsPorTicker[ticker] = [];
        claimsPorTicker[ticker].push(v);
      }
    }
  }

  // Decisao por ativo. Numero que bate confere (camada 1 ou 2); claim que nao
  // bate reprova (camadas 2 e 3); ativo sem claim e sem numero que bate fica
  // em silencio (nao afirmou nivel, nao ha o que conferir).
  const tickers = [...new Set([...Object.keys(todosPorTicker), ...Object.keys(claimsPorTicker)])].sort();
  for (const ticker of tickers) {
    const dado = ativos[ticker];
    const close = dado && dado.close;
    const tradeDate = dado && dado.trade_date;
    if (close === null || close === undefined || !tradeDate) {
      problemas.push(
        `REGRA 6: ${ticker} citado no briefing mas sem close ou sem trade_date ` +
          "no arquivo de precos, coleta incompleta e o portao fica cego nesse ativo",
      );
      continue;
    }
    if (dado.quorum === "divergencia") {
      problemas.push(
        `REGRA 6: ${ticker} com divergencia de ${dado.divergencia_pct}% entre ` +
          "fontes independentes, nao ha cotacao confiavel para conferir o briefing",
      );
      continue;
    }
    const meta = ATIVOS_META[ticker] || {};
    const tolerancia = dado.tolerancia || meta.tolerancia || 1.0;
    const unidade = dado.unidade || meta.unidade || "pct";
    const todos = todosPorTicker[ticker] || [];
    const claims = claimsPorTicker[ticker] || [];

    const bate =
      unidade === "bp"
        ? (v) => Math.abs(v - close) * 100 <= tolerancia
        : (v) => close && (Math.abs(v - close) / Math.abs(close)) * 100 <= tolerancia;
    const descTol = unidade === "bp" ? `${tolerancia} bp` : `${tolerancia}%`;

    const bateClaims = claims.filter(bate);
    const bateGeral = todos.filter(bate);
    const escolhido = bateClaims.length ? bateClaims[0] : bateGeral.length ? bateGeral[0] : null;

    if (escolhido !== null) {
      oks.push(
        `${ticker}: ${escolhido} confere com ${close} ` +
          `(pregao ${tradeDate}, tolerancia ${descTol})`,
      );
    } else if (claims.length) {
      const citados = claims.slice(0, 4).join(", ");
      problemas.push(
        `REGRA 6: ${ticker} citado como ${citados} mas o fechamento de ` +
          `${tradeDate} foi ${close} (tolerancia ${descTol}, fonte ` +
          `${dado.fonte || "n/d"})`,
      );
    }
  }

  return [problemas, oks, avisos];
}

// validar: porta do main() do validador, devolvendo o mesmo shape do
// validacao_YYYYMMDD.json + as mensagens de OK/REPROVADO.
//
// `_exposicao` e aceito e ignorado de proposito. A REGRA 3 nao le o mapa de
// exposicao, ela casa contra a lista NOMES_PROJETOS_* hardcoded logo acima. O
// parametro so existe para a assinatura bater com a do chamador e com a do
// validador Python. Descoberto em 24/08/2026 quando o eslint passou a
// enxergar este diretorio pela primeira vez. E o mesmo drift do achado T04 do
// PENDENCIAS.md, onde o comentario do validador local promete fallback do JSON
// e a regra usa o set fixo. Se um dia a lista sair para o JSON, e aqui que o
// parametro volta a ter uso. `precos` alimenta a REGRA 6; sem ele (ou vazio)
// o portao reprova — fail-closed numerico.
export function validar(html, noticias, estado, _exposicao, precos) {
  const problemas = [];
  const avisos = [];
  const mensagens = [];

  const urlPoolNorm = buildUrlPool(noticias);

  const direcionais = findDirectionalParagraphs(html);
  const urlsNoHtml = extractUrls(html);
  const citacoesUrl = findCitations(html);

  let urlsForaDoPool = [];
  if (!direcionais.length) {
    problemas.push("REGRA 5: Nenhuma chamada direcional encontrada. Briefing vazio.");
  } else {
    mensagens.push(`OK: ${direcionais.length} chamada(s) direcional(is) encontrada(s)`);

    urlsForaDoPool = [];
    for (const u of [...urlsNoHtml, ...citacoesUrl]) {
      if (INTERNAL_DOMAINS.some((d) => u.includes(d))) continue;
      const n = normalizeUrl(u);
      if (n === null || !urlPoolNorm.has(n)) {
        urlsForaDoPool.push(u);
      }
    }
    if (urlsForaDoPool.length) {
      problemas.push(
        `REGRA 1: ${urlsForaDoPool.length} URL(s) no briefing nao estao no pool de noticias: ` +
          [...urlsForaDoPool].sort().slice(0, 5).join(", "),
      );
    } else {
      mensagens.push(
        `OK: ${urlsNoHtml.length} URL(s) e ${citacoesUrl.size} citacao(oes) no briefing, todas no pool de noticias`,
      );
    }
  }

  const confiancas = [...html.matchAll(CONFIANCA_PATTERN)].map((m) => m[1]);
  if (direcionais.length && !confiancas.length) {
    problemas.push("REGRA 2: Chamadas direcionais sem confianca declarada (ex.: 'confianca: 0.7')");
  } else if (confiancas.length) {
    mensagens.push(`OK: ${confiancas.length} confianca(s) declarada(s): ${confiancas.slice(0, 5).join(", ")}`);
  }

  const mencionados = findProjectMentions(html);
  const proibidos = [...mencionados].filter((m) => m.startsWith("PROIBIDO:"));
  if (proibidos.length) {
    const nomes = proibidos.map((m) => m.replace("PROIBIDO:", ""));
    problemas.push(`REGRA 3: Projeto(s) sem exposicao a mercado citado(s): ${nomes.join(", ")}`);
  } else {
    const permitidos = [...mencionados].filter((m) => !m.startsWith("PROIBIDO:"));
    if (permitidos.length) {
      mensagens.push(`OK: ${permitidos.length} projeto(s) citado(s), todos com exposicao: ${[...permitidos].sort().join(", ")}`);
    } else {
      avisos.push("Nenhum projeto citado no briefing. Pode estar incompleto.");
    }
  }

  if (estado) {
    const [okStale, msgStale] = checkRadarQuantStaleness();
    if (okStale) {
      mensagens.push(`OK: ${msgStale}`);
    } else {
      problemas.push(`REGRA 4: ${msgStale}`);
    }
  } else {
    avisos.push("Arquivo de estado nao encontrado, pulando verificacao de staleness");
  }

  // === REGRA 6: nivel de mercado citado bate com a cotacao real (falha
  // fechada). Sem arquivo de precos, ou vazio, o portao fica cego na classe
  // de erro mais cara e reproduz — mesma logica do local.
  if (precos && precos.ativos && Object.keys(precos.ativos).length) {
    const [p6, ok6, av6] = checkNumerosMercado(html, precos);
    problemas.push(...p6);
    avisos.push(...av6);
    for (const linha of ok6) mensagens.push(`OK: ${linha}`);
    if (!p6.length && !ok6.length) {
      avisos.push("REGRA 6: nenhum nivel de mercado citado no briefing, nada a conferir");
    }
  } else if (precos) {
    // Arquivo existe mas veio vazio: cego com arquivo no lugar e pior que
    // cego sem arquivo, porque parece que conferiu.
    problemas.push(
      `REGRA 6: precos sem nenhum ativo ` +
        `(${(precos.erros || []).length} erro(s) na coleta). Nenhum numero pode ser conferido.`,
    );
  } else {
    problemas.push(
      "REGRA 6: precos_YYYYMMDD.json nao encontrado. Rode coletar_precos.py antes de validar.",
    );
  }

  const resultado = problemas.length ? "REPROVADO" : "APROVADO";
  const log = {
    resultado,
    data: null,
    problemas: problemas.length ? problemas : undefined,
    avisos: avisos.length ? avisos : undefined,
    n_direcionais: direcionais.length,
    n_confiancas: confiancas.length,
    n_urls_no_html: urlsNoHtml.length,
    n_urls_fora_pool: urlsForaDoPool.length,
    mensagens,
  };
  return { resultado, log, problemas, avisos };
}
