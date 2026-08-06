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

export const PROMPT_VERSION = "calendar@2026-08-06-v2";

/* ------------------------------------------------------------------ */
/* System prompt                                                        */
/* ------------------------------------------------------------------ */

export function buildCalendarSystemPrompt(opts?: { incluirSchema?: boolean }): string {
  const partes = [
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
    "Responda APENAS JSON, sem cerca de markdown.",
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
    "O esqueleto abaixo define A FORMA, nunca o conteudo. Texto entre << e >> e instrucao do que",
    "escrever naquele campo, nao texto para copiar. Nenhum << ou >> pode sobrar na sua resposta.",
    "Nunca reaproveite resumo, sensibilidade, cenario ou item do plano de pregao do esqueleto:",
    "tudo sai dos eventos_crus fornecidos e da sua analise do dia.",
    "",
    "ESQUELETO (forma, nao conteudo):",
    JSON.stringify(CALENDAR_SKELETON, null, 2),
  ];
  if (opts?.incluirSchema) {
    partes.push(
      "",
      "A resposta precisa satisfazer este JSON Schema:",
      JSON.stringify(buildCalendarJsonSchema()),
    );
  }
  return partes.join("\n");
}

/**
 * Esqueleto de FORMA, no mesmo padrao do strategist (agents/strategist.ts). Todo texto e
 * placeholder `<<...>>` e todo numero e zero, de proposito.
 *
 * O prompt v1 trazia aqui um exemplo realista e completo: IPCA a 0.32%, Payroll a 180K, plano de
 * pregao escrito por extenso. O mesmo mecanismo que fez o strategist ecoar por tres semanas
 * (2026-07-16 a 2026-08-06, ver o comentario em strategist.ts) se aplica aqui: nada do lado do
 * modelo distingue "exemplo plausivel" de "resposta plausivel". Diferente do strategist, nao
 * houve confirmacao por amostragem no D1 para este agente especifico ainda — a consulta remota
 * ficou bloqueada por permissao insuficiente do token nesta sessao (erro 7403). Este fix e
 * preventivo por semelhanca estrutural com o defeito ja medido no strategist, nao a correcao de
 * um eco ja confirmado neste agente.
 *
 * O delimitador `<<` `>>` existe para ser detectavel: `detectPromptEcho` reprova a rodada se
 * algum vazar para a saida.
 */
const CALENDAR_SKELETON = {
  resumo: "<<resumo do dia em 1-3 frases, baseado nos eventos_crus recebidos, 10+ caracteres>>",
  nivel_alerta: "<<um de: baixo|moderado|elevado|critico|indisponivel>>",
  eventos: [
    {
      hora_brt: "<<HH:MM, copiado do evento correspondente em eventos_crus>>",
      evento: "<<nome do evento, copiado do evento correspondente em eventos_crus>>",
      pais: "<<um de: BR|EUA|CN|JP|EZ|UK|GLOBAL, copiado do evento correspondente>>",
      importancia: "<<alta, media ou baixa>>",
      consenso: { value: 0, unit: "<<unit, ou usar null se o evento nao tiver consenso numerico>>" },
      anterior: { value: 0, unit: "<<unit, ou usar null se o evento nao tiver valor anterior>>" },
      sensibilidade: "<<como o dado afeta taxas, moedas, bolsas e commodities, 10+ caracteres>>",
      ativos_expostos: ["<<ativo exposto, ex.: DI1, IBOV, USDBRL, SPX, UST, DXY>>"],
      cenario_benigno: "<<o que acontece se o dado vier dentro ou melhor que o esperado, 10+ caracteres>>",
      cenario_adverso: "<<o que acontece se o dado vier pior que o esperado, 10+ caracteres>>",
      condicao_operar: "<<o que precisa acontecer para montar ou desmontar posicao, 10+ caracteres>>",
    },
  ],
  plano_pregao: {
    antes_abertura: ["<<acao concreta antes da abertura, 10+ caracteres>>"],
    durante_pregao: ["<<acao concreta durante o pregao, 10+ caracteres>>"],
    proximo_fechamento: ["<<acao concreta proximo ao fechamento, 10+ caracteres>>"],
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
/* Deteccao de eco do prompt                                            */
/* ------------------------------------------------------------------ */

/**
 * Trechos que o prompt v1 mandava para o modelo nos campos generativos. Nao inclui evento,
 * hora_brt, pais nem ticker de ativos_expostos: esses vem do scraper e devem mesmo se repetir
 * mes a mes quando o mesmo indicador volta ("IPCA (IBGE)" nao e eco, e o evento certo em dia de
 * IPCA de verdade). O fingerprint cobre só resumo, sensibilidade, cenario_benigno, cenario_adverso,
 * condicao_operar e plano_pregao, os campos onde a resposta deveria ser analise original.
 */
const IMPRESSOES_DIGITAIS_V1 = [
  "Dia carregado: IPCA no Brasil pela manha e Payroll nos EUA ao meio-dia. Ata do FOMC a tarde pode trazer volatilidade adicional.",
  "IPCA acima do consenso reduz probabilidade de corte da Selic no curto prazo, pressionando duration e bolsa",
  "IPCA <= 0.30%: alivio na curva de juros, IBOV sobe, real se fortalece",
  "IPCA >= 0.50%: estresse em duration, IBOV cai, dolar sobe acima de 5.15",
  "Montar compra de IBOV apos o dado se IPCA vier abaixo de 0.30% e DI1 abrir em queda",
  "Payroll acima do consenso fortalece o dolar e pressiona emergentes; abaixo enfraquece DXY e beneficia carry trade",
  "Payroll entre 150K-200K: soft landing, SPX sobe, dolar estavel",
  "Payroll acima de 250K: temor de alta de juros, SPX cai, DXY sobe, EM sofre",
  "Zerar posicoes direcionais em Brasil 30min antes do dado; reentrar apos confirmacao de direcao",
  "Verificar fechamento dos indices asiaticos e europeus para ajustar vies inicial",
  "Monitorar abertura da curva DI e pre-abertura do IBOV",
  "Reduzir exposicao 30min antes do Payroll (10:30 BRT)",
  "Reentrar posicoes apos Payroll conforme direcao confirmada",
  "Aguardar Ata do FOMC as 14:00 antes de adicionar risco direcional",
  "Avaliar se eventos do dia confirmaram ou invalidaram o cenario base",
  "Ajustar hedges para o overnight conforme resultado dos eventos",
] as const;

/** Mesmos limiares do strategist (agents/strategist.ts). Ver comentario la para o racional. */
const ECHO_FRASE_LONGA = 40;
const ECHO_MIN_CURTAS = 3;

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    // \p{M} = marcas combinantes. Depois do NFD, e o que sobra de acento separado da letra base.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function coletarStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") {
    out.push(v);
  } else if (Array.isArray(v)) {
    for (const item of v) coletarStrings(item, out);
  } else if (v !== null && typeof v === "object") {
    for (const item of Object.values(v)) coletarStrings(item, out);
  }
  return out;
}

/**
 * Detecta que a resposta e eco do prompt, nao analise dos eventos_crus. Devolve os motivos;
 * lista vazia significa saida propria.
 *
 * Mesma logica do strategist, replicada aqui em vez de compartilhada: os dois agentes tem schemas
 * diferentes, e manter cada gate no proprio arquivo do agente evita acoplar os dois por um modulo
 * comum que nenhum dos dois pediu.
 */
export function detectPromptEcho(raw: z.infer<typeof CalendarAgentRaw>): string[] {
  const motivos: string[] = [];
  const textos = coletarStrings(raw);

  for (const t of textos) {
    if (t.includes("<<") || t.includes(">>")) {
      motivos.push(`placeholder do esqueleto na saida: ${t.slice(0, 60)}`);
    }
  }

  const proibidas = new Map(IMPRESSOES_DIGITAIS_V1.map((f) => [normalizarTexto(f), f]));
  const curtas: string[] = [];
  for (const t of textos) {
    const original = proibidas.get(normalizarTexto(t));
    if (!original) continue;
    if (original.length >= ECHO_FRASE_LONGA) {
      motivos.push(`frase verbatim do prompt v1: ${original.slice(0, 60)}`);
    } else {
      curtas.push(original);
    }
  }
  if (curtas.length >= ECHO_MIN_CURTAS) {
    motivos.push(`${curtas.length} trechos curtos do prompt v1 repetidos: ${curtas.join(" | ")}`);
  }

  return motivos;
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
  /** Motivos de eco do prompt. Vazio = saida propria. Ver `detectPromptEcho`. */
  echo: string[];
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
        // A API da DeepSeek so garante `json_object`, sem schema estrito. Mandar o schema no
        // texto do system prompt devolve a referencia de forma sem depender so do esqueleto.
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
          {
            role: "system",
            content: buildCalendarSystemPrompt({ incluirSchema: input.deepseekApi === true }),
          },
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

  return { agenda, provenance, model: input.model, echo: detectPromptEcho(raw) };
}
