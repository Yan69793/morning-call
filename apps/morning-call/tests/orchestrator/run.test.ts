import { describe, expect, it, vi } from "vitest";
import { runMorningCall } from "../../src/orchestrator/run.js";
import type { StrategistRaw } from "../../src/agents/strategist.js";
import type { Env } from "../../src/env.js";
import type { DataProvider } from "../../src/data/types.js";
import type { DataPoint } from "../../src/schemas/data.js";

/**
 * Para os testes que passam isso como fetchFn: forca falha imediata em qualquer fetch, sem
 * depender de rede real. Os testes pre-existentes que nao passam fetchFn continuam tentando
 * scraping real (e caindo no fallback estatico via catch) — comportamento anterior, inalterado.
 */
const rejectFetch = (() =>
  Promise.reject(new Error("sem rede em teste"))) as unknown as typeof fetch;

const env = {} as Env;

const mockProvider: DataProvider = {
  name: "mock",
  fetch(ctx) {
    const p: DataPoint = {
      status: "OK",
      key: "SELIC_META",
      quantity: { value: 15, unit: "pct" },
      venue: "BR",
      source: { name: "mock", tier: 3, retrieved_at: ctx.observedAt },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: ctx.observedAt,
    };
    const fx: DataPoint = {
      status: "OK",
      key: "USDBRL",
      quantity: { value: 5.07, unit: "BRL_por_USD" },
      venue: "BR",
      source: { name: "mock", tier: 3, retrieved_at: ctx.observedAt },
      as_of: "2026-07-14T18:00:00.000Z",
      observed_at: ctx.observedAt,
    };
    return Promise.resolve([p, fx]);
  },
};

const rationale =
  "Premissa operacional com mais de vinte caracteres para passar o schema Rationale.";

function mockContent() {
  return JSON.stringify({
    abertura: {
      tensao_macro_dominante: rationale,
      regime: "transicao",
      vies: "neutro",
      conviccao: 5,
      premissa_que_sustenta_precos: rationale,
      fato_que_quebraria: rationale,
    },
    quant_claims: [{ snapshot_key: "SELIC_META", valor_citado: { value: 15, unit: "pct" } }],
    trades: [],
    cenarios: [
      {
        nome: "base",
        probabilidade_pct: 40,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
      {
        nome: "bull",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
      {
        nome: "bear",
        probabilidade_pct: 25,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
      {
        nome: "cisne_cinza",
        probabilidade_pct: 10,
        gatilhos_observaveis: ["x"],
        vencedores: [],
        perdedores: [],
        operacao_preferida: "nada",
        hedge: "caixa",
        sinal_confirmacao: "a",
        sinal_invalidacao: "b",
      },
    ],
    rastreabilidade: {
      fatos_verificados: ["selic 15"],
      interpretacoes: [],
      hipoteses: [],
      dados_incompletos: [],
    },
  });
}

describe("runMorningCall dryRun", () => {
  it("aborta em fim de semana", async () => {
    const r = await runMorningCall({
      env,
      tradeDate: "2026-07-18",
      dryRun: true,
      providers: [mockProvider],
    });
    expect(r.aborted).toBe(true);
  });

  it("gera MorningCall com trades vazios (não operar)", async () => {
    const r = await runMorningCall({
      env,
      tradeDate: "2026-07-15",
      dryRun: true,
      providers: [mockProvider],
      mockStrategistContent: mockContent(),
    });
    expect(r.aborted).toBe(false);
    expect(r.morningCall).toBeDefined();
    expect(r.morningCall!.trades).toHaveLength(0);
    expect(r.validation?.aprovado).toBe(true);
    expect(r.publishedCount).toBe(0);
  });
});

/**
 * Gates de eco do prompt (ver detectPromptEcho em agents/strategist.ts e agents/calendar.ts).
 * O strategist aborta a rodada inteira porque trades sao o entregavel principal; o calendario e
 * best-effort e so descarta a propria agenda, sem derrubar o resto do pipeline.
 */
describe("runMorningCall — gates de eco do prompt", () => {
  it("aborta quando o strategist ecoa o prompt em vez de analisar o snapshot", async () => {
    const raw = JSON.parse(mockContent()) as StrategistRaw;
    raw.abertura.tensao_macro_dominante = "<<tensão macro dominante do dia, 20+ caracteres>>";

    const r = await runMorningCall({
      env,
      tradeDate: "2026-07-15",
      dryRun: true,
      providers: [mockProvider],
      mockStrategistContent: JSON.stringify(raw),
    });

    expect(r.aborted).toBe(true);
    expect(r.reason).toContain("eco do prompt");
  });

  it("nao aborta quando o calendario ecoa o prompt, so descarta a agenda fabricada", async () => {
    const calendarComEco = JSON.stringify({
      resumo:
        "<<resumo do dia em 1-3 frases, baseado nos eventos_crus recebidos, 10+ caracteres>>",
      nivel_alerta: "baixo",
      eventos: [],
      plano_pregao: {
        antes_abertura: ["Checar fechamento dos mercados internacionais durante a noite."],
        durante_pregao: ["Acompanhar fluxo e volume ao longo do pregao normalmente."],
        proximo_fechamento: ["Reavaliar exposicao overnight conforme o dia."],
      },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const r = await runMorningCall({
        env: { OPENROUTER_API_KEY: "test-key" } as Env,
        tradeDate: "2026-07-15",
        dryRun: true,
        providers: [mockProvider],
        mockStrategistContent: mockContent(),
        mockCalendarContent: calendarComEco,
        fetchFn: rejectFetch,
      });

      // Rodada inteira segue normal: eco no calendario nao e motivo para abortar o Morning Call.
      expect(r.aborted).toBe(false);
      expect(r.morningCall).toBeDefined();

      const ecoLogado = logSpy.mock.calls.some(([line]) => {
        try {
          const parsed = JSON.parse(String(line)) as { event?: string };
          return parsed.event === "orchestrator_calendar_prompt_echo";
        } catch {
          return false;
        }
      });
      expect(ecoLogado).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});
