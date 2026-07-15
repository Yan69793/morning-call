// Motor de regras determinístico para sinais. Puro, sem I/O.

// `Regime` era redeclarado aqui, idêntico ao de types.ts. Duas definições da mesma união quebram
// o `export *` do índice do pacote e permitem que uma evolua sem a outra. Uma fonte só.
import type { Regime } from "./types";

export type { Regime };
export type Direction = "LONG" | "SHORT" | "NEUTRO";

export interface SetupResult {
  valid: boolean;
  direction: Direction;
  reasons: string[]; // condições satisfeitas
  failed: string[]; // condições não satisfeitas
}

export interface SwingInput {
  score: number;
  regime: Regime;
  ret_20d: number;
  rangePos_60d: number;
  upDays_5: number;
  ibovScore: number;
  // O enum Regime não tem estado 'RISCO'; o chamador calcula risk-off a partir
  // do nível do VIX (ex.: vixLast >= 25) e passa o booleano já resolvido.
  vixRiscoOff: boolean;
  symbolError: boolean;
}

function vixRisco(input: { vixRiscoOff: boolean }): boolean {
  return input.vixRiscoOff;
}

export function evaluateSwingSetup(input: SwingInput): SetupResult {
  const reasons: string[] = [];
  const failed: string[] = [];

  // Gates duros
  if (input.symbolError) {
    return { valid: false, direction: "NEUTRO", reasons: [], failed: ["symbolError"] };
  }
  if (vixRisco(input)) {
    return { valid: false, direction: "NEUTRO", reasons: [], failed: ["vix RISCO"] };
  }

  // Banda neutra
  if (input.score > -15 && input.score < 15) {
    return { valid: false, direction: "NEUTRO", reasons: [], failed: ["score em banda lateral"] };
  }

  const direction: Direction = input.score >= 15 ? "LONG" : "SHORT";

  const check = (cond: boolean, label: string) => {
    if (cond) reasons.push(label);
    else failed.push(label);
  };

  if (direction === "LONG") {
    check(input.score >= 40, "score>=40");
    check(input.regime === "ALTA", "regime ALTA");
    check(input.ret_20d > 2, "ret_20d>2");
    check(input.rangePos_60d > 60, "rangePos_60d>60");
    check(input.upDays_5 >= 3, "upDays_5>=3");
    check(input.ibovScore >= 0, "ibovScore>=0");
  } else {
    check(input.score <= -40, "score<=-40");
    check(input.regime === "BAIXA", "regime BAIXA");
    check(input.ret_20d < -2, "ret_20d<-2");
    check(input.rangePos_60d < 40, "rangePos_60d<40");
    check(input.upDays_5 <= 2, "upDays_5<=2");
    check(input.ibovScore <= 0, "ibovScore<=0");
  }

  // Válido quando o núcleo (score + regime) passa e ao menos 4 das 6 condições
  const scoreCore = reasons.includes("score>=40") || reasons.includes("score<=-40");
  const regimeCore = reasons.includes("regime ALTA") || reasons.includes("regime BAIXA");
  const valid = scoreCore && regimeCore && reasons.length >= 4;
  return { valid, direction, reasons, failed };
}
