/**
 * Marcação a mercado — cron 18:30. MAE/MFE/status.
 * Puro: sem rede. Preços injetados pelo caller.
 */
export type MarkStatus = "aberto" | "alvo_1" | "alvo_2" | "invalidado" | "expirado";

export interface OpenTradeMarkInput {
  tradeId: string;
  direcao: "comprar" | "vender";
  entrada: number;
  alvo_1: number;
  alvo_2: number;
  invalidacao: number | null;
  /** horizonte esgotado? */
  expirado?: boolean;
  markDate: string;
  markedAt: string;
  preco: number;
  fontePreco: string;
  /** MAE/MFE acumulados anteriores (fração, ex. -0.02) */
  maePrev?: number;
  mfePrev?: number;
}

export interface TradeMarkRow {
  trade_id: string;
  mark_date: string;
  marked_at: string;
  preco: number;
  pnl_pct: number;
  mae_pct: number;
  mfe_pct: number;
  status: MarkStatus;
  fonte_preco: string;
}

function signedPnl(direcao: "comprar" | "vender", entrada: number, preco: number): number {
  if (entrada === 0) throw new Error("entrada zero");
  const raw = (preco - entrada) / entrada;
  return direcao === "comprar" ? raw : -raw;
}

function hitTarget(direcao: "comprar" | "vender", preco: number, target: number): boolean {
  return direcao === "comprar" ? preco >= target : preco <= target;
}

function hitInvalidation(direcao: "comprar" | "vender", preco: number, inv: number): boolean {
  return direcao === "comprar" ? preco <= inv : preco >= inv;
}

export function markTrade(input: OpenTradeMarkInput): TradeMarkRow {
  const pnl = signedPnl(input.direcao, input.entrada, input.preco);
  const mae = Math.min(input.maePrev ?? 0, pnl);
  const mfe = Math.max(input.mfePrev ?? 0, pnl);

  let status: MarkStatus = "aberto";
  if (input.expirado) {
    status = "expirado";
  } else if (
    input.invalidacao !== null &&
    hitInvalidation(input.direcao, input.preco, input.invalidacao)
  ) {
    status = "invalidado";
  } else if (hitTarget(input.direcao, input.preco, input.alvo_2)) {
    status = "alvo_2";
  } else if (hitTarget(input.direcao, input.preco, input.alvo_1)) {
    status = "alvo_1";
  }

  return {
    trade_id: input.tradeId,
    mark_date: input.markDate,
    marked_at: input.markedAt,
    preco: input.preco,
    pnl_pct: pnl,
    mae_pct: mae,
    mfe_pct: mfe,
    status,
    fonte_preco: input.fontePreco,
  };
}
