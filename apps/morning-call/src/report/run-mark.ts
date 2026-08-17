/**
 * Orquestra a marcação a mercado do cron 18:30: busca trades abertos, resolve preço, marca e
 * persiste. Puro no formato (deps injetadas) para não precisar de D1/rede em teste — só
 * `markTrade` (mark.ts) faz a conta, isto aqui só liga as pontas.
 */
import { markTrade } from "./mark.js";
import type { TradeMarkRow } from "./mark.js";
import type { DataPoint } from "../schemas/data.js";

export interface OpenTradeForMark {
  id: string;
  direcao: "comprar" | "vender";
  entrada: number;
  alvo_1: number;
  alvo_2: number;
  invalidacao: number | null;
  instrumento: string | null;
  maePrev?: number;
  mfePrev?: number;
}

export interface MarkCronDeps {
  getOpenTrades(): Promise<OpenTradeForMark[]>;
  fetchPrice(instrumento: string, tradeDate: string, observedAt: string): Promise<DataPoint>;
  saveMark(row: TradeMarkRow): Promise<void>;
}

export interface MarkCronResult {
  marcados: string[];
  pulados: { tradeId: string; motivo: string }[];
}

export async function runMarkCron(
  tradeDate: string,
  markedAt: string,
  deps: MarkCronDeps,
): Promise<MarkCronResult> {
  const trades = await deps.getOpenTrades();
  const marcados: string[] = [];
  const pulados: { tradeId: string; motivo: string }[] = [];

  for (const t of trades) {
    if (!t.instrumento) {
      pulados.push({
        tradeId: t.id,
        motivo: "entrada não é tipo preco — marcação ainda não cobre spread/premio",
      });
      continue;
    }

    const point = await deps.fetchPrice(t.instrumento, tradeDate, markedAt);
    if (point.status !== "OK") {
      pulados.push({
        tradeId: t.id,
        motivo: point.status === "ND" ? point.reason : "preço indisponível",
      });
      continue;
    }

    const row = markTrade({
      tradeId: t.id,
      direcao: t.direcao,
      entrada: t.entrada,
      alvo_1: t.alvo_1,
      alvo_2: t.alvo_2,
      invalidacao: t.invalidacao,
      markDate: tradeDate,
      markedAt,
      preco: point.quantity.value,
      fontePreco: point.source.name,
      maePrev: t.maePrev,
      mfePrev: t.mfePrev,
    });
    await deps.saveMark(row);
    marcados.push(t.id);
  }

  return { marcados, pulados };
}
