// dashboard/shared/news.ts
// Helpers puros de notícias — portados de news.js do legado.
// Sem I/O. Importado pelos testes e pelo worker.
//
// Item de notícia normalizado: { title, source, url, publishedAt, summary? }

export const MACRO_NEWS_CAP = 8;
export const ASSET_NEWS_CAP = 3;

export interface NormalizedNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  summary?: string;
}

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// normaliza um item bruto (de Firecrawl ou afins) para o formato do contrato
export function normalizeNewsItem(raw: unknown): NormalizedNewsItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = ((r.title || r.headline || "") as string).trim();
  const url = ((r.url || r.link || "") as string).trim();
  if (!title || !url) return null; // título e url são obrigatórios

  const source =
    ((r.source || r.site || r.publisher || hostFromUrl(url) || "") as string).trim() || "—";

  let publishedAt = (r.publishedAt || r.date || r.published || null) as string | null;
  if (publishedAt && typeof publishedAt !== "string") publishedAt = String(publishedAt);

  const out: NormalizedNewsItem = { title, source, url, publishedAt: publishedAt || null };
  if (isStr(r.summary)) out.summary = r.summary.trim();
  return out;
}

// remove duplicados por url (normalizada) e, em fallback, por título
export function dedupeNews(items: (NormalizedNewsItem | null | undefined)[]): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const out: NormalizedNewsItem[] = [];
  for (const it of items || []) {
    if (!it) continue;
    const keyUrl = (it.url || "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
    const keyTitle = (it.title || "").trim().toLowerCase();
    const key = keyUrl || keyTitle;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ordena por recência (publishedAt desc); itens sem data vão para o fim
export function sortByRecency(items: NormalizedNewsItem[]): NormalizedNewsItem[] {
  return [...(items || [])].sort((a, b) => {
    const ta = a?.publishedAt ? Date.parse(a.publishedAt) : NaN;
    const tb = b?.publishedAt ? Date.parse(b.publishedAt) : NaN;
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    return vb - va;
  });
}

// limita a quantidade
export function capNews<T>(items: T[], max: number): T[] {
  return (items || []).slice(0, max);
}

// pipeline padrão: normaliza -> dedupe -> ordena -> cap
export function curateNews(rawItems: unknown[], max = MACRO_NEWS_CAP): NormalizedNewsItem[] {
  const normalized = (rawItems || [])
    .map(normalizeNewsItem)
    .filter((x): x is NormalizedNewsItem => x !== null);
  return capNews(sortByRecency(dedupeNews(normalized)), max);
}
