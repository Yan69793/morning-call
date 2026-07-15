/**
 * Gera o JSON Schema do TradeCardDraft a partir do zod.
 *
 * Existe porque o `skill/morning-call/assets/trade_card.schema.json` era escrito à mão e nasceu
 * divergente: trazia `entrada: { type: "number" }` — o contrato pré-AD-6, que só modelava trade
 * direcional a preço — enquanto `src/schemas/trade.ts` já discriminava por forma de entrada.
 * Ninguém notou porque nada ligava os dois. Schema escrito à mão ao lado de schema executável
 * é a mesma classe de defeito do `type-sync.ps1` do Radar Quant: a divergência é inevitável, e
 * a única questão é se ela é detectada ou impossível.
 *
 * Uso: npm run gen:schema -w @sz/morning-call
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TradeCardDraft } from "../src/schemas/trade.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const destino = join(__dir, "../../../skill/morning-call/assets/trade_card.schema.json");

const schema = z.toJSONSchema(TradeCardDraft, { io: "input" });

const comCabecalho = {
  $comment:
    "GERADO por apps/morning-call/scripts/gen-trade-card-schema.ts a partir de src/schemas/trade.ts. " +
    "Não editar à mão: rode `npm run gen:schema -w @sz/morning-call`. A versão manual anterior " +
    "divergiu do AD-6 (trazia entrada como number) e ninguém percebeu.",
  ...schema,
};

writeFileSync(destino, JSON.stringify(comCabecalho, null, 2) + "\n", "utf8");
console.log(`schema gerado: ${destino}`);
