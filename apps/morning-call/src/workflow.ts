/**
 * AD-5: Workflow durável. O cron e o endpoint /trigger criam uma instância do Workflow;
 * cada step.do() persiste seu resultado. Se o LLM falhar, retoma do snapshot, não do zero.
 *
 * A pipeline tem 3 steps duráveis:
 *   [1] init-snapshot  — calendário, ensureRun, coleta de dados, persistência inicial
 *   [2] strategist       — chamada LLM (o step mais caro e mais provável de falhar)
 *   [3] gates-report     — validação, persistência final, relatório, push para Radar Quant
 *
 * Registro: wrangler.toml [[workflows]] + env.WORKFLOW.create()
 */
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import type { Env } from "./env.js";
import { checkSession, todayTradeDateBrt } from "./data/calendar.js";
import { JANELA_CORRELACAO, fetchSeriesBundle } from "./data/series.js";
import { buildQuantMetrics } from "./quant/build.js";
import { buildMarketSnapshot, listNdKeys } from "./data/snapshot.js";
import {
  ensureRun,
  finishRun,
  saveQuantMetrics,
  saveReportPointer,
  saveSnapshot,
  saveTrade,
} from "./db/runs.js";
import { runStrategist } from "./agents/strategist.js";
import { runCalendarAgent } from "./agents/calendar.js";
import { fetchAgendaEvents } from "./data/agenda/index.js";
import { decidirPublicacao } from "./committee/decisao.js";
import { buildMorningCall } from "./report/build.js";
import { validateMorningCall } from "./report/validate.js";
import { buildMacroSummary } from "./report/sumario.js";
import type { MarketSnapshot } from "./schemas/data.js";
import type { TradeCard } from "./schemas/trade.js";
import type { StrategistRaw } from "./agents/strategist.js";
import type { EconomicAgenda } from "./schemas/agenda.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MorningCallParams {}

interface Step1Result {
  aborted: boolean;
  reason?: string;
  runId: string;
  tradeDate: string;
  snapshot: MarketSnapshot;
  faltantes: string[];
  /** Vai para o gate no step 3. Atravessa o step porque `step.do` persiste o retorno. */
  correlacoes: { a: string; b: string; rho: number }[];
}

interface Step2Result {
  raw: StrategistRaw;
  trades: TradeCard[];
  model: string;
  promptVersion: string;
  generatedAt: string;
  /** Motivos de eco do prompt. Não-vazio derruba a rodada antes de gravar relatório. */
  echo: string[];
}

interface Step2bResult {
  agenda: EconomicAgenda | null;
  agendaError?: string;
}

interface Step3Result {
  publishedCount: number;
  rejectedCount: number;
  aprovado: boolean;
}

export class MorningCallWorkflow extends WorkflowEntrypoint<Env, MorningCallParams> {
  async run(event: WorkflowEvent<MorningCallParams>, step: WorkflowStep) {
    const now = new Date(event.timestamp);
    const tradeDate = todayTradeDateBrt(now);

    // ── Step 1: init + snapshot ──
    const s1 = await step.do("init-snapshot", async (): Promise<Step1Result> => {
      const session = checkSession(tradeDate);
      if (!session.shouldRunMorningCall) {
        return {
          aborted: true,
          reason: session.reason ?? "sem pregão B3",
          runId: "",
          tradeDate,
          snapshot: null as unknown as MarketSnapshot,
          faltantes: [],
          correlacoes: [],
        };
      }

      const observedAt = now.toISOString();
      const ensured = await ensureRun(this.env.DB, tradeDate, observedAt);
      const runId = ensured.runId;

      const snapshot = await buildMarketSnapshot({
        runId,
        tradeDate,
        observedAt,
        secrets: { fredApiKey: this.env.FRED_API_KEY },
      });

      const faltantes = listNdKeys(snapshot);
      await saveSnapshot(this.env.DB, snapshot);

      // Séries históricas: sem elas o quant não tem do que calcular retorno, vol e correlação, e
      // `correlacoes_63d: []` deixa o MAX_RHO do comitê inerte — o gate roda e nunca barra.
      const bundle = await fetchSeriesBundle({
        tradeDate,
        observedAt,
        secrets: { fredApiKey: this.env.FRED_API_KEY },
      });
      const metrics = buildQuantMetrics({
        runId,
        tradeDate,
        ativos: bundle.ativos,
        curvas: bundle.curvas,
        faltantes: [...faltantes, ...bundle.semSerie],
        janelaCorrelacao: JANELA_CORRELACAO,
      });
      await saveQuantMetrics(this.env.DB, metrics);

      return {
        aborted: false,
        runId,
        tradeDate,
        snapshot,
        faltantes,
        correlacoes: metrics.correlacoes_63d,
      };
    });

    if (s1.aborted) {
      console.log(JSON.stringify({ event: "workflow_aborted", reason: s1.reason }));
      return { aborted: true, reason: s1.reason };
    }

    // ── Step 2: strategist (LLM) ──
    const deepseekKey = this.env.DEEPSEEK_API_KEY;
    const openRouterKey = this.env.OPENROUTER_API_KEY;
    const useDeepSeek = Boolean(deepseekKey);
    const apiKey = useDeepSeek ? (deepseekKey ?? "") : (openRouterKey ?? "");
    if (!apiKey) {
      await finishRun(this.env.DB, s1.runId, "partial", s1.faltantes, new Date().toISOString());
      console.log(JSON.stringify({ event: "workflow_no_apikey", runId: s1.runId }));
      return { aborted: false, runId: s1.runId, reason: "API_KEY ausente" };
    }

    const model = useDeepSeek
      ? "deepseek-chat"
      : (this.env.STRATEGIST_MODEL ?? "anthropic/claude-opus-4-7");

    const s2 = await step.do("strategist", async (): Promise<Step2Result> => {
      const strat = await runStrategist({
        snapshot: s1.snapshot,
        apiKey,
        model,
        runId: s1.runId,
        deepseekApi: useDeepSeek,
      });
      return {
        raw: strat.raw,
        trades: strat.trades,
        model: strat.model,
        promptVersion: strat.provenance.prompt_version,
        generatedAt: strat.provenance.generated_at,
        echo: strat.echo,
      };
    });

    // Eco do prompt derruba a rodada aqui, fora do `step.do`, e de propósito: dentro do step, o
    // throw dispararia retry, e um modelo que copiou o exemplo copia de novo — pagaríamos a mesma
    // chamada várias vezes para chegar no mesmo lugar. Nada é gravado como relatório: publicar um
    // Morning Call que é o prompt refletido de volta é pior que não publicar nada.
    if (s2.echo.length > 0) {
      await finishRun(this.env.DB, s1.runId, "failed", s1.faltantes, new Date().toISOString());
      console.log(
        JSON.stringify({
          event: "workflow_prompt_echo",
          runId: s1.runId,
          model: s2.model,
          promptVersion: s2.promptVersion,
          motivos: s2.echo,
        }),
      );
      return { aborted: true, runId: s1.runId, reason: "eco do prompt", motivos: s2.echo };
    }

    // ── Step 2.5: economic calendar (best-effort, nao bloqueia) ──
    const s2b = await step.do("economic-calendar", async (): Promise<Step2bResult> => {
      try {
        // Scraping de eventos
        const { eventos, fontes } = await fetchAgendaEvents({
          tradeDate: s1.tradeDate,
        });

        // LLM para analise de impacto (mesmo com 0 eventos, gera agenda de dia calmo)
        const deepseekKeyForCal = this.env.DEEPSEEK_API_KEY;
        const openRouterKeyForCal = this.env.OPENROUTER_API_KEY;
        const useDeepSeekForCal = Boolean(deepseekKeyForCal);
        const calApiKey = useDeepSeekForCal
          ? (deepseekKeyForCal ?? "")
          : (openRouterKeyForCal ?? "");
        const calModel = useDeepSeekForCal
          ? "deepseek-chat"
          : (this.env.STRATEGIST_MODEL ?? "anthropic/claude-opus-4-7");

        if (!calApiKey) {
          return { agenda: null, agendaError: "API_KEY ausente para calendario" };
        }

        const calResult = await runCalendarAgent({
          input: {
            trade_date: s1.tradeDate,
            eventos,
            fonte: fontes.join(", ") || "fallback-estatico",
          },
          apiKey: calApiKey,
          model: calModel,
          runId: s1.runId,
          deepseekApi: useDeepSeekForCal,
        });

        console.log(
          JSON.stringify({
            event: "workflow_calendar_ok",
            runId: s1.runId,
            eventos: calResult.agenda.eventos.length,
            nivel_alerta: calResult.agenda.nivel_alerta,
            fontes,
          }),
        );

        return { agenda: calResult.agenda };
      } catch (err) {
        console.log(
          JSON.stringify({
            event: "workflow_calendar_error",
            error: err instanceof Error ? err.message : "desconhecido",
            runId: s1.runId,
          }),
        );
        return {
          agenda: null,
          agendaError: err instanceof Error ? err.message : "erro desconhecido",
        };
      }
    });

    // ── Step 3: gates + report + push ──
    const s3 = await step.do("gates-report", async (): Promise<Step3Result> => {
      const { gates, published, rejected } = decidirPublicacao({
        snapshot: s1.snapshot,
        claims: s2.raw.quant_claims ?? [],
        trades: s2.trades,
        metrics: { correlacoes_63d: s1.correlacoes },
      });

      for (const t of published) {
        await saveTrade(this.env.DB, {
          trade: t,
          publicado: true,
          motivo_rejeicao: null,
          redteam_veredito: null,
        });
      }
      for (const r of rejected) {
        await saveTrade(this.env.DB, {
          trade: r.trade,
          publicado: false,
          motivo_rejeicao: r.motivo,
          redteam_veredito: "rejeitar",
        });
      }

      const generatedAt = new Date().toISOString();
      const provenance = {
        run_id: s1.runId,
        model: s2.model,
        prompt_version: s2.promptVersion,
        generated_at: s2.generatedAt,
      };

      const morningCall = buildMorningCall({
        runId: s1.runId,
        tradeDate: s1.tradeDate,
        generatedAt,
        raw: s2.raw,
        trades: published,
        provenance,
      });

      const validation = validateMorningCall(morningCall, {
        crossCheck: gates.crossCheck,
        correlacionados: gates.correlacionados,
      });

      const r2Key = `morning-call/${s1.tradeDate}/${s1.runId}.json`;
      if (this.env.REPORTS) {
        await this.env.REPORTS.put(r2Key, JSON.stringify(morningCall));
      }

      await saveReportPointer(this.env.DB, {
        runId: s1.runId,
        generatedAt,
        r2Key,
        regime: morningCall.abertura.regime,
        vies: morningCall.abertura.vies,
        conviccao: morningCall.abertura.conviccao,
        nTrades: published.length,
        aprovado: validation.aprovado && gates.ok,
        payload: {
          morningCall,
          validation,
          gateReasons: gates.reasons,
          agenda: s2b.agenda,
        },
      });

      const status =
        s1.faltantes.length > 0 || !validation.aprovado || !gates.ok ? "partial" : "ok";
      await finishRun(this.env.DB, s1.runId, status, s1.faltantes, generatedAt);

      // push resumo macro para Radar Quant
      if (this.env.RADAR_QUANT_INGEST_URL) {
        const ingestUrl = `${this.env.RADAR_QUANT_INGEST_URL.replace(/\/+$/, "")}/api/ingest/macro-summary`;
        try {
          const summary = buildMacroSummary(morningCall);
          await fetch(ingestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-ingest-secret": this.env.RADAR_QUANT_INGEST_SECRET ?? "",
            },
            body: JSON.stringify(summary),
          });
        } catch (err) {
          console.log(
            JSON.stringify({
              event: "workflow_macro_push_error",
              error: err instanceof Error ? err.message : "desconhecido",
              runId: s1.runId,
            }),
          );
        }
      }

      return {
        publishedCount: published.length,
        rejectedCount: rejected.length,
        aprovado: validation.aprovado,
      };
    });

    console.log(
      JSON.stringify({
        event: "workflow_done",
        runId: s1.runId,
        published: s3.publishedCount,
        rejected: s3.rejectedCount,
        aprovado: s3.aprovado,
      }),
    );

    return {
      aborted: false,
      runId: s1.runId,
      publishedCount: s3.publishedCount,
      rejectedCount: s3.rejectedCount,
    };
  }
}
