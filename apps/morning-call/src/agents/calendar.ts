/**
 * Agente de Calendario Economico — analise de impacto de eventos.
 *
 * Closed-book: recebe eventos crus do scraper + fallback estatico.
 * Produz: EconomicAgenda completo com analise de impacto por evento.
 *
 * Diferente do strategist, este agente NAO gera eventos — apenas analisa
 * os eventos fornecidos. A precisao factual (data, hora, consenso) vem do scraper.
 */
import { z } from "zod";
import { chatCompletion } from "./openrouter.js";
import {
  CalendarAgentRaw,
  type RawAgendaInput,
  type EconomicAgenda,
} from "../schemas/agenda.js";
import type { Provenance } from "../schemas/common.js";

export const PROMPT_VERSION = "calendar@2026-07-16-v1";

/* ------------------------------------------------------------------ */
/* System prompt                                                        */
/* ------------------------------------------------------------------ */

export function buildCalendarSystemPrompt(): string {
  return [
    "Voce e analista de agenda economica. Sua funcao e analisar o impacto de eventos economicos nos ativos financeiros.",
    "Closed-book: use APENAS os eventos fornecidos no JSON de entrada. NAO invente eventos, horarios, consensos ou dados.",
    "",
    "Para cada evento, voce deve:",
    "1. Confirmar ou ajustar a importancia (alta/media/baixa) com base no contexto de mercado atual",
    "2. Descrever a sensibilidade: como o dado afeta taxas, moedas, bolsas e commodities",
    "3. Listar os ativos expostos (ex.: DI1, IBOV, USDBRL, SPX, UST, DXY)",
    "4. Descrever o cenario benigno (dado dentro ou melhor que o esperado)",
    "5. Descrever o cenario adverso (dado pior que o esperado)",
    "6. Sugerir condicao para operar: o que precisa acontecer para montar/desmontar posicao",
    "",
    "Responda APENAS JSON. Siga EXATAMENTE o formato do exemplo abaixo.",
    "Todo valor + unidade e objeto {value, unit}. NUNCA numero solto.",
    "Unit valida: BRL, USD, BRL_por_USD, pct, bps, index_points, ratio, contratos.",
    "pais: BR, EUA, CN, JP, EZ, UK, GLOBAL.",
    "importancia: alta, media, baixa.",
    "nivel_alerta: baixo (ate 2 eventos altos), moderado (3-4), elevado (5-6), critico (7+).",
    "",
    "Se a lista de eventos_crus estiver vazia, gere uma agenda de dia calmo:",
    "  - nivel_alerta: 'baixo'",
    "  - resumo: explique que nao ha eventos relevantes e o mercado deve operar com foco em aspectos tecnicos e fluxo",
    "  - eventos: array vazio []",
    "  - plano_pregao: acoes genericas de monitoramento (verificar abertura, acompanhar fluxo, ajustar hedges)",
    "",
    "EXEMPLO DE FORMATO CORRETO:",
    JSON.stringify(CALENDAR_EXAMPLE, null, 2),
  ].join("\n");
}

const CALENDAR_EXAMPLE = {
  resumo:
    "Dia carregado: IPCA no Brasil pela manha e Payroll nos EUA ao meio-dia. Ata do FOMC a tarde pode trazer volatilidade adicional.",
  nivel_alerta: "elevado",
  eventos: [
    {
      hora_brt: "08:00",
      evento: "IPCA (IBGE)",
      pais: "BR",
      importancia: "alta",
      consenso: { value: 0.32, unit: "pct" },
      anterior: { value: 0.25, unit: "pct" },
      sensibilidade:
        "IPCA acima do consenso reduz probabilidade de corte da Selic no curto prazo, pressionando duration e bolsa",
      ativos_expostos: ["DI1", "IBOV", "USDBRL", "NTNB"],
      cenario_benigno:
        "IPCA <= 0.30%: alivio na curva de juros, IBOV sobe, real se fortalece",
      cenario_adverso:
        "IPCA >= 0.50%: estresse em duration, IBOV cai, dolar sobe acima de 5.15",
      condicao_operar:
        "Montar compra de IBOV apos o dado se IPCA vier abaixo de 0.30% e DI1 abrir em queda",
    },
    {
      hora_brt: "10:30",
      evento: "Payroll (BLS)",
      pais: "EUA",
      importancia: "alta",
      consenso: { value: 180, unit: "pct" },
      anterior: { value: 152, unit: "pct" },
      sensibilidade:
        "Payroll acima do consenso fortalece o dolar e pressiona emergentes; abaixo enfraquece DXY e beneficia carry trade",
      ativos_expostos: ["SPX", "DXY", "USDBRL", "UST", "IBOV"],
      cenario_benigno:
        "Payroll entre 150K-200K: soft landing, SPX sobe, dolar estavel",
      cenario_adverso:
        "Payroll acima de 250K: temor de alta de juros, SPX cai, DXY sobe, EM sofre",
      condicao_operar:
        "Zerar posicoes direcionais em Brasil 30min antes do dado; reentrar apos confirmacao de direcao",
    },
  ],
  plano_pregao: {
    antes_abertura: [
      "Verificar fechamento dos indices asiaticos e europeus para ajustar vies inicial",
      "Monitorar abertura da curva DI e pre-abertura do IBOV",
    ],
    durante_pregao: [
      "Reduzir exposicao 30min antes do Payroll (10:30 BRT)",
      "Reentrar posicoes apos Payroll conforme direcao confirmada",
      "Aguardar Ata do FOMC as 14:00 antes de adicionar risco direcional",
    ],
    proximo_fechamento: [
      "Avaliar se eventos do dia confirmaram ou invalidaram o cenario base",
      "Ajustar hedges para o overnight conforme resultado dos eventos",
    ],
  },
};

/* ------------------------------------------------------------------ */
/* JSON Schema para Structured Output                                  */
/* ------------------------------------------------------------------ */

export function buildCalendarJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      resumo: { type: "string" },
      nivel_alerta: {
        type: "string",
        enum: ["baixo", "moderado", "elevado", "critico", "indisponivel"],
      },
      eventos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            hora_brt: { type: "string" },
            evento: { type: "string" },
            pais: {
              type: "string",
              enum: ["BR", "EUA", "CN", "JP", "EZ", "UK", "GLOBAL"],
            },
            importancia: {
              type: "string",
              enum: ["alta", "media", "baixa"],
            },
            consenso: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            anterior: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string" } },
              required: ["value", "unit"],
            },
            sensibilidade: { type: "string" },
            ativos_expostos: {
              type: "array",
              items: { type: "string" },
            },
            cenario_benigno: { type: "string" },
            cenario_adverso: { type: "string" },
            condicao_operar: { type: "string" },
          },
          required: [
            "hora_brt",
            "evento",
            "pais",
            "importancia",
            "sensibilidade",
            "ativos_expostos",
            "cenario_benigno",
            "cenario_adverso",
            "condicao_operar",
          ],
        },
      },
      plano_pregao: {
        type: "object",
        properties: {
          antes_abertura: { type: "array", items: { type: "string" } },
          durante_pregao: { type: "array", items: { type: "string" } },
          proximo_fechamento: { type: "array", items: { type: "string" } },
        },
        required: ["antes_abertura", "durante_pregao", "proximo_fechamento"],
      },
    },
    required: ["resumo", "nivel_alerta", "eventos", "plano_pregao"],
  };
}

/* ------------------------------------------------------------------ */
/* User prompt builder                                                  */
/* ------------------------------------------------------------------ */

export function buildCalendarUserPrompt(input: RawAgendaInput): string {
  return JSON.stringify(
    {
      trade_date: input.trade_date,
      fonte_dados: input.fonte,
      eventos_crus: input.eventos.map((e) => ({
        hora_brt: e.hora_brt,
        evento: e.evento,
        pais: e.pais,
        importancia_indicativa: e.importancia_indicativa ?? "nao informada",
        consenso: e.consenso ?? null,
        anterior: e.anterior ?? null,
      })),
      instrucao:
        "Analise cada evento. Para cada um, produza: sensibilidade, ativos_expostos, cenario_benigno, cenario_adverso, condicao_operar. Se o evento nao tiver consenso numerico (ex.: discurso, ata), deixe consenso como null. Gere tambem resumo, nivel_alerta e plano_pregao. NAO invente eventos — use apenas os fornecidos em eventos_crus.",
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ */
/* Parse                                                                */
/* ------------------------------------------------------------------ */

export function parseCalendarContent(content: string): z.infer<typeof CalendarAgentRaw> {
  const trimmed = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const json = JSON.parse(trimmed) as unknown;
  return CalendarAgentRaw.parse(json);
}

/* ------------------------------------------------------------------ */
/* Run                                                                  */
/* ------------------------------------------------------------------ */

export interface RunCalendarInput {
  input: RawAgendaInput;
  apiKey: string;
  model: string;
  runId: string;
  fetchFn?: typeof fetch;
  mockContent?: string;
  deepseekApi?: boolean;
}

export interface RunCalendarResult {
  agenda: EconomicAgenda;
  provenance: Provenance;
  model: string;
}

export async function runCalendarAgent(
  input: RunCalendarInput,
): Promise<RunCalendarResult> {
  const content =
    input.mockContent ??
    (
      await chatCompletion({
        apiKey: input.apiKey,
        model: input.model,
        responseFormatJson: input.deepseekApi ? true : false,
        responseFormatJsonSchema: input.deepseekApi
          ? undefined
          : {
              name: "EconomicCalendar",
              schema: buildCalendarJsonSchema(),
              strict: true,
            },
        maxTokens: 8000,
        deepseekApi: input.deepseekApi,
        messages: [
          { role: "system", content: buildCalendarSystemPrompt() },
          {
            role: "user",
            content: buildCalendarUserPrompt(input.input),
          },
        ],
        fetchFn: input.fetchFn,
      })
    ).content;

  const raw = parseCalendarContent(content);
  const provenance: Provenance = {
    run_id: input.runId,
    model: input.model,
    prompt_version: PROMPT_VERSION,
    generated_at: new Date().toISOString(),
  };

  const agenda: EconomicAgenda = {
    trade_date: input.input.trade_date,
    generated_at: provenance.generated_at,
    resumo: raw.resumo,
    nivel_alerta: raw.nivel_alerta,
    eventos: raw.eventos,
    plano_pregao: raw.plano_pregao,
    provenance,
  };

  return { agenda, provenance, model: input.model };
}
