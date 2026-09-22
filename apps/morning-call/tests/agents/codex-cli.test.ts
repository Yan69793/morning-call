/**
 * Testes do transporte local do Codex CLI. Nada aqui executa o binario: o `CodexExecFn` e
 * injetado, que e o mesmo gancho que o transporte usa para entrar na cadeia em producao.
 *
 * O teste que mais vale e o ultimo: ele passa o transporte pelo `chatCompletion` de verdade, o
 * mesmo consumidor que roda no Worker, e confere que a resposta sintetica satisfaz o contrato
 * Zod. Se o formato sair do lugar, quebra ali e nao no meio da rodada.
 */
import { describe, expect, it } from "vitest";
import {
  criarFetchCodex,
  extrairCitacoesDoTexto,
  lerEventosCodex,
  montarPrompt,
  type CodexExecFn,
} from "../../src/agents/codex-cli.js";
import { OpenRouterError, chatCompletion } from "../../src/agents/openrouter.js";

/** JSONL como o `codex exec --json` imprime, conforme medido em 22/09/2026. */
function jsonl(opts: { texto?: string; usage?: boolean; busca?: string; erro?: string }): string {
  const linhas: string[] = [
    JSON.stringify({ type: "thread.started", thread_id: "t-1" }),
    JSON.stringify({ type: "turn.started" }),
  ];
  if (opts.erro !== undefined) {
    linhas.push(
      JSON.stringify({ type: "item.completed", item: { id: "i0", type: "error", message: opts.erro } }),
    );
  }
  if (opts.busca !== undefined) {
    linhas.push(
      JSON.stringify({
        type: "item.completed",
        item: { id: "i1", type: "web_search", query: opts.busca, action: { type: "search" } },
      }),
    );
  }
  if (opts.texto !== undefined) {
    linhas.push(
      JSON.stringify({
        type: "item.completed",
        item: { id: "i2", type: "agent_message", text: opts.texto },
      }),
    );
  }
  if (opts.usage !== false) {
    linhas.push(
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 25110,
          cached_input_tokens: 0,
          output_tokens: 6,
          reasoning_output_tokens: 3,
        },
      }),
    );
  }
  return linhas.join("\n");
}

const CWD = process.cwd();

type ResultadoFalso = Awaited<ReturnType<CodexExecFn>>;

/** Executor que sempre devolve o mesmo resultado. Sem processo, sem disco. */
function executorFalso(resultado: ResultadoFalso): CodexExecFn {
  return () => Promise.resolve(resultado);
}

describe("montarPrompt", () => {
  it("junta o system antes e preserva a ordem das demais mensagens", () => {
    const prompt = montarPrompt([
      { role: "system", content: "SISTEMA" },
      { role: "user", content: "PERGUNTA" },
      { role: "assistant", content: "ANTERIOR" },
    ]);
    expect(prompt).toBe("SISTEMA\n\nPERGUNTA\n\nRESPOSTA ANTERIOR:\nANTERIOR");
  });

  it("sem system, devolve so o corpo", () => {
    expect(montarPrompt([{ role: "user", content: "so isso" }])).toBe("so isso");
  });
});

describe("lerEventosCodex", () => {
  it("extrai usage, busca, erro e a ultima mensagem", () => {
    const eventos = lerEventosCodex(
      jsonl({ texto: "resposta", busca: "ibovespa hoje", erro: "aviso do cli" }),
    );
    expect(eventos.ultimaMensagem).toBe("resposta");
    expect(eventos.buscas).toEqual(["ibovespa hoje"]);
    expect(eventos.erros).toEqual(["aviso do cli"]);
    expect(eventos.usage).toEqual({
      inputTokens: 25110,
      cachedInputTokens: 0,
      outputTokens: 6,
      reasoningTokens: 3,
    });
  });

  it("ignora linha ilegivel em vez de abortar", () => {
    const bruto = ["nao e json", "", jsonl({ texto: "ok" })].join("\n");
    expect(lerEventosCodex(bruto).ultimaMensagem).toBe("ok");
  });

  it("stream sem eventos devolve tudo vazio, sem inventar valor", () => {
    const eventos = lerEventosCodex("");
    expect(eventos.ultimaMensagem).toBeUndefined();
    expect(eventos.usage).toBeUndefined();
    expect(eventos.erros).toEqual([]);
  });
});

describe("extrairCitacoesDoTexto", () => {
  it("extrai link markdown com titulo e deduplica a mesma URL", () => {
    const texto = "ver [Investing](https://x.com/a) e de novo [Investing](https://x.com/a)";
    const anotacoes = extrairCitacoesDoTexto(texto);
    expect(anotacoes).toHaveLength(1);
    expect(anotacoes[0]?.url_citation).toEqual({ url: "https://x.com/a", title: "Investing" });
  });

  it("nao trata link nao-http como citacao", () => {
    expect(extrairCitacoesDoTexto("[arquivo](./local.md)")).toEqual([]);
  });
});

describe("criarFetchCodex", () => {
  it("prefere o arquivo do `-o` ao stream quando o executor materializa os dois", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: executorFalso({
        exitCode: 0,
        stderr: "",
        timedOut: false,
        stdout: jsonl({ texto: "do stream" }),
        ultimaMensagem: "do arquivo",
      }),
    });
    const r = await chatCompletion({
      apiKey: "nao-usado",
      model: "codex",
      messages: [{ role: "user", content: "oi" }],
      fetchFn: fetchCodex,
    });
    expect(r.content).toBe("do arquivo");
  });

  it("usa o agent_message quando nao ha arquivo", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: executorFalso({
        exitCode: 0,
        stderr: "",
        timedOut: false,
        stdout: jsonl({ texto: "do stream" }),
      }),
    });
    const r = await chatCompletion({
      apiKey: "nao-usado",
      model: "codex",
      messages: [{ role: "user", content: "oi" }],
      fetchFn: fetchCodex,
    });
    expect(r.content).toBe("do stream");
  });

  it("propaga o JSON Schema do response_format para o executor", async () => {
    let schemaRecebido: Record<string, unknown> | undefined;
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: (req) => {
        schemaRecebido = req.schema;
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          timedOut: false,
          stdout: jsonl({ texto: '{"ok":true}' }),
        });
      },
    });
    await chatCompletion({
      apiKey: "nao-usado",
      model: "codex",
      messages: [{ role: "user", content: "oi" }],
      responseFormatJsonSchema: { name: "X", schema: { type: "object" }, strict: true },
      fetchFn: fetchCodex,
    });
    expect(schemaRecebido).toEqual({ type: "object" });
  });

  it("nao manda schema quando a requisicao nao pede structured output", async () => {
    let schemaRecebido: Record<string, unknown> | undefined = { nao: "deveria" };
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: (req) => {
        schemaRecebido = req.schema;
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          timedOut: false,
          stdout: jsonl({ texto: "ok" }),
        });
      },
    });
    await chatCompletion({
      apiKey: "nao-usado",
      model: "codex",
      messages: [{ role: "user", content: "oi" }],
      fetchFn: fetchCodex,
    });
    expect(schemaRecebido).toBeUndefined();
  });

  it("vira OpenRouterError quando o CLI sai diferente de zero", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: () => Promise.resolve({
        exitCode: 1,
        stderr: "binario nao encontrado",
        timedOut: false,
        stdout: "",
      }),
    });
    await expect(
      chatCompletion({
        apiKey: "nao-usado",
        model: "codex",
        messages: [{ role: "user", content: "oi" }],
        fetchFn: fetchCodex,
      }),
    ).rejects.toThrow(/exit 1/);
  });

  it("vira OpenRouterError no timeout, sem devolver resposta parcial", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      timeoutMs: 10,
      executar: () => Promise.resolve({ exitCode: null, stderr: "", timedOut: true, stdout: "" }),
    });
    await expect(
      chatCompletion({
        apiKey: "nao-usado",
        model: "codex",
        messages: [{ role: "user", content: "oi" }],
        fetchFn: fetchCodex,
      }),
    ).rejects.toThrow(/timeout/);
  });

  it("vira OpenRouterError com o motivo do CLI quando a resposta vem vazia", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: () => Promise.resolve({
        exitCode: 0,
        stderr: "",
        timedOut: false,
        stdout: jsonl({ erro: "sem cota na assinatura" }),
      }),
    });
    await expect(
      chatCompletion({
        apiKey: "nao-usado",
        model: "codex",
        messages: [{ role: "user", content: "oi" }],
        fetchFn: fetchCodex,
      }),
    ).rejects.toThrow(/sem cota na assinatura/);
  });

  it("rejeita corpo fora do contrato com erro tipado", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: () => Promise.resolve({ exitCode: 0, stderr: "", timedOut: false, stdout: "" }),
    });
    await expect(fetchCodex("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: "{}" })).rejects.toThrow(
      OpenRouterError,
    );
  });

  it("entrega a proveniencia dos links no contrato que a cadeia ja consome", async () => {
    const fetchCodex = criarFetchCodex({
      cwd: CWD,
      executar: () => Promise.resolve({
        exitCode: 0,
        stderr: "",
        timedOut: false,
        stdout: jsonl({}),
        ultimaMensagem: "Ibovespa em 186.596 pontos, ver [Investing](https://br.investing.com/x).",
      }),
    });
    const r = await chatCompletion({
      apiKey: "nao-usado",
      model: "codex",
      messages: [{ role: "user", content: "oi" }],
      fetchFn: fetchCodex,
    });
    expect(r.citations).toEqual([
      {
        url: "https://br.investing.com/x",
        title: "Investing",
        dominio: "br.investing.com",
        conteudo: undefined,
      },
    ]);
    expect(r.tokensIn).toBe(25110);
    expect(r.tokensOut).toBe(6);
  });

  it("reporta o modelo pedido em -m e cai no rotulo do transporte quando nao ha", async () => {
    const executar = (): ReturnType<CodexExecFn> =>
      Promise.resolve({ exitCode: 0, stderr: "", timedOut: false, stdout: "", ultimaMensagem: "ok" });
    const comModelo = await chatCompletion({
      apiKey: "nao-usado",
      model: "gpt-x",
      messages: [{ role: "user", content: "oi" }],
      fetchFn: criarFetchCodex({ cwd: CWD, modelo: "gpt-x", executar }),
    });
    const semModelo = await chatCompletion({
      apiKey: "nao-usado",
      model: "gpt-x",
      messages: [{ role: "user", content: "oi" }],
      fetchFn: criarFetchCodex({ cwd: CWD, executar }),
    });
    expect(comModelo.model).toBe("gpt-x");
    expect(semModelo.model).toBe("codex-cli");
  });
});
