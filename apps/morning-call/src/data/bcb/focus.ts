/**
 * BCB Focus / Expectativas — Olinda OData.
 * Baseline de consenso do Portão 1.
 */
import type { DataPoint } from "../../schemas/data.js";
import { SNAPSHOT_KEYS } from "../keys.js";
import type { DataProvider, DataProviderContext } from "../types.js";
import { fetchWithTimeout } from "../http.js";

interface FocusRow {
  Indicador?: string;
  Data?: string;
  DataReferencia?: string;
  Media?: number;
  Mediana?: number;
  baseCalculo?: number;
}

/**
 * `baseCalculo: 0` = estatísticas dos últimos 30 dias. É a mediana que o relatório Focus publica.
 * O 1 (últimos 5 dias úteis) vem na mesma resposta, para a mesma Data e o mesmo ano: sem filtrar,
 * a escolha entre os dois vira sorteio pela ordem do array.
 */
const BASE_CALCULO_PUBLICADA = 0;

function nd(key: string, reason: string, observedAt: string): DataPoint {
  return { status: "ND", key, venue: "BR", reason, observed_at: observedAt };
}

/**
 * Mediana do indicador para o ano de referência pedido, na coleta mais recente.
 *
 * Filtra por `DataReferencia` e `baseCalculo` no cliente mesmo já filtrando no servidor: a query
 * anterior (`$top=50&$orderby=Data desc`, sem filtro) devolvia as 50 primeiras linhas em ordem
 * alfabética de indicador — IPCA e Selic nunca chegavam, viravam N/D permanente em silêncio — e
 * misturava anos de 2026 a 2030. Como todas as 50 linhas tinham a mesma `Data`, o sort empatava e
 * saía a mediana de 2030 (5,46) rotulada como consenso do ano corrente (5,20). Não era erro de
 * arredondamento: era a série errada alimentando o baseline do placar.
 */
export function pickMedian(
  rows: FocusRow[],
  indicador: string,
  ano: string,
): { value: number; asOf: string } | null {
  const elegiveis = rows.filter(
    (r) =>
      r.Indicador === indicador &&
      r.DataReferencia === ano &&
      r.baseCalculo === BASE_CALCULO_PUBLICADA &&
      typeof r.Mediana === "number" &&
      typeof r.Data === "string",
  );
  if (elegiveis.length === 0) return null;
  const maisRecente = elegiveis.reduce((a, r) => ((r.Data ?? "") > (a.Data ?? "") ? r : a));
  return {
    value: maisRecente.Mediana as number,
    asOf: `${(maisRecente.Data as string).slice(0, 10)}T18:00:00.000Z`,
  };
}

export function parseFocusPayload(raw: unknown): FocusRow[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { value?: unknown }).value)) {
    return (raw as { value: FocusRow[] }).value;
  }
  if (Array.isArray(raw)) return raw as FocusRow[];
  throw new Error("Focus: payload inesperado");
}

const INDICATORS: { indicador: string; key: string }[] = [
  { indicador: "IPCA", key: SNAPSHOT_KEYS.FOCUS_IPCA_ANO },
  { indicador: "Selic", key: SNAPSHOT_KEYS.FOCUS_SELIC_ANO },
  { indicador: "Câmbio", key: SNAPSHOT_KEYS.FOCUS_CAMBIO_ANO },
];

const FOCUS_ENDPOINT =
  "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais";

/**
 * Uma consulta por indicador, com o recorte fechado no servidor.
 *
 * Dois detalhes do Olinda que só aparecem batendo na API (verificado em 2026-07-15):
 *
 * - `DataReferencia` é Edm.String: filtrar com `eq 2026` sem aspas devolve HTTP 400, "The types
 *   'Edm.String' and 'Edm.Int16' are not compatible".
 * - A query NÃO pode ser montada com `URLSearchParams`: ele encoda espaço como `+`, e o OData lê
 *   o `+` como literal dentro do `$filter` — HTTP 400 nos três indicadores. Tem que ser `%20`,
 *   que é o que `encodeURIComponent` produz.
 */
export function focusUrl(indicador: string, ano: string): string {
  const filtro = [
    `Indicador eq '${indicador}'`,
    `DataReferencia eq '${ano}'`,
    `baseCalculo eq ${BASE_CALCULO_PUBLICADA}`,
  ].join(" and ");
  return (
    `${FOCUS_ENDPOINT}?$format=json&$top=1&$orderby=Data%20desc` +
    `&$filter=${encodeURIComponent(filtro)}`
  );
}

export const bcbFocusProvider: DataProvider = {
  name: "bcb-focus",
  async fetch(ctx: DataProviderContext): Promise<DataPoint[]> {
    const fetchFn = ctx.fetchFn ?? fetchWithTimeout;
    const ano = ctx.tradeDate.slice(0, 4);
    return Promise.all(
      INDICATORS.map(async ({ indicador, key }): Promise<DataPoint> => {
        const url = focusUrl(indicador, ano);
        try {
          const res = await fetchFn(url, { headers: { Accept: "application/json" } });
          if (!res.ok) return nd(key, `Focus HTTP ${res.status}`, ctx.observedAt);
          const rows = parseFocusPayload(await res.json());
          const picked = pickMedian(rows, indicador, ano);
          if (!picked) return nd(key, `Focus sem mediana para ${indicador} ${ano}`, ctx.observedAt);
          const unit = key === SNAPSHOT_KEYS.FOCUS_CAMBIO_ANO ? "BRL_por_USD" : "pct";
          return {
            status: "OK" as const,
            key,
            quantity: { value: picked.value, unit },
            venue: "BR" as const,
            source: {
              name: "BCB Focus",
              tier: 1 as const,
              url,
              retrieved_at: ctx.observedAt,
            },
            as_of: picked.asOf,
            observed_at: ctx.observedAt,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return nd(key, msg, ctx.observedAt);
        }
      }),
    );
  },
};
