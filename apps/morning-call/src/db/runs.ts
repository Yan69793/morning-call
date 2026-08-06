/**
 * Persistência D1: runs + snapshots + metrics + trades.
 * Idempotência: UNIQUE(trade_date) — retry reusa run_id.
 */
import type { MarketSnapshot } from "../schemas/data.js";
import type { QuantMetrics } from "../schemas/quant.js";
import type { TradeCard } from "../schemas/trade.js";

export type RunStatus = "running" | "ok" | "partial" | "failed";

export interface RunRow {
  id: string;
  trade_date: string;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  faltantes: string;
}

/** Gera UUID v4 sem dependência (Workers / Node 22+). */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Obtém ou cria run do pregão. Se já existe, devolve o existente (idempotência).
 */
export async function ensureRun(
  db: D1Database,
  tradeDate: string,
  startedAt: string,
): Promise<{ runId: string; reused: boolean }> {
  const existing = await db
    .prepare("SELECT id FROM runs WHERE trade_date = ?")
    .bind(tradeDate)
    .first<{ id: string }>();
  if (existing) return { runId: existing.id, reused: true };

  const id = newId();
  try {
    await db
      .prepare(
        `INSERT INTO runs (id, trade_date, started_at, status, faltantes)
         VALUES (?, ?, ?, 'running', '[]')`,
      )
      .bind(id, tradeDate, startedAt)
      .run();
    return { runId: id, reused: false };
  } catch {
    // corrida: outro insert ganhou
    const again = await db
      .prepare("SELECT id FROM runs WHERE trade_date = ?")
      .bind(tradeDate)
      .first<{ id: string }>();
    if (!again) throw new Error(`ensureRun falhou para ${tradeDate}`);
    return { runId: again.id, reused: true };
  }
}

export async function saveSnapshot(db: D1Database, snapshot: MarketSnapshot): Promise<void> {
  await db
    .prepare(
      `INSERT INTO snapshots (run_id, taken_at, points) VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET taken_at = excluded.taken_at, points = excluded.points`,
    )
    .bind(snapshot.run_id, snapshot.taken_at, JSON.stringify(snapshot.points))
    .run();
}

export async function saveQuantMetrics(db: D1Database, metrics: QuantMetrics): Promise<void> {
  const computedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO quant_metrics (run_id, computed_at, metrics) VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET computed_at = excluded.computed_at, metrics = excluded.metrics`,
    )
    .bind(metrics.run_id, computedAt, JSON.stringify(metrics))
    .run();
}

export async function finishRun(
  db: D1Database,
  runId: string,
  status: RunStatus,
  faltantes: string[],
  finishedAt: string,
): Promise<void> {
  await db
    .prepare(`UPDATE runs SET status = ?, finished_at = ?, faltantes = ? WHERE id = ?`)
    .bind(status, finishedAt, JSON.stringify(faltantes), runId)
    .run();
}

export interface PersistTradeInput {
  trade: TradeCard;
  publicado: boolean;
  motivo_rejeicao: string | null;
  redteam_veredito: "aprovar" | "rejeitar" | "revisar" | null;
}

export async function saveTrade(db: D1Database, input: PersistTradeInput): Promise<void> {
  const { trade, publicado, motivo_rejeicao, redteam_veredito } = input;
  const d = trade.draft;
  const entradaValor = d.entrada.nivel.value;
  const invalidacaoNivel = d.invalidacao.nivel?.value ?? null;
  await db
    .prepare(
      `INSERT INTO trades (
        id, run_id, thesis_id, nome, classe, categoria, horizonte, direcao,
        entrada_tipo, entrada_valor, unidade, alvo_1, alvo_2, invalidacao_nivel,
        risco_retorno, conviccao, sizing_pct, model, prompt_version,
        publicado, motivo_rejeicao, redteam_veredito, payload
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        publicado = excluded.publicado,
        motivo_rejeicao = excluded.motivo_rejeicao,
        payload = excluded.payload`,
    )
    .bind(
      trade.id,
      trade.provenance.run_id,
      d.nome,
      d.classe,
      d.categoria,
      d.horizonte,
      d.direcao,
      d.entrada.tipo,
      entradaValor,
      d.entrada.nivel.unit,
      d.alvo_1.value,
      d.alvo_2.value,
      invalidacaoNivel,
      trade.risco_retorno.value,
      d.conviccao,
      d.sizing_pct_orcamento_risco,
      trade.provenance.model,
      trade.provenance.prompt_version,
      publicado ? 1 : 0,
      motivo_rejeicao,
      redteam_veredito,
      JSON.stringify(trade),
    )
    .run();
}

export interface LatestReportRow {
  trade_date: string;
  generated_at: string;
  regime: string;
  vies: string;
  conviccao: number;
  n_trades: number;
  aprovado: boolean;
  // O comentário antigo dizia "JSON: MorningCall", mas `saveReportPointer` grava
  // { morningCall, validation, gateReasons, agenda }, não o MorningCall isolado.
  // `ReportPayload` abaixo é o shape real; quem lê decide se faz `JSON.parse` cru ou tipado.
  payload: string;
}

/** Shape real do JSON em `payload`, espelhando o que `saveReportPointer` recebe em `workflow.ts`. */
export interface ReportPayload {
  morningCall: unknown;
  validation: unknown;
  gateReasons: string[];
  agenda: unknown;
}

/** Retorna o relatorio mais recente (maior trade_date) com status ok ou partial. */
export async function getLatestReport(db: D1Database): Promise<LatestReportRow | null> {
  const row = await db
    .prepare(
      `SELECT runs.trade_date, r.generated_at, r.regime, r.vies, r.conviccao, r.n_trades, r.aprovado, r.payload
       FROM reports r
       JOIN runs ON runs.id = r.run_id
       WHERE runs.status IN ('ok', 'partial')
       ORDER BY runs.trade_date DESC
       LIMIT 1`,
    )
    .first<{
      trade_date: string;
      generated_at: string;
      regime: string;
      vies: string;
      conviccao: number;
      n_trades: number;
      aprovado: number;
      payload: string;
    }>();
  if (!row) return null;
  return { ...row, aprovado: row.aprovado === 1 };
}

export async function saveReportPointer(
  db: D1Database,
  opts: {
    runId: string;
    generatedAt: string;
    r2Key: string;
    regime: string;
    vies: string;
    conviccao: number;
    nTrades: number;
    aprovado: boolean;
    payload: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reports (
        run_id, generated_at, r2_key, regime, vies, conviccao, n_trades, aprovado, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        generated_at = excluded.generated_at,
        r2_key = excluded.r2_key,
        payload = excluded.payload,
        aprovado = excluded.aprovado,
        n_trades = excluded.n_trades`,
    )
    .bind(
      opts.runId,
      opts.generatedAt,
      opts.r2Key,
      opts.regime,
      opts.vies,
      opts.conviccao,
      opts.nTrades,
      opts.aprovado ? 1 : 0,
      JSON.stringify(opts.payload),
    )
    .run();
}
