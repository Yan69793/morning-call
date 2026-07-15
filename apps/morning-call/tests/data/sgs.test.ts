import { describe, expect, it } from "vitest";
import { observationsToPoint, parseSgsDateToIso, parseSgsJson } from "../../src/data/bcb/sgs.js";
import { SNAPSHOT_KEYS } from "../../src/data/keys.js";

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
      "2026-07-15T09:30:00.000Z",
    );
    expect(p.status).toBe("OK");
    if (p.status === "OK") {
      expect(p.quantity.value).toBeCloseTo(5.0742, 6);
      expect(p.source.tier).toBe(1);
    }
  });

  it("série vazia → ND", () => {
    const p = observationsToPoint(
      SNAPSHOT_KEYS.SELIC_META,
      "pct",
      432,
      [],
      "2026-07-15T09:30:00.000Z",
    );
    expect(p.status).toBe("ND");
  });
});
