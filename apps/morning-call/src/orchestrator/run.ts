/**
 * Orquestração em steps (AD-5). Funções puras/testáveis; Worker só chama.
 * Workflows CF pode envolver cada step.do() sem mudar a lógica.
 */
import type { Env } from "../env.js";
import { checkSession, todayTradeDateBrt } from "../data/calendar.js";
import { buildMarketSnapshot, listNdKeys } from "../data/snapshot.js";
import {
  ensureRun,
  finishRun,
  saveQuantMetrics,
  saveReportPointer,
  saveSnapshot,
  saveTrade,
} from "../db/runs.js";
import { runStrategist } from "../agents/strategist.js";
import { filterPublishableTrades, runGates } from "../committee/gates.js";
import { buildMorningCall } from "../report/build.js";
import { validateMorningCall } from "../report/validate.js";
import { extractDayBaselines } from "../quant/baselines.js";
import { buildMacroSummary } from "../report/sumario.js";
import type { QuantMetrics } from "../schemas/quant.js";
import type { MarketSnapshot } from "../schemas/data.js";
import type { MorningCall } from "../schemas/report.js";
import type { ValidationReport } from "../schemas/report.js";

export interface RunResult {
  aborted: boolean;
  reason?: string;
  runId?: string;
  snapshot?: MarketSnapshot;
  morningCall?: MorningCall;
  validation?: ValidationReport;
  publishedCount?: number;
  rejectedCount?: number;
  baselines?: ReturnType<typeof extractDayBaselines>;
}

export interface RunOptions {
  env: Env;
  tradeDate?: string;
  now?: Date;
  /** testes offline */
  mockStrategistContent?: string;
  fetchFn?: typeof fetch;
  /** se true, não grava D1 (unit test sem binding) */
  dryRun?: boolean;
  providers?: Parameters<typeof buildMarketSnapshot>[0]["providers"];
}

export async function runMorningCall(opts: RunOptions): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const tradeDate = opts.tradeDate ?? todayTradeDateBrt(now);
  const session = checkSession(tradeDate);
  if (!session.shouldRunMorningCall) {
    return { aborted: true, reason: session.reason ?? "sem pregão B3" };
  }

  const observedAt = now.toISOString();
  let runId: string;

  if (opts.dryRun) {
    runId = crypto.randomUUID();
  } else {
    const ensured = await ensureRun(opts.env.DB, tradeDate, observedAt);
    runId = ensured.runId;
  }

  // [1] snapshot
  const snapshot = await buildMarketSnapshot({
    runId,
    tradeDate,
    observedAt,
    secrets: { fredApiKey: opts.env.FRED_API_KEY },
    fetchFn: opts.fetchFn,
    providers: opts.providers,
  });
  const faltantes = listNdKeys(snapshot);

  if (!opts.dryRun) {
    await saveSnapshot(opts.env.DB, snapshot);
  }

  // [2] quant metrics mínimo (vazio de séries longas no P1 se só levels)
  const metrics: QuantMetrics = {
    run_id: runId,
    trade_date: tradeDate,
    ativos: [],
    curvas: [],
    correlacoes_63d: [],
    inflacao_implicita: [],
    faltantes,
  };
  if (!opts.dryRun) {
    await saveQuantMetrics(opts.env.DB, metrics);
  }

  // [3] strategist
  const model = opts.env.STRATEGIST_MODEL ?? "anthropic/claude-sonnet-4";
  if (!opts.mockStrategistContent && !opts.env.OPENROUTER_API_KEY) {
    if (!opts.dryRun) {
      await finishRun(opts.env.DB, runId, "partial", faltantes, new Date().toISOString());
    }
    return {
      aborted: false,
      runId,
      snapshot,
      reason: "OPENROUTER_API_KEY ausente — snapshot gravado, sem LLM",
      baselines: extractDayBaselines(snapshot),
    };
  }

  const strat = await runStrategist({
    snapshot,
    apiKey: opts.env.OPENROUTER_API_KEY ?? "mock",
    model,
    runId,
    fetchFn: opts.fetchFn,
    mockContent: opts.mockStrategistContent,
  });

  // [4] gates
  const gates = runGates({
    snapshot,
    claims: strat.claims,
    trades: strat.trades,
    correlacoes: metrics.correlacoes_63d,
  });
  const { published, rejected } = filterPublishableTrades(
    strat.trades,
    gates.crossCheck.ok,
    metrics.correlacoes_63d,
  );

  // [5] persist
  if (!opts.dryRun) {
    for (const t of published) {
      await saveTrade(opts.env.DB, {
        trade: t,
        publicado: true,
        motivo_rejeicao: null,
        redteam_veredito: null,
      });
    }
    for (const r of rejected) {
      await saveTrade(opts.env.DB, {
        trade: r.trade,
        publicado: false,
        motivo_rejeicao: r.motivo,
        redteam_veredito: "rejeitar",
      });
    }
  }

  // [6] report
  const generatedAt = new Date().toISOString();
  const morningCall = buildMorningCall({
    runId,
    tradeDate,
    generatedAt,
    raw: strat.raw,
    trades: published,
    provenance: strat.provenance,
  });
  const validation = validateMorningCall(morningCall, {
    crossCheck: gates.crossCheck,
    correlacionados: gates.correlacionados,
  });

  if (!opts.dryRun) {
    const r2Key = `morning-call/${tradeDate}/${runId}.json`;
    if (opts.env.REPORTS) {
      await opts.env.REPORTS.put(r2Key, JSON.stringify(morningCall));
    }
    await saveReportPointer(opts.env.DB, {
      runId,
      generatedAt,
      r2Key,
      regime: morningCall.abertura.regime,
      vies: morningCall.abertura.vies,
      conviccao: morningCall.abertura.conviccao,
      nTrades: published.length,
      aprovado: validation.aprovado && gates.ok,
      payload: { morningCall, validation, gateReasons: gates.reasons },
    });
    const status = faltantes.length > 0 || !validation.aprovado || !gates.ok ? "partial" : "ok";
    await finishRun(opts.env.DB, runId, status, faltantes, generatedAt);
  }

  // [7] push resumo macro para o Radar Quant (não-bloqueante: falha não afeta o pipeline)
  if (!opts.dryRun && morningCall && opts.env.RADAR_QUANT_INGEST_URL) {
    const ingestUrl = `${opts.env.RADAR_QUANT_INGEST_URL.replace(/\/+$/, "")}/api/ingest/macro-summary`;
    try {
      const summary = buildMacroSummary(morningCall);
      const resp = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ingest-secret": opts.env.RADAR_QUANT_INGEST_SECRET ?? "",
        },
        body: JSON.stringify(summary),
      });
      if (!resp.ok) {
        console.log(
          JSON.stringify({
            event: "macro_summary_push_failed",
            status: resp.status,
            runId,
          }),
        );
      }
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "macro_summary_push_error",
          error: err instanceof Error ? err.message : "desconhecido",
          runId,
        }),
      );
    }
  }

  return {
    aborted: false,
    runId,
    snapshot,
    morningCall,
    validation,
    publishedCount: published.length,
    rejectedCount: rejected.length,
    baselines: extractDayBaselines(snapshot),
  };
}
