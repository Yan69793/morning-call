import { describe, expect, it } from "vitest";
import {
  checkSession,
  isB3TradingDay,
  isWeekend,
  todayTradeDateBrt,
} from "../../src/data/calendar.js";

describe("calendar", () => {
  it("fim de semana não é pregão", () => {
    expect(isWeekend("2026-07-18")).toBe(true); // sábado
    expect(isB3TradingDay("2026-07-18")).toBe(false);
    expect(checkSession("2026-07-18").shouldRunMorningCall).toBe(false);
  });

  it("feriado B3 Natal", () => {
    expect(isB3TradingDay("2026-12-25")).toBe(false);
  });

  it("dia útil comum", () => {
    expect(isB3TradingDay("2026-07-15")).toBe(true); // quarta
    expect(checkSession("2026-07-15").shouldRunMorningCall).toBe(true);
  });

  it("todayTradeDateBrt formato", () => {
    expect(todayTradeDateBrt(new Date("2026-07-15T12:00:00.000Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
