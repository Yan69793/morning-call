import { describe, expect, it } from "vitest";
import {
  buildCalendarSystemPrompt,
  detectPromptEcho,
  parseCalendarContent,
  runCalendarAgent,
} from "../../src/agents/calendar.js";
import type { RawAgendaInput } from "../../src/schemas/agenda.js";

const RUN = "11111111-2222-4333-8444-555555555555";

const rawAgendaInput: RawAgendaInput = {
  trade_date: "2026-07-15",
  fonte: "estatica",
  eventos: [
    {
      hora_brt: "08:00",
      evento: "IPCA mensal",
      pais: "BR",
      importancia_indicativa: "alta",
      consenso: { value: 0.3, unit: "pct" },
      anterior: { value: 0.28, unit: "pct" },
    },
  ],
};

function validCalendarMockJson() {
  return JSON.stringify({
    resumo: "Dia com IPCA e payroll, mercado deve reagir aos dois indicadores pela manha.",
    nivel_alerta: "moderado",
    eventos: [
      {
        hora_brt: "08:00",
        evento: "IPCA mensal",
        pais: "BR",
        importancia: "alta",
        consenso: { value: 0.3, unit: "pct" },
        anterior: { value: 0.28, unit: "pct" },
        sensibilidade: "Dado acima do consenso reduz chance de corte de juros no curto prazo.",
        ativos_expostos: ["DI1", "IBOV"],
        cenario_benigno: "Dado em linha ou abaixo do consenso favorece queda de juros futura.",
        cenario_adverso: "Dado bem acima do consenso pressiona curva de juros para cima.",
        condicao_operar: "Aguardar confirmacao do numero antes de qualquer posicao direcional.",
      },
    ],
    plano_pregao: {
      antes_abertura: ["Checar fechamento dos mercados internacionais durante a noite."],
      durante_pregao: ["Acompanhar reacao da curva de juros logo apos a divulgacao do dado."],
      proximo_fechamento: ["Reavaliar exposicao overnight conforme o resultado do dia."],
    },
  });
}

describe("calendar agent closed-book", () => {
  it("parse + run com mock valido", async () => {
    const result = await runCalendarAgent({
      input: rawAgendaInput,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validCalendarMockJson(),
    });
    expect(result.agenda.eventos).toHaveLength(1);
    expect(result.agenda.nivel_alerta).toBe("moderado");
    expect(result.echo).toEqual([]);
  });

  it("parseCalendarContent rejeita JSON invalido de schema", () => {
    expect(() => parseCalendarContent("{}")).toThrow();
  });
});

/**
 * Mesma classe de defeito corrigida no strategist (agents/strategist.ts): o prompt v1 trazia um
 * exemplo realista e completo, e nada impedia o modelo de devolver o exemplo em vez de analisar
 * os eventos_crus. Sem confirmacao por amostragem no D1 para este agente (consulta bloqueada por
 * permissao de token nesta sessao), o fix aqui e preventivo por semelhanca estrutural, nao a
 * correcao de um eco ja medido neste agente especifico.
 */
describe("eco do prompt", () => {
  it("o system prompt nao contem mais conteudo de mercado plausivel do exemplo v1", () => {
    const prompt = buildCalendarSystemPrompt();
    for (const vazamento of [
      "Dia carregado: IPCA no Brasil pela manha",
      "IPCA <= 0.30%",
      "Zerar posicoes direcionais em Brasil 30min antes do dado",
      "Payroll entre 150K-200K",
    ]) {
      expect(prompt).not.toContain(vazamento);
    }
    // O esqueleto continua ensinando a forma.
    expect(prompt).toContain("plano_pregao");
    expect(prompt).toContain("<<");
  });

  it("inclui o JSON Schema so quando pedido (caminho DeepSeek)", () => {
    expect(buildCalendarSystemPrompt()).not.toContain("JSON Schema");
    const comSchema = buildCalendarSystemPrompt({ incluirSchema: true });
    expect(comSchema).toContain("JSON Schema");
    expect(comSchema).toContain("ativos_expostos");
  });

  it("saida propria nao acusa eco", () => {
    const raw = parseCalendarContent(validCalendarMockJson());
    expect(detectPromptEcho(raw)).toEqual([]);
  });

  it("placeholder do esqueleto vazado reprova", () => {
    const raw = parseCalendarContent(validCalendarMockJson());
    raw.resumo =
      "<<resumo do dia em 1-3 frases, baseado nos eventos_crus recebidos, 10+ caracteres>>";
    const motivos = detectPromptEcho(raw);
    expect(motivos.some((m) => m.includes("placeholder do esqueleto"))).toBe(true);
  });

  it("frase longa verbatim do prompt v1 reprova sozinha", () => {
    const raw = parseCalendarContent(validCalendarMockJson());
    raw.eventos[0]!.cenario_adverso =
      "IPCA >= 0.50%: estresse em duration, IBOV cai, dolar sobe acima de 5.15";
    expect(detectPromptEcho(raw).some((m) => m.includes("verbatim"))).toBe(true);
  });

  it("acento nao escapa da deteccao", () => {
    const raw = parseCalendarContent(validCalendarMockJson());
    // O prompt fica sem acento de proposito (arquivo inteiro segue essa convencao), mas o modelo
    // responde em portugues normal. Comparacao crua deixaria essa variante passar.
    raw.plano_pregao.durante_pregao = ["Reduzir exposição 30min antes do Payroll (10:30 BRT)"];
    expect(detectPromptEcho(raw).some((m) => m.includes("verbatim"))).toBe(true);
  });

  it("nome de evento e ticker legitimos nao acusam eco mesmo repetindo o indicador do mes", () => {
    const raw = parseCalendarContent(validCalendarMockJson());
    raw.eventos[0]!.evento = "IPCA (IBGE)";
    raw.eventos[0]!.ativos_expostos = ["IBOV", "DI1", "USDBRL"];
    expect(detectPromptEcho(raw)).toEqual([]);
  });

  it("runCalendarAgent devolve o diagnostico de eco junto do resultado", async () => {
    const result = await runCalendarAgent({
      input: rawAgendaInput,
      apiKey: "x",
      model: "mock",
      runId: RUN,
      mockContent: validCalendarMockJson(),
    });
    expect(result.echo).toEqual([]);
  });
});
