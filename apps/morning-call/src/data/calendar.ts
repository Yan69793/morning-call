/**
 * Calendário de pregão B3 + NYSE (mínimo Portão 1).
 * Feriados fixos + regras simples. Expandir com tabela anual se drift aparecer.
 */

/** Feriados B3 recorrentes por MM-DD (sem carnaval móvel — carnaval em tabela anual). */
const B3_FIXED = new Set([
  "01-01", // Confraternização
  "04-21", // Tiradentes
  "05-01", // Trabalho
  "09-07", // Independência
  "10-12", // N. Sra. Aparecida
  "11-02", // Finados
  "11-15", // República
  "11-20", // Consciência Negra (federal/SP — B3 observa)
  "12-25", // Natal
]);

/** Carnaval / Corpus / outros móveis conhecidos (YYYY-MM-DD). Ampliar ano a ano. */
const B3_MOBILE = new Set([
  "2026-02-16", // Carnaval
  "2026-02-17", // Carnaval
  "2026-04-03", // Paixão
  "2026-06-04", // Corpus Christi
  "2027-02-08",
  "2027-02-09",
  "2027-03-26",
  "2027-05-27",
]);

const NYSE_FIXED = new Set([
  "01-01",
  "06-19", // Juneteenth
  "07-04",
  "12-25",
]);

/** Thanksgiving etc. — datas absolutas conhecidas. */
const NYSE_MOBILE = new Set([
  "2026-01-19", // MLK
  "2026-02-16", // Presidents
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial
  "2026-09-07", // Labor
  "2026-11-26", // Thanksgiving
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-09-06",
  "2027-11-25",
]);

function weekdayUtc(isoDate: string): number {
  // YYYY-MM-DD as UTC noon to avoid TZ edge
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay(); // 0=Sun
}

function mmdd(isoDate: string): string {
  return isoDate.slice(5, 10);
}

export function isWeekend(isoDate: string): boolean {
  const d = weekdayUtc(isoDate);
  return d === 0 || d === 6;
}

export function isB3Holiday(isoDate: string): boolean {
  return B3_FIXED.has(mmdd(isoDate)) || B3_MOBILE.has(isoDate);
}

export function isNyseHoliday(isoDate: string): boolean {
  return NYSE_FIXED.has(mmdd(isoDate)) || NYSE_MOBILE.has(isoDate);
}

export function isB3TradingDay(isoDate: string): boolean {
  return !isWeekend(isoDate) && !isB3Holiday(isoDate);
}

export function isNyseTradingDay(isoDate: string): boolean {
  return !isWeekend(isoDate) && !isNyseHoliday(isoDate);
}

export interface SessionCheck {
  tradeDate: string;
  b3Open: boolean;
  nyseOpen: boolean;
  /** Abort do run matinal se B3 fechada. */
  shouldRunMorningCall: boolean;
  reason?: string;
}

export function checkSession(tradeDate: string): SessionCheck {
  const b3Open = isB3TradingDay(tradeDate);
  const nyseOpen = isNyseTradingDay(tradeDate);
  if (!b3Open) {
    return {
      tradeDate,
      b3Open,
      nyseOpen,
      shouldRunMorningCall: false,
      reason: isWeekend(tradeDate) ? "fim de semana" : "feriado B3",
    };
  }
  return { tradeDate, b3Open, nyseOpen, shouldRunMorningCall: true };
}

/** Data de pregão BR "hoje" em BRT (UTC-3 fixo). */
export function todayTradeDateBrt(now: Date = new Date()): string {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
