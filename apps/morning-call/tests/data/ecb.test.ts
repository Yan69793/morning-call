import { describe, expect, it } from "vitest";
import { fetchEcbRate, parseEcbDailyXml } from "../../src/data/ecb.js";

// Estrutura real do feed, verificada em 2026-08-17 via fetch direto ao endpoint do ECB.
const REAL_SHAPE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time='2026-08-14'>
      <Cube currency='USD' rate='1.1567'/>
      <Cube currency='JPY' rate='168.32'/>
      <Cube currency='BRL' rate='6.1234'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

function fetchFnWith(body: string, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(body, { status }));
}

describe("parseEcbDailyXml", () => {
  it("extrai data e taxas do feed real", () => {
    const parsed = parseEcbDailyXml(REAL_SHAPE_XML);
    expect(parsed?.date).toBe("2026-08-14");
    expect(parsed?.rates.USD).toBeCloseTo(1.1567, 6);
    expect(parsed?.rates.BRL).toBeCloseTo(6.1234, 6);
  });

  it("XML sem Cube time vira null", () => {
    expect(parseEcbDailyXml("<gesmes:Envelope></gesmes:Envelope>")).toBeNull();
  });

  it("aspas duplas também funcionam", () => {
    const xml = `<Cube time="2026-08-14"><Cube currency="USD" rate="1.10"/></Cube>`;
    const parsed = parseEcbDailyXml(xml);
    expect(parsed?.rates.USD).toBeCloseTo(1.1, 6);
  });
});

describe("fetchEcbRate", () => {
  it("USD resolve com data e url reproduzível", async () => {
    const r = await fetchEcbRate("USD", fetchFnWith(REAL_SHAPE_XML));
    expect(r.status).toBe("OK");
    if (r.status === "OK") {
      expect(r.rate).toBeCloseTo(1.1567, 6);
      expect(r.date).toBe("2026-08-14");
      expect(r.url).toContain("eurofxref-daily.xml");
    }
  });

  it("moeda ausente do feed vira ND nomeando a moeda", async () => {
    const r = await fetchEcbRate("XYZ", fetchFnWith(REAL_SHAPE_XML));
    expect(r.status).toBe("ND");
    if (r.status === "ND") expect(r.reason).toContain("XYZ");
  });

  it("HTTP erro vira ND", async () => {
    const r = await fetchEcbRate("USD", fetchFnWith("", 503));
    expect(r.status).toBe("ND");
    if (r.status === "ND") expect(r.reason).toContain("503");
  });

  it("falha de rede vira ND, nunca lança", async () => {
    const fetchFn = (() => Promise.reject(new Error("timeout"))) as unknown as typeof fetch;
    const r = await fetchEcbRate("USD", fetchFn);
    expect(r.status).toBe("ND");
    if (r.status === "ND") expect(r.reason).toContain("timeout");
  });
});
