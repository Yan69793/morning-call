/**
 * Desfecho de falha terminal ponta a ponta, com o `run()` real do Workflow.
 *
 * Reproduz o defeito medido: o step `strategist` morre com HTTP 402 (pré-autorização de crédito
 * do OpenRouter) e as retentativas do motor se esgotam. Caminho real usado aqui, sem mock de
 * agente: `fetch` global devolve 402 com o N no corpo, `chatCompletion` esgota o retry de billing
 * que já existe (`src/agents/openrouter.ts:267-327`) e lança `OpenRouterBillingError`.
 *
 * O step falso se comporta como o motor (7 tentativas, ver contrato do cartão t_b042ce58) e
 * registra o estado do D1 no instante em que desiste — que é o instante em que a instância pode
 * morrer sem devolver o controle ao `run()`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowEvent } from "cloudflare:workers";
import { MorningCallWorkflow, type MorningCallParams } from "../../src/workflow.js";
import { todayTradeDateBrt } from "../../src/data/calendar.js";
import { MarketSnapshot } from "../../src/schemas/data.js";
import type { Env } from "../../src/env.js";
import {
  FakeD1,
  TENTATIVAS_DO_MOTOR,
  comoWorkflowStep,
  criarStepFalso,
  escritasDeFalha,
  escritasEm,
  type Escrita,
} from "./fake-d1.js";

/** 06:30 BRT de quarta-feira, 16/09/2026 — pregão B3, dentro da janela da rodada matinal. */
const INSTANTE = new Date("2026-09-16T09:30:00.000Z");
const TRADE_DATE = todayTradeDateBrt(INSTANTE);

/** Corpo de 402 de pré-autorização do OpenRouter, no formato que o parser de `afford` lê. */
const CORPO_402 = JSON.stringify({
  error: {
    message: "This request requires more credits, or fewer max_tokens. can only afford 120",
  },
});

const SNAPSHOT = MarketSnapshot.parse({
  run_id: "11111111-1111-4111-8111-111111111111",
  trade_date: TRADE_DATE,
  taken_at: INSTANTE.toISOString(),
  points: [
    {
      status: "ND",
      key: "USDBRL",
      venue: "BR",
      reason: "snapshot sintético do teste",
      observed_at: INSTANTE.toISOString(),
    },
  ],
});

/** Resultado do step 1 como o motor devolveria no replay: já persistido, callback não roda. */
const STEP1_PRONTO = {
  aborted: false,
  runId: SNAPSHOT.run_id,
  tradeDate: TRADE_DATE,
  snapshot: SNAPSHOT,
  faltantes: [],
  correlacoes: [],
};

class FakeR2 {
  readonly puts: string[] = [];
  put(chave: string): Promise<void> {
    this.puts.push(chave);
    return Promise.resolve();
  }
}

function fetchCom402(urls: string[]): typeof fetch {
  return (entrada: Request | string | URL): Promise<Response> => {
    urls.push(
      typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url,
    );
    return Promise.resolve(new Response(CORPO_402, { status: 402 }));
  };
}

function ambiente(db: FakeD1, r2: FakeR2): Env {
  return {
    DB: db as unknown as D1Database,
    WORKFLOW: {},
    OPENROUTER_API_KEY: "sk-teste-sem-valor-real",
    REPORTS: r2 as unknown as R2Bucket,
    RADAR_QUANT_INGEST_URL: "https://radar.exemplo.test",
    STRATEGIST_MAX_TOKENS: "8000",
  } as unknown as Env;
}

function evento(): WorkflowEvent<MorningCallParams> {
  return { payload: {}, timestamp: INSTANTE } as unknown as WorkflowEvent<MorningCallParams>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("falha terminal do step strategist", () => {
  it("fecha a run como failed no instante em que o motor desiste, e não publica nada", async () => {
    const db = new FakeD1();
    const r2 = new FakeR2();
    const urls: string[] = [];
    vi.stubGlobal("fetch", fetchCom402(urls));

    let escritasNoEsgotamento: Escrita[] = [];
    let erroNoEsgotamento: unknown;
    const step = criarStepFalso({
      tentativas: TENTATIVAS_DO_MOTOR,
      prontos: { "init-snapshot": STEP1_PRONTO },
      aoEsgotar: (erro) => {
        erroNoEsgotamento = erro;
        escritasNoEsgotamento = [...db.escritas];
      },
    });

    const workflow = new MorningCallWorkflow({} as unknown as ExecutionContext, ambiente(db, r2));

    await expect(workflow.run(evento(), comoWorkflowStep(step))).rejects.toThrow("402");

    // (1) O desfecho já está no disco antes de o erro sair do step.
    const falhaNoEsgotamento = escritasDeFalha(escritasNoEsgotamento, TRADE_DATE);
    expect(falhaNoEsgotamento).toHaveLength(TENTATIVAS_DO_MOTOR);
    const ultima = falhaNoEsgotamento.at(-1)!;
    expect(ultima.sql).toContain("status = 'failed'");
    expect(String(erroNoEsgotamento)).toContain("OpenRouter HTTP 402");

    // (2) Nada é publicado sem a saída do strategist (item 3 do contrato).
    expect(escritasEm(db.escritas, "insert into reports")).toHaveLength(0);
    expect(escritasEm(db.escritas, "insert into trades")).toHaveLength(0);
    expect(r2.puts).toHaveLength(0);
    expect(urls.some((u) => u.includes("radar.exemplo.test"))).toBe(false);

    // (3) O step que publicaria nunca rodou.
    expect(step.executados).toContain("strategist");
    expect(step.executados).not.toContain("gates-report");

    // (4) O catch de topo continua como segunda rede: 7 tentativas do step + 1 do catch.
    expect(escritasDeFalha(db.escritas, TRADE_DATE)).toHaveLength(TENTATIVAS_DO_MOTOR + 1);
  });

  it("falha do proprio step 1 (leitura do D1) tambem fecha a run", async () => {
    const db = new FakeD1({ firstError: new Error("D1_ERROR: no such table: runs") });
    const r2 = new FakeR2();
    const urls: string[] = [];
    vi.stubGlobal("fetch", fetchCom402(urls));

    let escritasNoEsgotamento: Escrita[] = [];
    const step = criarStepFalso({
      tentativas: TENTATIVAS_DO_MOTOR,
      aoEsgotar: () => {
        escritasNoEsgotamento = [...db.escritas];
      },
    });

    const workflow = new MorningCallWorkflow({} as unknown as ExecutionContext, ambiente(db, r2));

    await expect(workflow.run(evento(), comoWorkflowStep(step))).rejects.toThrow("D1_ERROR");

    expect(step.executados).toEqual(["init-snapshot"]);
    expect(escritasDeFalha(escritasNoEsgotamento, TRADE_DATE)).toHaveLength(TENTATIVAS_DO_MOTOR);
    expect(escritasEm(db.escritas, "insert into reports")).toHaveLength(0);
  });
});
