/**
 * Agrega providers → MarketSnapshot validado.
 * Snapshot-first: grava isto em D1 antes de qualquer LLM.
 */
import { MarketSnapshot, type DataPoint } from "../schemas/data.js";
import type { DataProvider, DataProviderContext } from "./types.js";
import { bcbSgsProvider } from "./bcb/sgs.js";
import { bcbFocusProvider } from "./bcb/focus.js";
import { enforceFreshness } from "./freshness.js";
import { fredProvider } from "./fred.js";
import { usTreasuryProvider } from "./ustreasury.js";

export const DEFAULT_PROVIDERS: DataProvider[] = [
  bcbSgsProvider,
  bcbFocusProvider,
  fredProvider,
  usTreasuryProvider,
];

export interface BuildSnapshotInput {
  runId: string;
  tradeDate: string;
  observedAt: string;
  providers?: DataProvider[];
  secrets?: DataProviderContext["secrets"];
  fetchFn?: typeof fetch;
}

/**
 * Dedup por key: primeiro OK vence; se só ND, fica o primeiro ND.
 * UST e FRED ambos publicam UST_*: preferimos o primeiro OK na ordem dos providers.
 */
export function mergePoints(batches: DataPoint[][]): DataPoint[] {
  const map = new Map<string, DataPoint>();
  for (const batch of batches) {
    for (const p of batch) {
      const prev = map.get(p.key);
      if (!prev) {
        map.set(p.key, p);
        continue;
      }
      if (prev.status === "ND" && p.status === "OK") {
        map.set(p.key, p);
      }
    }
  }
  return [...map.values()];
}

export async function buildMarketSnapshot(input: BuildSnapshotInput): Promise<MarketSnapshot> {
  const providers = input.providers ?? DEFAULT_PROVIDERS;
  const ctx: DataProviderContext = {
    tradeDate: input.tradeDate,
    observedAt: input.observedAt,
    fetchFn: input.fetchFn,
    secrets: input.secrets,
  };
  const batches = await Promise.all(providers.map((p) => p.fetch(ctx)));
  // Frescor ANTES do merge: um OK velho não pode ganhar de um ND só por chegar primeiro.
  // Depois do gate ele já é ND, e a disputa passa a ser entre iguais.
  const points = mergePoints(batches.map((b) => enforceFreshness(b, input.tradeDate)));
  if (points.length === 0) {
    throw new Error("snapshot vazio: nenhum provider retornou pontos");
  }
  return MarketSnapshot.parse({
    run_id: input.runId,
    trade_date: input.tradeDate,
    taken_at: input.observedAt,
    points,
  });
}

export function listNdKeys(snapshot: MarketSnapshot): string[] {
  return snapshot.points.filter((p) => p.status === "ND").map((p) => p.key);
}
