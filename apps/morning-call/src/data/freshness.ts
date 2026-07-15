/**
 * Gate de frescor: `as_of` velho demais, ou posterior ao pregão, vira ND.
 *
 * Por que existe: cross-check, gates e validate conferem COERÊNCIA INTERNA — que o LLM citou
 * fielmente o snapshot, que as unidades batem, que a invalidação está do lado certo. Nenhum
 * deles olha ATUALIDADE. Sem este gate, um dado de seis meses atrás atravessa a pipeline inteira
 * sem um arranhão e o cross-check acaba certificando o erro.
 *
 * Não é hipótese: o parser do Treasury publicava o rendimento de 2 de janeiro com `status: OK` e
 * `tier: 1`, e nada acusava. O parser foi corrigido; este gate é a rede que pega a próxima fonte
 * que envelhecer sem avisar — feed congelado, série descontinuada, API devolvendo cache velho.
 */
import { ND_MARKER, type DataPoint } from "../schemas/data.js";
import { SNAPSHOT_KEYS } from "./keys.js";

/**
 * Idade máxima aceitável do `as_of`, em dias de calendário, contra o `trade_date`.
 *
 * Calibrado pela periodicidade real de cada série, verificada na API em 2026-07-15:
 * - Diárias (PTAX, Selic/CDI, UST, VIX, DXY, Brent, WTI): 5 dias cobre fim de semana + feriado
 *   emendado sem aceitar dado de semana retrasada.
 * - Focus: coleta semanal publicada na segunda; 10 dias cobre um feriado na segunda.
 * - IPCA 12m (SGS 13522): mensal, referenciado ao 1º do mês. Em 15/07 o dado legítimo é 01/06,
 *   44 dias. 70 dias dá folga para o IBGE atrasar sem aceitar um trimestre inteiro de defasagem.
 * - SELIC_META: o SGS publica todo dia, mesmo sem Copom — envelhece como série diária.
 */
export const MAX_AGE_DAYS: Record<string, number> = {
  [SNAPSHOT_KEYS.USDBRL]: 5,
  [SNAPSHOT_KEYS.SELIC_META]: 5,
  [SNAPSHOT_KEYS.SELIC_DIARIA]: 5,
  [SNAPSHOT_KEYS.CDI_DIARIA]: 5,
  [SNAPSHOT_KEYS.IPCA_12M]: 70,
  [SNAPSHOT_KEYS.FOCUS_IPCA_ANO]: 10,
  [SNAPSHOT_KEYS.FOCUS_SELIC_ANO]: 10,
  [SNAPSHOT_KEYS.FOCUS_CAMBIO_ANO]: 10,
  [SNAPSHOT_KEYS.UST_2Y]: 5,
  [SNAPSHOT_KEYS.UST_10Y]: 5,
  [SNAPSHOT_KEYS.UST_30Y]: 5,
  [SNAPSHOT_KEYS.VIX]: 5,
  [SNAPSHOT_KEYS.DXY_PROXY]: 5,
  [SNAPSHOT_KEYS.BRENT]: 5,
  [SNAPSHOT_KEYS.WTI]: 5,
};

/** Conservador de propósito: chave nova sem tolerância declarada é tratada como diária. */
const DEFAULT_MAX_AGE_DAYS = 5;

const MS_POR_DIA = 86_400_000;

/** Dias de calendário entre o dia do `as_of` e o pregão. Negativo = `as_of` no futuro. */
export function ageInDays(asOf: string, tradeDate: string): number {
  const dia = (iso: string): number =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((dia(tradeDate) - dia(asOf)) / MS_POR_DIA);
}

/**
 * Converte em ND todo ponto OK cujo `as_of` esteja velho demais ou no futuro.
 * Pontos ND passam intactos: já carregam o próprio motivo.
 */
export function enforceFreshness(points: DataPoint[], tradeDate: string): DataPoint[] {
  return points.map((p) => {
    if (p.status !== "OK") return p;
    const idade = ageInDays(p.as_of, tradeDate);
    const limite = MAX_AGE_DAYS[p.key] ?? DEFAULT_MAX_AGE_DAYS;
    const dia = p.as_of.slice(0, 10);

    if (idade < 0) {
      return {
        status: "ND" as const,
        key: p.key,
        venue: p.venue,
        reason: `${ND_MARKER}: as_of ${dia} é posterior ao pregão ${tradeDate} (${-idade}d à frente)`,
        observed_at: p.observed_at,
      };
    }
    if (idade > limite) {
      return {
        status: "ND" as const,
        key: p.key,
        venue: p.venue,
        reason: `${ND_MARKER}: as_of ${dia} tem ${idade}d contra o pregão ${tradeDate}, acima do limite de ${limite}d`,
        observed_at: p.observed_at,
      };
    }
    return p;
  });
}
