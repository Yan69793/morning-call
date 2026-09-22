/**
 * Prova viva do transporte local: roda UMA chamada real pelo Codex CLI, pelo mesmo caminho que a
 * cadeia usa (`chatCompletion` -> `fetchFn` injetado). Serve para conferir binario, login, stdin,
 * `-o` e `--output-schema` sem precisar de uma rodada inteira do Morning Call.
 *
 * Nao faz parte do gate (o gate nao pode depender de assinatura logada nem de rede). Rode a mao:
 *
 *   npx tsx scripts/local/smoke-transporte.ts
 *
 * Variaveis uteis: `CODEX_MODELO` (repassa o `-m`), `CODEX_TIMEOUT_MS`.
 */
import { tmpdir } from "node:os";
import { chatCompletion } from "../../src/agents/openrouter.js";
import { criarFetchCodex } from "../../src/agents/codex-cli.js";
import { criarExecutarCodex } from "./executar-codex.js";

const timeoutMs = Number(process.env.CODEX_TIMEOUT_MS ?? 300_000);
const cwd = tmpdir();

const fetchCodex = criarFetchCodex({
  cwd,
  executar: criarExecutarCodex(),
  timeoutMs,
  ...(process.env.CODEX_MODELO ? { modelo: process.env.CODEX_MODELO } : {}),
  aoChamar: (info) => {
    console.log(
      JSON.stringify({
        event: "smoke_chamada",
        promptChars: info.promptChars,
        temSchema: info.temSchema,
        buscas: info.buscas,
        usage: info.usage,
      }),
    );
  },
});

const inicio = Date.now();
const r = await chatCompletion({
  apiKey: "nao-usado-pelo-cli",
  model: "codex",
  messages: [
    { role: "system", content: "Responda sempre em JSON, sem texto fora do JSON." },
    {
      role: "user",
      content: 'Devolva {"ok": true, "transporte": "codex-cli", "data": "AAAA-MM-DD"} com a data de hoje.',
    },
  ],
  responseFormatJsonSchema: {
    name: "SmokeTransporte",
    schema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        transporte: { type: "string" },
        data: { type: "string" },
      },
      required: ["ok", "transporte", "data"],
      additionalProperties: false,
    },
    strict: true,
  },
  fetchFn: fetchCodex,
  timeoutMs,
});

console.log(
  JSON.stringify(
    {
      event: "smoke_resultado",
      ms: Date.now() - inicio,
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      citacoes: r.citations.length,
      content: r.content,
    },
    null,
    2,
  ),
);
