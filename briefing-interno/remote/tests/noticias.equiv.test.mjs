// noticias.equiv.test.mjs — equivalencia do parse RSS portado contra o
// _parse_rss do Python (fixtures: feeds reais capturados + itens esperados).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRss, parsePublished, isRecent } from "../src/collect/noticias.js";

const feeds = JSON.parse(
  readFileSync(new URL("fixtures/rss_feeds.json", import.meta.url), "utf8"),
);

test("parseRss bate com o ElementTree do Python nos feeds reais", () => {
  assert.ok(feeds.length >= 4, `fixture com ${feeds.length} feeds`);
  for (const feed of feeds) {
    const obtido = parseRss(feed.xml, feed.name);
    assert.deepStrictEqual(obtido, feed.items, `feed ${feed.name}`);
  }
});

test("parsePublished cobre os 5 formatos do Python na mesma ordem", () => {
  // fmt1: RFC 2822
  const t1 = parsePublished("Thu, 14 Aug 2026 12:00:00 +0000");
  assert.equal(t1, Date.UTC(2026, 7, 14, 12, 0, 0));
  // fmt2: ISO com offset (exigido, como no Python)
  assert.equal(parsePublished("2026-08-14T12:00:00+0000"), Date.UTC(2026, 7, 14, 12, 0, 0));
  assert.equal(parsePublished("2026-08-14T12:00:00-03:00"), Date.UTC(2026, 7, 14, 15, 0, 0));
  // fmt3: ISO com Z literal
  assert.equal(parsePublished("2026-08-14T12:00:00Z"), Date.UTC(2026, 7, 14, 12, 0, 0));
  // fmt4: naive com espaco -> BRT (UTC-3)
  assert.equal(parsePublished("2026-08-14 12:00:00"), Date.UTC(2026, 7, 14, 15, 0, 0));
  // fmt5: compacto naive -> BRT
  assert.equal(parsePublished("20260814120000"), Date.UTC(2026, 7, 14, 15, 0, 0));
  // formato desconhecido -> null (o Python mantem o item)
  assert.equal(parsePublished("ontem"), null);
});

test("isRecent descarta item mais velho que 3 dias e mantem recente", () => {
  const agora = Date.UTC(2026, 7, 18, 12, 0, 0); // 18/08/2026 12:00 UTC
  const recente = { published: "2026-08-16T12:00:00Z" };
  const velho = { published: "2026-08-10T12:00:00Z" };
  const semData = { published: "" };
  assert.equal(isRecent(recente, 3, agora), true);
  assert.equal(isRecent(velho, 3, agora), false);
  assert.equal(isRecent(semData, 3, agora), true);
});
