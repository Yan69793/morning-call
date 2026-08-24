/**
 * ECB — taxas de referência diárias EUR/moeda, feed XML oficial (sem chave).
 * https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 *
 * Devolve o par bruto (rate = quantas unidades de `currency` por 1 EUR), não um DataPoint.
 * Motivo: `schemas/common.ts` Unit é enum fechado de propósito e hoje não tem nenhum par EUR
 * (só "BRL_por_USD"). Forçar esse valor num DataPoint aqui seria ou inventar um Unit novo sem
 * decisão do mantenedor, ou gravar unidade errada — as duas coisas que o enum fechado existe pra
 * impedir. Quem consumir isto decide a unidade depois que o enum tiver o par certo.
 */

const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export interface EcbRates {
  /** Data de referência do feed, YYYY-MM-DD. */
  date: string;
  /** Moeda ISO-4217 (ex.: "USD") -> quantas unidades dela valem 1 EUR. */
  rates: Record<string, number>;
}

/**
 * Parser tolerante: um `<Cube time='...'>` só, com `<Cube currency='XXX' rate='...'/>` filhos.
 * Aspas simples no feed real (verificado em 2026-08-17), mas aceita duplas também.
 */
export function parseEcbDailyXml(xml: string): EcbRates | null {
  const timeMatch = xml.match(/<Cube\s+time=['"]([\d-]+)['"]/i);
  if (!timeMatch?.[1]) return null;

  const rates: Record<string, number> = {};
  const rateRe = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = rateRe.exec(xml)) !== null) {
    const ccy = m[1];
    const value = Number(m[2]);
    if (ccy && Number.isFinite(value)) rates[ccy] = value;
  }
  return Object.keys(rates).length > 0 ? { date: timeMatch[1], rates } : null;
}

export type EcbRateResult =
  | { status: "OK"; date: string; rate: number; url: string }
  | { status: "ND"; reason: string };

/** Busca a taxa EUR/`currency` mais recente publicada. Nunca lança, sempre EcbRateResult. */
export async function fetchEcbRate(
  currency: string,
  fetchFn: typeof fetch = fetch,
): Promise<EcbRateResult> {
  try {
    const res = await fetchFn(ECB_DAILY_URL);
    if (!res.ok) return { status: "ND", reason: `ECB XML HTTP ${res.status}` };
    const xml = await res.text();
    const parsed = parseEcbDailyXml(xml);
    if (!parsed) return { status: "ND", reason: "ECB XML: parse falhou" };
    const rate = parsed.rates[currency];
    if (rate === undefined) {
      return { status: "ND", reason: `ECB XML: moeda "${currency}" ausente do feed` };
    }
    return { status: "OK", date: parsed.date, rate, url: ECB_DAILY_URL };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "ND", reason: msg };
  }
}
