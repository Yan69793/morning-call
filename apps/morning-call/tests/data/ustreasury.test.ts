import { describe, expect, it } from "vitest";
import { parseTreasuryXml } from "../../src/data/ustreasury.js";

/**
 * O feed do Treasury é ASCENDENTE: o primeiro bloco é 2 de janeiro, o último é o pregão mais
 * recente. Verificado contra o feed real em 2026-07-15 (133 blocos, primeiro 2026-01-02, último
 * 2026-07-14). Um parser que pegue a primeira ocorrência publica o rendimento de janeiro como se
 * fosse o de hoje — 71 bps de erro no 2Y, com status OK e tier 1.
 */
const XML_ASCENDENTE = `<?xml version="1.0" encoding="utf-8" standalone="yes" ?>
<feed xml:base="https://home.treasury.gov/" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <content type="application/xml">
      <m:properties>
        <d:NEW_DATE m:type="Edm.DateTime">2026-01-02T00:00:00</d:NEW_DATE>
        <d:BC_2YEAR m:type="Edm.Double">3.47</d:BC_2YEAR>
        <d:BC_10YEAR m:type="Edm.Double">4.20</d:BC_10YEAR>
        <d:BC_30YEAR m:type="Edm.Double">4.55</d:BC_30YEAR>
      </m:properties>
    </content>
  </entry>
  <entry>
    <content type="application/xml">
      <m:properties>
        <d:NEW_DATE m:type="Edm.DateTime">2026-07-10T00:00:00</d:NEW_DATE>
        <d:BC_2YEAR m:type="Edm.Double">4.11</d:BC_2YEAR>
        <d:BC_10YEAR m:type="Edm.Double">4.41</d:BC_10YEAR>
        <d:BC_30YEAR m:type="Edm.Double">4.96</d:BC_30YEAR>
      </m:properties>
    </content>
  </entry>
  <entry>
    <content type="application/xml">
      <m:properties>
        <d:NEW_DATE m:type="Edm.DateTime">2026-07-14T00:00:00</d:NEW_DATE>
        <d:BC_2YEAR m:type="Edm.Double">4.18</d:BC_2YEAR>
        <d:BC_10YEAR m:type="Edm.Double">4.45</d:BC_10YEAR>
        <d:BC_30YEAR m:type="Edm.Double">5.01</d:BC_30YEAR>
      </m:properties>
    </content>
  </entry>
</feed>`;

describe("US Treasury parse (fixture mock — feed ascendente, como o real)", () => {
  it("escolhe o bloco MAIS RECENTE, não o primeiro do feed", () => {
    const p = parseTreasuryXml(XML_ASCENDENTE);
    expect(p).not.toBeNull();
    expect(p!.date).toBe("2026-07-14");
    expect(p!.y2).toBeCloseTo(4.18, 6);
    expect(p!.y10).toBeCloseTo(4.45, 6);
    expect(p!.y30).toBeCloseTo(5.01, 6);
  });

  it("não escolhe por posição: ordem invertida no feed dá o mesmo resultado", () => {
    const blocos = XML_ASCENDENTE.match(/<entry>[\s\S]*?<\/entry>/g)!;
    const invertido = `<feed>${blocos.reverse().join("\n")}</feed>`;
    const p = parseTreasuryXml(invertido);
    expect(p!.date).toBe("2026-07-14");
    expect(p!.y2).toBeCloseTo(4.18, 6);
  });

  /**
   * Look-ahead bias (CLAUDE.md §3): rodando o pregão de 10/07 não se pode enxergar o dado de
   * 14/07. Sem isto, um replay histórico leria o futuro e o placar do Portão 1 mentiria a favor.
   */
  it("maxDate barra dado posterior ao pregão de referência", () => {
    const p = parseTreasuryXml(XML_ASCENDENTE, "2026-07-10");
    expect(p!.date).toBe("2026-07-10");
    expect(p!.y2).toBeCloseTo(4.11, 6);
  });

  it("maxDate anterior a todo o feed → null (vira ND, nunca chute)", () => {
    expect(parseTreasuryXml(XML_ASCENDENTE, "2025-12-31")).toBeNull();
  });

  it("bloco sem os campos obrigatórios é ignorado, não derruba o parse", () => {
    const comLixo = XML_ASCENDENTE.replace(
      '<d:BC_2YEAR m:type="Edm.Double">4.18</d:BC_2YEAR>',
      '<d:BC_2YEAR m:type="Edm.Double"></d:BC_2YEAR>',
    );
    const p = parseTreasuryXml(comLixo);
    // 14/07 está incompleto → cai para o 10/07, que está íntegro.
    expect(p!.date).toBe("2026-07-10");
    expect(p!.y2).toBeCloseTo(4.11, 6);
  });

  it("XML vazio ou sem blocos → null", () => {
    expect(parseTreasuryXml("")).toBeNull();
    expect(parseTreasuryXml("<feed></feed>")).toBeNull();
  });
});
