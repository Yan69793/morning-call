/**
 * Persistência D1 para a marcação a mercado (cron 18:30). Fica separado de runs.ts porque lê
 * `trades` e escreve `trade_marks`, tabelas que o run da manhã não toca.
 */
import type { TradeMarkRow } from "../report/mark.js";

export interface OpenTradeForMark {
  id: string;
  direcao: "comprar" | "vender";
  entrada: number;
  alvo_1: number;
  alvo_2: number;
  invalidacao: number | null;
  /** null quando `entrada_tipo` não é "preco" — marcação ainda não cobre spread/premio. */
  instrumento: string | null;
  maePrev?: number;
  mfePrev?: number;
}

interface OpenTradeDbRow {
  id: string;
  direcao: string;
  entrada_valor: number;
  alvo_1: number;
  alvo_2: number;
  invalidacao_nivel: number | null;
  entrada_tipo: string;
  payload: string;
  last_mae: number | null;
  last_mfe: number | null;
}

/**
 * Trades publicados cujo último status conhecido ainda não é terminal (alvo_2, invalidado ou
 * expirado). Sem marca nenhuma conta como "ainda aberto". `payload` carrega o instrumento porque
 * `entrada.instrumento` só existe para trades tipo "preco" — não é coluna própria da tabela.
 *
 * Não filtra por data: "aberto" é estado atual do trade, não do pregão marcado.
 */
export async function getOpenTrades(db: D1Database): Promise<OpenTradeForMark[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.direcao, t.entrada_valor, t.alvo_1, t.alvo_2, t.invalidacao_nivel,
              t.entrada_tipo, t.payload, lm.mae_pct as last_mae, lm.mfe_pct as last_mfe
       FROM trades t
       LEFT JOIN trade_marks lm
         ON lm.trade_id = t.id
         AND lm.mark_date = (SELECT MAX(mark_date) FROM trade_marks WHERE trade_id = t.id)
       WHERE t.publicado = 1
         AND t.entrada_tipo IN ('preco', 'spread', 'premio')
         AND (lm.status IS NULL OR lm.status NOT IN ('alvo_2', 'invalidado', 'expirado'))`,
    )
    .bind()
    .all<OpenTradeDbRow>();

  return results.map((r) => {
    let instrumento: string | null = null;
    if (r.entrada_tipo === "preco") {
      try {
        const payload = JSON.parse(r.payload) as { draft?: { entrada?: { instrumento?: string } } };
        instrumento = payload.draft?.entrada?.instrumento ?? null;
      } catch {
        instrumento = null;
      }
    }
    return {
      id: r.id,
      direcao: r.direcao === "vender" ? "vender" : "comprar",
      entrada: r.entrada_valor,
      alvo_1: r.alvo_1,
      alvo_2: r.alvo_2,
      invalidacao: r.invalidacao_nivel,
      instrumento,
      maePrev: r.last_mae ?? undefined,
      mfePrev: r.last_mfe ?? undefined,
    };
  });
}

/** UPSERT em trade_marks — remarcar o mesmo dia substitui a linha (PRIMARY KEY trade_id+mark_date). */
export async function saveMark(db: D1Database, mark: TradeMarkRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO trade_marks (
        trade_id, mark_date, marked_at, preco, pnl_pct, mae_pct, mfe_pct, status, fonte_preco
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trade_id, mark_date) DO UPDATE SET
        marked_at = excluded.marked_at,
        preco = excluded.preco,
        pnl_pct = excluded.pnl_pct,
        mae_pct = excluded.mae_pct,
        mfe_pct = excluded.mfe_pct,
        status = excluded.status,
        fonte_preco = excluded.fonte_preco`,
    )
    .bind(
      mark.trade_id,
      mark.mark_date,
      mark.marked_at,
      mark.preco,
      mark.pnl_pct,
      mark.mae_pct,
      mark.mfe_pct,
      mark.status,
      mark.fonte_preco,
    )
    .run();
}
