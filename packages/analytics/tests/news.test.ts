// Testes da camada de notícias — portado de news.test.mjs para Vitest/TS
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeNewsItem, dedupeNews, sortByRecency, capNews, curateNews } from "../src/index.js";
import { validateRadar } from "../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));

/**
 * Forma mínima da fixture que estes testes manipulam. `JSON.parse` devolve `any`, e `any` num
 * teste de validador é especialmente ruim: o teste passa a não checar nada sobre a forma do que
 * está validando, justo onde a forma é o assunto.
 */
interface FixtureScan {
  news: Record<string, unknown[]>;
  items: { news?: unknown[] }[];
}

const load = (f: string): FixtureScan =>
  JSON.parse(readFileSync(join(__dir, "fixtures", f), "utf8")) as FixtureScan;

// ---------- helpers puros ----------

describe("normalizeNewsItem", () => {
  it("extrai campos e deriva source do host", () => {
    const n = normalizeNewsItem({ title: "X", url: "https://www.exemplo.com.br/a?b=1" });
    expect(n).not.toBeNull();
    expect(n!.title).toBe("X");
    expect(n!.source).toBe("exemplo.com.br");
    expect(n!.publishedAt).toBeNull();
  });

  it("rejeita item sem título ou url", () => {
    expect(normalizeNewsItem({ title: "só título" })).toBeNull();
    expect(normalizeNewsItem({ url: "https://x.com" })).toBeNull();
    expect(normalizeNewsItem(null)).toBeNull();
  });
});

describe("dedupeNews", () => {
  it("remove url duplicada (ignorando query/barra final)", () => {
    const out = dedupeNews([
      { title: "A", url: "https://x.com/a", source: "x", publishedAt: null },
      { title: "A2", url: "https://x.com/a/", source: "x", publishedAt: null },
      { title: "A3", url: "https://x.com/a?utm=1", source: "x", publishedAt: null },
      { title: "B", url: "https://x.com/b", source: "x", publishedAt: null },
    ]);
    expect(out.length).toBe(2);
  });
});

describe("sortByRecency", () => {
  it("mais recente primeiro; sem data por último", () => {
    const out = sortByRecency([
      { title: "velha", url: "u1", source: "s", publishedAt: "2026-06-10T00:00:00Z" },
      { title: "sem", url: "u2", source: "s", publishedAt: null },
      { title: "nova", url: "u3", source: "s", publishedAt: "2026-06-15T00:00:00Z" },
    ]);
    expect(out.map((x) => x.title)).toEqual(["nova", "velha", "sem"]);
  });
});

describe("capNews", () => {
  it("limita quantidade", () => {
    expect(capNews([1, 2, 3, 4], 2).length).toBe(2);
  });
});

describe("curateNews", () => {
  it("pipeline normaliza, dedupe, ordena e limita", () => {
    const raw = [
      { headline: "Dup", link: "https://x.com/a", date: "2026-06-12" },
      { title: "Dup2", url: "https://x.com/a/", publishedAt: "2026-06-13" },
      { title: "Recente", url: "https://x.com/b", publishedAt: "2026-06-15" },
      { title: "sem url" },
    ];
    const out = curateNews(raw, 5);
    expect(out.length).toBe(2);
    expect(out[0].title).toBe("Recente");
  });
});

// ---------- validação ----------

describe("validateRadar news", () => {
  it("aceita fixture com notícias", () => {
    const v = validateRadar(load("with-news.json"));
    expect(v.ok).toBe(true);
  });

  it("compat — fixture sem notícias continua válida", () => {
    const v = validateRadar(load("normal.json"));
    expect(v.ok).toBe(true);
  });

  it("rejeita notícia macro sem url", () => {
    const r = load("with-news.json");
    r.news.macro.push({ title: "sem url" });
    const v = validateRadar(r);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e: string) => e.includes("news.macro"))).toBe(true);
  });

  it("rejeita notícia de item sem title", () => {
    const r = load("with-news.json");
    r.items[1].news!.push({ url: "https://x.com/y" });
    const v = validateRadar(r);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e: string) => e.includes(".news"))).toBe(true);
  });
});
