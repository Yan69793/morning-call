import { describe, expect, it } from "vitest";
import { parseFocusPayload, pickMedian } from "../../src/data/bcb/focus.js";

/**
 * Fixture copiado da forma real do Olinda (verificado em 2026-07-15). Três armadilhas que o
 * conector original caía:
 *
 * 1. `DataReferencia` é STRING ('2026'), não int — filtrar com `eq 2026` devolve HTTP 400
 *    ("The types 'Edm.String' and 'Edm.Int16' are not compatible").
 * 2. O mesmo `Indicador` aparece para vários anos (2026..2030). Sem filtro de ano, a projeção de
 *    2030 entra rotulada como consenso do ano corrente.
 * 3. O mesmo (Indicador, Data, DataReferencia) aparece DUAS vezes, com `baseCalculo` 0 e 1.
 *    O relatório Focus publicado é o baseCalculo 0 (últimos 30 dias). Sem esse filtro, a escolha
 *    entre 5,1625 e 5,10 vira sorteio pela ordem do array.
 */
const PAYLOAD_REAL = {
  "@odata.context": "https://was-p.bcnet.bcb.gov.br/olinda/...",
  value: [
    // ruído: ano errado, mediana plausível — é o que vazava antes
    {
      Indicador: "Câmbio",
      Data: "2026-07-10",
      DataReferencia: "2030",
      Media: 5.4,
      Mediana: 5.46,
      baseCalculo: 0,
    },
    {
      Indicador: "IPCA",
      Data: "2026-07-10",
      DataReferencia: "2026",
      Media: 5.1418,
      Mediana: 5.1625,
      baseCalculo: 0,
    },
    // mesma Data e ano, baseCalculo 1: não é o número publicado
    {
      Indicador: "IPCA",
      Data: "2026-07-10",
      DataReferencia: "2026",
      Media: 5.0895,
      Mediana: 5.1,
      baseCalculo: 1,
    },
    // Data anterior: perde para 07-10
    {
      Indicador: "IPCA",
      Data: "2026-07-09",
      DataReferencia: "2026",
      Media: 5.2872,
      Mediana: 5.3,
      baseCalculo: 0,
    },
    {
      Indicador: "IPCA",
      Data: "2026-07-10",
      DataReferencia: "2030",
      Media: 4.0,
      Mediana: 4.0,
      baseCalculo: 0,
    },
    {
      Indicador: "Câmbio",
      Data: "2026-07-10",
      DataReferencia: "2026",
      Media: 5.19,
      Mediana: 5.2,
      baseCalculo: 0,
    },
    {
      Indicador: "Selic",
      Data: "2026-07-10",
      DataReferencia: "2026",
      Media: 14.9,
      Mediana: 15.0,
      baseCalculo: 0,
    },
  ],
};

describe("BCB Focus parse (fixture mock — forma real do Olinda)", () => {
  it("parseFocusPayload extrai o array `value`", () => {
    expect(parseFocusPayload(PAYLOAD_REAL)).toHaveLength(7);
  });

  it("pega o ano de referência pedido, não a projeção de 2030", () => {
    const rows = parseFocusPayload(PAYLOAD_REAL);
    const cambio = pickMedian(rows, "Câmbio", "2026");
    expect(cambio).not.toBeNull();
    // 5.46 é a mediana de 2030 — o valor que vazava para o snapshot como consenso do ano.
    expect(cambio!.value).toBeCloseTo(5.2, 6);
  });

  it("usa baseCalculo 0 (últimos 30 dias), que é o número publicado no Focus", () => {
    const rows = parseFocusPayload(PAYLOAD_REAL);
    const ipca = pickMedian(rows, "IPCA", "2026");
    expect(ipca!.value).toBeCloseTo(5.1625, 6);
  });

  it("entre datas do mesmo ano, escolhe a coleta mais recente", () => {
    const rows = parseFocusPayload(PAYLOAD_REAL);
    const ipca = pickMedian(rows, "IPCA", "2026");
    expect(ipca!.asOf).toBe("2026-07-10T18:00:00.000Z");
  });

  it("IPCA e Selic do ano são alcançáveis (eram N/D permanente por causa do $top=50)", () => {
    const rows = parseFocusPayload(PAYLOAD_REAL);
    expect(pickMedian(rows, "IPCA", "2026")).not.toBeNull();
    expect(pickMedian(rows, "Selic", "2026")!.value).toBeCloseTo(15.0, 6);
  });

  it("indicador ausente ou ano sem projeção → null (vira ND, nunca chute)", () => {
    const rows = parseFocusPayload(PAYLOAD_REAL);
    expect(pickMedian(rows, "PIB Total", "2026")).toBeNull();
    expect(pickMedian(rows, "Selic", "2029")).toBeNull();
  });

  it("payload inesperado explode em vez de devolver vazio silencioso", () => {
    expect(() => parseFocusPayload({ erro: "nao sou odata" })).toThrow();
  });
});
