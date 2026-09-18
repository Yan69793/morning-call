/**
 * Desfecho de falha terminal — comportamento do wrapper de step crítico.
 *
 * Contrato (CTO, cartão pai t_b042ce58): o fechamento da run tem de ser escrito DENTRO do step
 * crítico, antes do rethrow, e não depender do catch de topo do `run()`. Momento do defeito: o
 * step `strategist` morre com HTTP 402, o motor esgota as 7 retentativas e mata a instância — se a
 * escrita só existisse no catch de topo, o que fica no D1 é uma linha presa em `running`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { passoCritico } from "../../src/workflow.js";
import {
  FakeD1,
  TENTATIVAS_DO_MOTOR,
  comoWorkflowStep,
  criarStepFalso,
  escritasDeFalha,
} from "./fake-d1.js";

const TRADE_DATE = "2026-09-16";
const ERRO_402 = new Error("OpenRouter HTTP 402: can only afford 120 tokens");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("passoCritico", () => {
  it("esgotadas as retentativas, a run já está failed antes de o erro sair do step", async () => {
    const db = new FakeD1();
    let noEsgotamento: ReturnType<typeof escritasDeFalha> = [];
    const step = criarStepFalso({
      tentativas: TENTATIVAS_DO_MOTOR,
      aoEsgotar: () => {
        noEsgotamento = escritasDeFalha(db.escritas, TRADE_DATE);
      },
    });

    await expect(
      passoCritico(
        comoWorkflowStep(step),
        "strategist",
        db as unknown as D1Database,
        TRADE_DATE,
        () => Promise.reject(ERRO_402),
      ),
    ).rejects.toThrow("OpenRouter HTTP 402");

    expect(noEsgotamento).toHaveLength(TENTATIVAS_DO_MOTOR);
    const ultima = noEsgotamento.at(-1)!;
    expect(ultima.sql).toContain("status = 'failed'");
    // Guarda do contrato: só fecha o que ainda está running — nunca reabre nem sobrescreve.
    expect(ultima.sql).toContain("status = 'running'");
    expect(ultima.binds).toContain(TRADE_DATE);
  });

  it("escreve em toda tentativa falha, não só na última", async () => {
    const db = new FakeD1();
    const step = criarStepFalso({ tentativas: TENTATIVAS_DO_MOTOR });

    await expect(
      passoCritico(
        comoWorkflowStep(step),
        "strategist",
        db as unknown as D1Database,
        TRADE_DATE,
        () => Promise.reject(ERRO_402),
      ),
    ).rejects.toThrow("OpenRouter HTTP 402");

    expect(escritasDeFalha(db.escritas, TRADE_DATE)).toHaveLength(TENTATIVAS_DO_MOTOR);
  });

  it("step que conclui não escreve nada e devolve o valor", async () => {
    const db = new FakeD1();
    const step = criarStepFalso({ tentativas: TENTATIVAS_DO_MOTOR });

    const resultado = await passoCritico(
      comoWorkflowStep(step),
      "gates-report",
      db as unknown as D1Database,
      TRADE_DATE,
      () => Promise.resolve({ publishedCount: 2 }),
    );

    expect(resultado).toEqual({ publishedCount: 2 });
    expect(db.escritas).toHaveLength(0);
  });

  it("erro do D1 não substitui o erro original do step", async () => {
    const db = new FakeD1({ runError: new Error("D1_ERROR: no such table: runs") });
    const linha = vi.spyOn(console, "log").mockImplementation(() => {});
    const step = criarStepFalso({ tentativas: TENTATIVAS_DO_MOTOR });

    await expect(
      passoCritico(
        comoWorkflowStep(step),
        "strategist",
        db as unknown as D1Database,
        TRADE_DATE,
        () => Promise.reject(ERRO_402),
      ),
    ).rejects.toThrow("OpenRouter HTTP 402");

    const eventos = linha.mock.calls.map((c) => String(c[0]));
    expect(eventos.some((e) => e.includes("workflow_run_failed_step_db_error"))).toBe(true);
    expect(eventos.some((e) => e.includes("D1_ERROR"))).toBe(true);
  });
});
