/**
 * Executor do Codex CLI: a parte que toca processo, disco e PATH.
 *
 * Fica em `scripts/local/` e nao em `src/agents/` por causa da fronteira de tipos do projeto. O
 * `tsconfig` do Worker declara `types: ["@cloudflare/workers-types"]` sozinho, de proposito, para
 * que um import de `node:fs` por engano apareca no typecheck e nao no deploy. `scripts/tsconfig.json`
 * inclui `node` justamente para o tooling local. Separar mantem os dois lados honestos: o
 * transporte em `src/agents/codex-cli.ts` e puro e testavel, e o processo vive aqui.
 *
 * Sem teste unitario neste arquivo de proposito: um teste dele teria de viver em `tests/`, que
 * pertence ao projeto do Worker e nao enxerga os tipos de Node. A prova deste arquivo e a
 * execucao real, `npx tsx scripts/local/smoke-transporte.ts`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { CodexExecFn, CodexExecResult } from "../../src/agents/codex-cli.js";

/**
 * Como invocar o CLI sem shell.
 *
 * No Windows o lancador do npm e `codex.cmd`, e `spawn` se recusa a executar arquivo de lote sem
 * `shell: true` (EINVAL, Node >= 18.20). Ligar o shell resolveria o EINVAL e criaria outro
 * problema: com `shell: true` o Node junta os argumentos com espaco, sem escapar, e o caminho
 * deste projeto tem espaco (`.../FREQUENTE/Morning Call`). O caminho limpo e ler o alvo do proprio
 * shim, que aponta para `node_modules/@openai/codex/bin/codex.js`, e rodar esse arquivo com o
 * `process.execPath`. Sem shell, com argumentos passados nativamente.
 */
export interface ComandoCodex {
  binario: string;
  prefixoArgs: string[];
  /** Diagnostico do que foi resolvido. Nao vai para a linha de comando. */
  origem: string;
}

const ALVO_SHIM = /"%dp0%[\\/]([^"]+\.js)"/;

/**
 * Encontra o CLI no PATH e devolve como executar.
 *
 * `existe` e `lerArquivo` sao injetaveis para que a resolucao possa ser exercitada sem depender
 * do que esta instalado na maquina.
 */
export function resolverComandoCodex(
  nome = "codex",
  env: NodeJS.ProcessEnv = process.env,
  plataforma: NodeJS.Platform = process.platform,
  existe: (caminho: string) => boolean = existsSync,
  lerArquivo: (caminho: string) => string = (c) => readFileSync(c, "utf8"),
  execPath: string = process.execPath,
): ComandoCodex {
  // Caminho explicito: nao ha o que resolver.
  if (nome.includes("/") || nome.includes("\\")) {
    return { binario: nome, prefixoArgs: [], origem: "caminho-explicito" };
  }
  const pathVar = env.PATH ?? env.Path ?? "";
  const diretorios = pathVar.split(delimiter).filter((d) => d.length > 0);
  const extensoes = plataforma === "win32" ? [".cmd", ".exe"] : [""];

  for (const dir of diretorios) {
    for (const ext of extensoes) {
      const candidato = join(dir, nome + ext);
      if (!existe(candidato)) continue;
      if (ext === ".exe") return { binario: candidato, prefixoArgs: [], origem: "exe" };
      // `.cmd` do npm: extrai o JS alvo do shim e roda com o Node atual.
      let conteudo: string;
      try {
        conteudo = lerArquivo(candidato);
      } catch {
        continue;
      }
      const alvo = ALVO_SHIM.exec(conteudo);
      const relativo = alvo?.[1];
      if (relativo !== undefined) {
        const js = join(dirname(candidato), relativo);
        if (existe(js)) {
          return { binario: execPath, prefixoArgs: [js], origem: "shim-npm" };
        }
      }
    }
  }
  // Nao achou: devolve o nome cru para o erro do sistema chegar com nome e codigo, em vez de um
  // "binario nao encontrado" inventado aqui.
  return { binario: nome, prefixoArgs: [], origem: "nao-resolvido" };
}

/** Monta os argumentos do `codex exec`. Exportado para auditar a lista sem rodar nada. */
export function montarArgsCodex(opts: {
  cwd: string;
  arquivoSaida: string;
  arquivoSchema?: string;
  modelo?: string;
}): string[] {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "-C",
    opts.cwd,
    "-o",
    opts.arquivoSaida,
  ];
  if (opts.modelo !== undefined) args.push("-m", opts.modelo);
  if (opts.arquivoSchema !== undefined) args.push("--output-schema", opts.arquivoSchema);
  // `-` manda o CLI ler as instrucoes do stdin. O prompt do strategist passa do limite de linha
  // de comando do Windows (32k), entao nunca vai como argumento.
  args.push("-");
  return args;
}

export interface ExecutarCodexConfig {
  /** Comando ja resolvido. Ausente = `resolverComandoCodex()`. */
  comando?: ComandoCodex;
  /** Base dos arquivos temporarios. Ausente = `os.tmpdir()`. */
  tmpBase?: string;
  /** Mantem o diretorio temporario para inspecao. Default false. */
  manterTemporarios?: boolean;
  /** Recebe a linha de comando montada, para auditoria. */
  aoMontarArgs?: (info: { args: readonly string[]; origem: string; binario: string }) => void;
}

/** Implementacao real do `CodexExecFn`. */
export function criarExecutarCodex(config: ExecutarCodexConfig = {}): CodexExecFn {
  const comando = config.comando ?? resolverComandoCodex();
  return async (req, opts): Promise<CodexExecResult> => {
    const temporario = mkdtempSync(join(config.tmpBase ?? tmpdir(), "mc-codex-"));
    const arquivoSaida = join(temporario, "ultima-mensagem.txt");
    let arquivoSchema: string | undefined;
    if (req.schema) {
      arquivoSchema = join(temporario, "schema.json");
      writeFileSync(arquivoSchema, JSON.stringify(req.schema), "utf8");
    }
    const args = [
      ...comando.prefixoArgs,
      ...montarArgsCodex({
        cwd: opts.cwd,
        arquivoSaida,
        ...(arquivoSchema === undefined ? {} : { arquivoSchema }),
        ...(req.modelo === undefined ? {} : { modelo: req.modelo }),
      }),
    ];
    config.aoMontarArgs?.({ args, origem: comando.origem, binario: comando.binario });

    try {
      const bruto = await rodar(comando.binario, args, {
        cwd: opts.cwd,
        timeoutMs: opts.timeoutMs,
        entrada: req.prompt,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      const ultimaMensagem = existsSync(arquivoSaida)
        ? readFileSync(arquivoSaida, "utf8").trim()
        : undefined;
      return { ...bruto, ...(ultimaMensagem === undefined ? {} : { ultimaMensagem }) };
    } finally {
      if (config.manterTemporarios !== true) {
        try {
          rmSync(temporario, { recursive: true, force: true });
        } catch {
          // Temporario que nao sai nao pode derrubar a rodada; o sistema limpa depois.
        }
      }
    }
  };
}

interface RodarOptions {
  cwd: string;
  timeoutMs: number;
  entrada?: string;
  signal?: AbortSignal;
}

function rodar(
  binario: string,
  args: readonly string[],
  opts: RodarOptions,
): Promise<CodexExecResult> {
  return new Promise<CodexExecResult>((resolve) => {
    const proc = spawn(binario, [...args], {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let resolvido = false;

    const encerrar = (resultado: CodexExecResult): void => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", aoAbortar);
      resolve(resultado);
    };
    const matar = (): void => {
      if (!proc.killed) proc.kill();
    };
    const aoAbortar = (): void => {
      matar();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      matar();
    }, opts.timeoutMs);
    opts.signal?.addEventListener("abort", aoAbortar, { once: true });

    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => {
      stdout += d;
    });
    proc.stderr?.on("data", (d: string) => {
      stderr += d;
    });
    proc.on("error", (err: Error) => {
      encerrar({ exitCode: null, stdout, stderr: `${stderr}${err.message}`, timedOut });
    });
    proc.on("close", (code: number | null) => {
      encerrar({ exitCode: code, stdout, stderr, timedOut });
    });
    if (opts.entrada !== undefined) {
      // stdin fechado pelo filho antes da escrita nao e falha: quem decide o desfecho e o `close`.
      proc.stdin?.on("error", () => undefined);
      proc.stdin?.end(opts.entrada);
    } else {
      proc.stdin?.end();
    }
  });
}
