import { describe, expect, it } from "vitest";
import { ageInDays, enforceFreshness, MAX_AGE_DAYS } from "../../src/data/freshness.js";
import { SNAPSHOT_KEYS } from "../../src/data/keys.js";
import type { DataPoint } from "../../src/schemas/data.js";

const OBSERVED = "2026-07-15T09:30:00.000Z";
const TRADE_DATE = "2026-07-15";

function ok(key: string, asOf: string): DataPoint {
  return {
    status: "OK",
    key,
    quantity: { value: 4.18, unit: "pct" },
    venue: "US",
    source: { name: "U.S. Treasury", tier: 1, url: "https://x", retrieved_at: OBSERVED },
    as_of: asOf,
    observed_at: OBSERVED,
  };
}

describe("ageInDays", () => {
  it("conta dias de calendário entre as_of e o pregão", () => {
    expect(ageInDays("2026-07-14T18:00:00.000Z", "2026-07-15")).toBe(1);
    expect(ageInDays("2026-07-15T18:00:00.000Z", "2026-07-15")).toBe(0);
    expect(ageInDays("2026-01-02T18:00:00.000Z", "2026-07-15")).toBe(194);
  });

  it("dado posterior ao pregão dá idade negativa", () => {
    expect(ageInDays("2026-08-05T18:00:00.000Z", "2026-07-15")).toBe(-21);
  });

  it("atravessa virada de mês e de ano sem erro de fuso", () => {
    expect(ageInDays("2025-12-31T18:00:00.000Z", "2026-01-02")).toBe(2);
    expect(ageInDays("2026-02-28T18:00:00.000Z", "2026-03-02")).toBe(2);
  });
});

describe("enforceFreshness", () => {
  /**
   * O caso que motiva o gate: o parser do Treasury publicava o rendimento de 2 de janeiro como se
   * fosse o de hoje. O bug do parser foi corrigido, mas nada no sistema comparava `as_of` com o
   * pregão — cross-check, gates e validate conferem coerência interna, nunca atualidade. Sem este
   * gate, o cross-check apenas certifica que o LLM citou fielmente um número velho.
   */
  it("dado velho além da tolerância vira ND, não é publicado como fresco", () => {
    const [p] = enforceFreshness(
      [ok(SNAPSHOT_KEYS.UST_2Y, "2026-01-02T18:00:00.000Z")],
      TRADE_DATE,
    );
    expect(p!.status).toBe("ND");
    if (p!.status === "ND") {
      expect(p!.reason).toContain("194");
      expect(p!.reason).toContain("N/D");
    }
  });

  it("dado do pregão anterior passa (fim de semana não derruba)", () => {
    const [p] = enforceFreshness(
      [ok(SNAPSHOT_KEYS.UST_2Y, "2026-07-14T18:00:00.000Z")],
      TRADE_DATE,
    );
    expect(p!.status).toBe("OK");
  });

  it("sexta → segunda passa: 3 dias está dentro da tolerância diária", () => {
    const [p] = enforceFreshness(
      [ok(SNAPSHOT_KEYS.USDBRL, "2026-07-10T18:00:00.000Z")],
      "2026-07-13",
    );
    expect(p!.status).toBe("OK");
  });

  /**
   * Look-ahead: a série 432 do SGS projeta a meta Selic até a próxima reunião do Copom, então a
   * ponta da série é FUTURA (05/08 quando o pregão é 15/07). O contrato em schemas/data.ts diz
   * "as_of < observed_at sempre" — um as_of futuro viola o schema e envenena qualquer decay.
   */
  it("dado posterior ao pregão vira ND (look-ahead)", () => {
    const [p] = enforceFreshness(
      [ok(SNAPSHOT_KEYS.SELIC_META, "2026-08-05T18:00:00.000Z")],
      TRADE_DATE,
    );
    expect(p!.status).toBe("ND");
    if (p!.status === "ND") expect(p!.reason).toContain("posterior ao pregão");
  });

  it("tolerância é por chave: IPCA mensal aceita idade que derrubaria um dado diário", () => {
    const asOf = "2026-06-01T18:00:00.000Z"; // 44 dias — é o que o SGS 13522 devolve de verdade
    const [ipca] = enforceFreshness(
      [{ ...ok(SNAPSHOT_KEYS.IPCA_12M, asOf), venue: "BR" as const }],
      TRADE_DATE,
    );
    expect(ipca!.status).toBe("OK");

    const [diario] = enforceFreshness(
      [{ ...ok(SNAPSHOT_KEYS.USDBRL, asOf), venue: "BR" as const }],
      TRADE_DATE,
    );
    expect(diario!.status).toBe("ND");
  });

  it("ND continua ND e preserva o motivo original", () => {
    const nd: DataPoint = {
      status: "ND",
      key: SNAPSHOT_KEYS.VIX,
      venue: "US",
      reason: "FRED sem key",
      observed_at: OBSERVED,
    };
    const [p] = enforceFreshness([nd], TRADE_DATE);
    expect(p).toEqual(nd);
  });

  it("toda chave do snapshot tem tolerância declarada — nenhuma cai em default silencioso", () => {
    for (const key of Object.values(SNAPSHOT_KEYS)) {
      expect(MAX_AGE_DAYS[key], `chave sem tolerância: ${key}`).toBeTypeOf("number");
    }
  });
});
