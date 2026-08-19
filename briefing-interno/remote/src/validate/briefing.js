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
export const CITATION_PATTERN = /\[([^\[\]]+)\]/g;
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

// validar: porta do main() do validador, devolvendo o mesmo shape do
// validacao_YYYYMMDD.json + as mensagens de OK/REPROVADO.
export function validar(html, noticias, estado, exposicao) {
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
