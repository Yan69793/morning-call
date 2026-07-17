/**
 * Endpoint de convergência macro + técnico.
 * GET /api/convergence/latest — cruza o último scan técnico com o resumo macro do Morning Call.
 */
import { Hono } from "hono";
import { getLatestScan } from "../db/queries";
import { findDailyConvergences, type ConvergenceResult } from "@sz/analytics";
import type { MacroContext, MacroRegime, MacroBias } from "@sz/analytics";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
};

export const convergenceRoutes = new Hono<{ Bindings: Bindings }>();

interface MacroSummary {
  tradeDate: string;
  generatedAt: string;
  regime: MacroRegime;
  vies: MacroBias;
  conviccao: number;
  tensaoMacroDominante: string;
}

export interface ConvergenceResponse {
  marketDate: string;
  macro: MacroSummary | null;
  convergences: ConvergenceResult[];
  generatedAt: string;
}

convergenceRoutes.get("/latest", async (c) => {
  // Carrega o scan mais recente e o resumo macro em paralelo
  const [scanRow, macroRaw] = await Promise.all([
    getLatestScan(c.env.DB),
    c.env.KV.get("macro:latest", "text"),
  ]);

  if (!scanRow) {
    return c.json(
      {
        marketDate: null,
        macro: null,
        convergences: [],
        generatedAt: new Date().toISOString(),
      },
      200,
    );
  }

  const scan = JSON.parse(scanRow.payload);
  const marketDate: string = scan.marketDate;
  const generatedAt: string = new Date().toISOString();

  let macro: MacroSummary | null = null;
  if (macroRaw) {
    try {
      macro = JSON.parse(macroRaw) as MacroSummary;
    } catch {
      // payload corrompido: degrada, não crasha
      macro = null;
    }
  }

  let convergences: ConvergenceResult[] = [];
  if (macro) {
    const ctx: MacroContext = {
      regime: macro.regime,
      vies: macro.vies,
      conviccao: macro.conviccao,
    };
    convergences = findDailyConvergences(ctx, scan.items ?? []);
  }

  return c.json({ marketDate, macro, convergences, generatedAt } satisfies ConvergenceResponse);
});
