/**
 * Arquiva o Morning Call do dia em disco, uma pasta por mês, um arquivo por dia.
 *
 * O Worker roda na Cloudflare e não tem sistema de arquivos local, então o arquivamento é
 * necessariamente um passo local que puxa o relatório já gravado e o escreve. Rode depois do cron
 * das 06:30 BRT.
 *
 * Uso: npx tsx scripts/save-morning-call.ts [--api URL] [--out DIR] [--force]
 *
 * Saída: <raiz do repo>/morning-calls/2026-08/2026-08-06.md
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MorningCall } from "../src/schemas/report.js";
import { renderMorningCallMarkdown } from "../src/report/markdown.js";

const API_PADRAO = "https://morning-call.prospects-intel.workers.dev";
const TIMEOUT_MS = 60_000;

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function raizDoRepo(): string {
  // scripts/ -> apps/morning-call/ -> apps/ -> raiz
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

async function main(): Promise<number> {
  const api = (arg("api") ?? API_PADRAO).replace(/\/+$/, "");
  const destino = arg("out") ?? join(raizDoRepo(), "morning-calls");
  const force = process.argv.includes("--force");

  const resp = await fetch(`${api}/api/report/latest`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    console.error(`ERRO: ${api}/api/report/latest devolveu HTTP ${resp.status}`);
    return 1;
  }

  const body = (await resp.json()) as {
    ok?: boolean;
    error?: string;
    report?: { morningCall?: unknown; gateReasons?: unknown };
    aprovado?: boolean;
  };
  if (!body.ok) {
    console.error(`ERRO: API respondeu ok=false — ${body.error ?? "sem motivo"}`);
    return 1;
  }

  // Valida antes de escrever: um arquivo com relatório meia-boca no disco é pior que nenhum,
  // porque parece histórico confiável depois.
  const parsed = MorningCall.safeParse(body.report?.morningCall);
  if (!parsed.success) {
    console.error("ERRO: relatório fora do contrato MorningCall — nada foi escrito.");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    return 1;
  }
  const mc = parsed.data;

  const gateReasons = Array.isArray(body.report?.gateReasons)
    ? (body.report.gateReasons as unknown[]).filter((r): r is string => typeof r === "string")
    : [];

  const mes = mc.trade_date.slice(0, 7);
  const pasta = join(destino, mes);
  const arquivo = join(pasta, `${mc.trade_date}.md`);

  if (existsSync(arquivo) && !force) {
    console.log(`Já existe, nada feito: ${arquivo}`);
    console.log("Use --force para sobrescrever.");
    return 0;
  }

  mkdirSync(pasta, { recursive: true });
  writeFileSync(
    arquivo,
    renderMorningCallMarkdown(mc, { gateReasons, aprovado: body.aprovado }),
    "utf8",
  );

  console.log(`Gravado: ${arquivo}`);
  console.log(`  regime ${mc.abertura.regime} | viés ${mc.abertura.vies} | ${mc.trades.length} operações`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`ERRO FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
