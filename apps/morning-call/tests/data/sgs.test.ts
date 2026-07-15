import { describe, expect, it } from "vitest";
import {
  observationsToPoint,
  parseSgsDateToIso,
  parseSgsJson,
  sgsPeriodUrl,
} from "../../src/data/bcb/sgs.js";
import { SGS_CODES, SNAPSHOT_KEYS } from "../../src/data/keys.js";

const OBSERVED = "2026-07-15T09:30:00.000Z";
const URL_FAKE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados?formato=json";

describe("BCB SGS parse (fixture mock)", () => {
  it("parseSgsJson e data ISO", () => {
    const rows = parseSgsJson([{ data: "14/07/2026", valor: "5.0742" }]);
    expect(rows[0]!.valor).toBe("5.0742");
    expect(parseSgsDateToIso("14/07/2026")).toBe("2026-07-14T18:00:00.000Z");
  });

  it("observationsToPoint monta DataPoint OK", () => {
    const p = observationsToPoint(
      SNAPSHOT_KEYS.USDBRL,
      "BRL_por_USD",
      1,
      [{ data: "14/07/2026", valor: "5.0742" }],
      OBSERVED,
      URL_FAKE,
    );
    expect(p.status).toBe("OK");
    if (p.status === "OK") {
      expect(p.quantity.value).toBeCloseTo(5.0742, 6);
      expect(p.source.tier).toBe(1);
      // A url gravada é a consulta que produziu o valor — colar no navegador reproduz o número.
      expect(p.source.url).toBe(URL_FAKE);
    }
  });

  it("série vazia → ND", () => {
    const p = observationsToPoint(SNAPSHOT_KEYS.SELIC_META, "pct", 432, [], OBSERVED, URL_FAKE);
    expect(p.status).toBe("ND");
  });
});

describe("BCB SGS — look-ahead da série 432 (meta Selic projeta até a próxima Copom)", () => {
  /**
   * Verificado na API em 2026-07-15: `ultimos/1` da série 432 devolve 05/08/2026, porque o SGS
   * projeta a meta vigente até a próxima reunião. Pegar a ponta da série publicava um as_of 21
   * dias no futuro.
   */
  it("ignora observação posterior ao pregão e usa a vigente", () => {
    const p = observationsToPoint(
      SNAPSHOT_KEYS.SELIC_META,
      "pct",
      SGS_CODES.SELIC_META,
      [
        { data: "14/07/2026", valor: "14.25" },
        { data: "15/07/2026", valor: "14.25" },
        { data: "05/08/2026", valor: "14.25" }, // futuro: a ponta que o SGS projeta
      ],
      OBSERVED,
      URL_FAKE,
      "2026-07-15",
    );
    expect(p.status).toBe("OK");
    if (p.status === "OK") expect(p.as_of).toBe("2026-07-15T18:00:00.000Z");
  });

  it("série inteiramente no futuro → ND, nunca as_of adiantado", () => {
    const p = observationsToPoint(
      SNAPSHOT_KEYS.SELIC_META,
      "pct",
      SGS_CODES.SELIC_META,
      [{ data: "05/08/2026", valor: "14.25" }],
      OBSERVED,
      URL_FAKE,
      "2026-07-15",
    );
    expect(p.status).toBe("ND");
    if (p.status === "ND") expect(p.reason).toContain("posterior ao pregão");
  });

  it("sgsPeriodUrl fixa dataFinal no pregão (look-ahead impossível por construção)", () => {
    const url = sgsPeriodUrl(SGS_CODES.SELIC_META, "2026-07-15", 15);
    expect(url).toContain("dataFinal=15/07/2026");
    expect(url).toContain("dataInicial=30/06/2026");
    expect(url).not.toContain("ultimos");
  });

  it("janela longa do IPCA atravessa a virada de ano sem quebrar a data", () => {
    const url = sgsPeriodUrl(SGS_CODES.IPCA_12M, "2026-02-10", 200);
    expect(url).toContain("dataFinal=10/02/2026");
    expect(url).toContain("dataInicial=25/07/2025");
  });
});
