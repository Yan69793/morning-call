// collect/noticias.js — porta de coletar_noticias.py (RSS brasileiro).
//
// 4 feeds RSS BR (InfoMoney, G1 Economia, Poder360, Agencia Brasil).
// Finnhub e GDELT nao foram portados (opcionais no local; GDELT ja dava 429
// ate de casa em 18/08). Parse RSS 2.0 sem ElementTree: tokenizador minimo
// com paridade testada contra fixture de feed real (tests/noticias.equiv).
//
// Saida: shape identico ao logs/noticias_YYYYMMDD.json do pipeline local.

export const FEEDS = [
  ["InfoMoney", "https://www.infomoney.com.br/feed/"],
  ["G1 Economia", "https://g1.globo.com/rss/g1/economia/"],
  ["Poder360", "https://www.poder360.com.br/feed/"],
  ["Agencia Brasil", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"],
];

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
export const MAX_PER_FEED = 25;
export const MAX_TOTAL = 60;
const MAX_DIAS = 3;

// decodeEntities: aproxima o que o ElementTree do Python faz com as
// entidades (html.parser decodifica named + numeric antes de entregar o .text).
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = parseInt(n, 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      const cp = parseInt(n, 16);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "";
      }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function firstChildText(inner, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(inner);
  if (!m) return "";
  return decodeEntities(stripCdata(m[2])).trim();
}

// parseRss: porta de _parse_rss (ElementTree iter('item') + find('title'|'link'|'pubDate')).
export function parseRss(xmlText, source) {
  const items = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  for (const m of xmlText.matchAll(itemRe)) {
    const inner = m[1];
    const title = firstChildText(inner, "title");
    const url = firstChildText(inner, "link");
    if (!title || !url) continue;
    const published = firstChildText(inner, "pubDate");
    items.push({ title, url, source, published });
    if (items.length >= MAX_PER_FEED) break;
  }
  return items;
}

// parsePublished: porta dos 5 formatos de _is_recent, na mesma ordem e com
// a mesma exigencia de formato (fmt2 exige offset, fmt3 exige Z literal).
// Devolve ms UTC ou null quando nenhum formato casa.
//
// fmt1 e parseado a mao (nao via Date.parse): o strptime do Python parseia os
// CAMPOS e ignora consistencia de dia da semana; o Date.parse do V8 aplica
// heuristica propria (um "Thu" errado na data deslocou o horario em 6h).
const MESES_ABREV = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function parsePublished(pub) {
  const s = pub.trim();

  // 1) "%a, %d %b %Y %H:%M:%S %z"
  const m2822 = /^\w{3}, (\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s);
  if (m2822) {
    const mes = MESES_ABREV[m2822[2]];
    if (mes !== undefined) {
      let t = Date.UTC(+m2822[3], mes, +m2822[1], +m2822[4], +m2822[5], +m2822[6]);
      t -= (m2822[7] === "+" ? 1 : -1) * ((+m2822[8]) * 3600 + (+m2822[9]) * 60) * 1000;
      return t;
    }
  }

  // 2) "%Y-%m-%dT%H:%M:%S%z" (offset obrigatorio)
  const mTz = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):?(\d{2})$/.exec(s);
  if (mTz) {
    let t = Date.UTC(+mTz[1], +mTz[2] - 1, +mTz[3], +mTz[4], +mTz[5], +mTz[6]);
    t -= (mTz[7] === "+" ? 1 : -1) * ((+mTz[8]) * 3600 + (+mTz[9]) * 60) * 1000;
    return t;
  }

  // 3) "%Y-%m-%dT%H:%M:%SZ" (Z literal)
  const mZ = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(s);
  if (mZ) {
    return Date.UTC(+mZ[1], +mZ[2] - 1, +mZ[3], +mZ[4], +mZ[5], +mZ[6]);
  }

  // 4) "%Y-%m-%d %H:%M:%S" naive -> BRT (replace(tzinfo=BRT): 12:00 BRT = 15:00 UTC)
  const mNaive = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (mNaive) {
    return Date.UTC(+mNaive[1], +mNaive[2] - 1, +mNaive[3], +mNaive[4], +mNaive[5], +mNaive[6]) + 3 * 3600 * 1000;
  }

  // 5) "%Y%m%d%H%M%S" naive -> BRT
  const mCompact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (mCompact) {
    return Date.UTC(+mCompact[1], +mCompact[2] - 1, +mCompact[3], +mCompact[4], +mCompact[5], +mCompact[6]) + 3 * 3600 * 1000;
  }

  return null;
}

export function isRecent(item, maxDias = MAX_DIAS, nowMs) {
  const pub = item.published || "";
  if (!pub) return true; // sem data, mantem
  const t = parsePublished(pub);
  if (t === null) return true; // formato desconhecido, mantem
  const now = nowMs || Date.now();
  const cutoff = now - 3 * 3600 * 1000 - maxDias * 86400 * 1000; // now(BRT) - max_dias
  return t >= cutoff;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

async function httpGet(url, timeoutMs, fetchImpl) {
  const f = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await f(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function collectRss(fetchImpl, nowMs) {
  const allItems = [];
  const falhas = [];
  for (const [name, url] of FEEDS) {
    const xmlText = await httpGet(url, 20000, fetchImpl);
    if (xmlText === null) {
      falhas.push(name);
      continue;
    }
    const items = parseRss(xmlText, name);
    allItems.push(...items);
  }
  return { allItems, falhas };
}

// coletarNoticias: orquestracao completa, shape identico ao Python.
export async function coletarNoticias(dataTag, fetchImpl, nowMs) {
  const { allItems, falhas } = await collectRss(fetchImpl, nowMs);
  let items = dedupe(allItems);
  items = items.filter((i) => i.url && i.title);
  items = items.filter((i) => isRecent(i, MAX_DIAS, nowMs));
  items = items.slice(0, MAX_TOTAL);

  const now = nowMs || Date.now();
  const coletadoEm = new Date(now - 3 * 3600 * 1000).toISOString().replace("Z", "-03:00");

  const payload = {
    coletado_em: coletadoEm,
    data: dataTag,
    n_itens: items.length,
    itens: items,
  };
  const temBr = items.some((i) =>
    ["InfoMoney", "G1 Economia", "Poder360", "Agencia Brasil"].includes(i.source),
  );
  return { payload, temBr, falhas };
}
