// Regressão de segurança do Worker morning-call (MC-021/022/028/029, 14/08/2026).
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import type { Env } from "../src/env.js";

function envBase(): Env {
  return {
    DB: {} as D1Database,
    WORKFLOW: { create: () => ({ id: "wf-test" }) },
  } as unknown as Env;
}

describe("CORS fail-closed (MC-021)", () => {
  it("sem CORS_ORIGINS nao ecoa a origem do requisitante", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/health", {
        headers: { Origin: "https://atacante.example" },
      }),
      envBase(),
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("nunca responde '*'", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/health", {
        headers: { Origin: "https://atacante.example" },
      }),
      { ...envBase(), CORS_ORIGINS: "https://ok.example" },
    );
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("com CORS_ORIGINS, a origem listada e ecoada", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/health", {
        headers: { Origin: "https://ok.example" },
      }),
      { ...envBase(), CORS_ORIGINS: "https://ok.example" },
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://ok.example");
  });
});

describe("trigger fail-closed (MC-022/028/029)", () => {
  it("sem TRIGGER_SECRET configurado, header 'debug' nao passa", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/trigger", {
        headers: { "x-trigger-secret": "debug" },
      }),
      envBase(),
    );
    expect(res.status).toBe(401);
  });

  it("secret correto no header cria o workflow", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/trigger", {
        headers: { "x-trigger-secret": "s3" },
      }),
      { ...envBase(), TRIGGER_SECRET: "s3" },
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as unknown as { workflowId?: unknown };
    expect(body.workflowId).toBe("wf-test");
  });

  it("secret errado no header da 401", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/trigger", {
        headers: { "x-trigger-secret": "errado" },
      }),
      { ...envBase(), TRIGGER_SECRET: "s3" },
    );
    expect(res.status).toBe(401);
  });

  it("/trigger-now sem secret fora de producao abre", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/trigger-now"),
      envBase(),
    );
    expect(res.status).toBe(200);
  });

  it("/trigger-now em producao sem secret nega", async () => {
    const res = await worker.fetch(
      new Request("https://morning-call.workers.dev/trigger-now"),
      { ...envBase(), ENVIRONMENT: "production" },
    );
    expect(res.status).toBe(401);
  });
});
