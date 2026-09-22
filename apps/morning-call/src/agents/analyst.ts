/**
 * Etapa 2 da cadeia nova (10/09/2026): analyst.
 *
 * `deepseek/deepseek-v4-flash-0731` SEM web search. Recebe exclusivamente o texto da pesquisa e
 * a lista de fontes com proveniência, e devolve JSON estruturado.
 *
 * Todo fato sai daqui com url, título, domínio e janela. Fato cuja fonte não consta da pesquisa
 * não é descartado em silêncio nem promovido a fato: sai marcado como não verificável, com o
 * motivo. É a diferença entre "o modelo não inventa fonte" e "a gente não tem como provar que
 * ele não inventou".
 */
import { z } from "zod";
import { chatCompletion, resolverProvedor, type Provedor } from "./openrouter.js";
import { RESEARCH_QUERY, formatarFontes, type FontePesquisada, type Janela } from "./research.js";

export const JANELAS = ["24h", "contexto", "indeterminado"] as const;

const FatoObjeto = z.object({
  texto: z.string().min(1),
  fonte_url: z.string().nullish(),
  fonte_titulo: z.string().nullish(),
  janela: z.enum(JANELAS).nullish(),
});

const FatoBruto = z.union([z.string().min(1), FatoObjeto]);

const FonteBruta = z.union([
  z.string().min(1),
  z.object({ url: z.string().min(1), titulo: z.string().nullish() }),
]);

/** Contrato bruto do JSON do analyst, antes da checagem de proveniência. */
export const ResearchBriefBruto = z.object({
  drivers: z.array(FatoBruto).default([]),
  brasil: z.array(FatoBruto).default([]),
  exterior: z.array(FatoBruto).default([]),
  geopolitica: z.array(FatoBruto).default([]),
  impactos_ativos: z.array(FatoBruto).default([]),
  riscos: z.array(FatoBruto).default([]),
  fontes: z.array(FonteBruta).default([]),
});
export type ResearchBriefBruto = z.infer<typeof ResearchBriefBruto>;

export interface FatoAnalisado {
  texto: string;
  fonte_url: string | null;
  fonte_titulo: string | null;
  dominio: string | null;
  janela: Janela;
  /** Fonte encontrada na pesquisa, com URL idêntica. */
  verificavel: boolean;
  motivo_nao_verificavel: string | null;
}

export interface BriefAnalisado {
  drivers: FatoAnalisado[];
  brasil: FatoAnalisado[];
  exterior: FatoAnalisado[];
  geopolitica: FatoAnalisado[];
  impactos_ativos: FatoAnalisado[];
  riscos: FatoAnalisado[];
  fontes_utilizadas: string[];
  total_fatos: number;
  nao_verificaveis: number;
}

const SECOES = [
  "drivers",
  "brasil",
  "exterior",
  "geopolitica",
  "impactos_ativos",
  "riscos",
] as const;

type Secao = (typeof SECOES)[number];

function dominioDeUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "?";
  }
}

export function normalizarFato(
  bruto: string | z.infer<typeof FatoObjeto>,
  catalogo: FontePesquisada[],
): FatoAnalisado {
  const base =
    typeof bruto === "string"
      ? {
          texto: bruto,
          fonte_url: null as string | null,
          fonte_titulo: null as string | null,
          janela: null as Janela | null,
        }
      : {
          texto: bruto.texto,
          fonte_url: bruto.fonte_url ?? null,
          fonte_titulo: bruto.fonte_titulo ?? null,
          janela: bruto.janela ?? null,
        };

  if (!base.fonte_url) {
    return {
      ...base,
      dominio: null,
      janela: base.janela ?? "indeterminado",
      verificavel: false,
      motivo_nao_verificavel: "fato sem fonte declarada",
    };
  }

  const porUrl = catalogo.find((f) => f.url === base.fonte_url);
  if (porUrl) {
    return {
      texto: base.texto,
      fonte_url: porUrl.url,
      fonte_titulo: base.fonte_titulo ?? porUrl.title,
      dominio: porUrl.dominio,
      // A janela vem da citação verificada, não do texto gerado: quem classifica freshness é o
      // dado da pesquisa. O modelo pode escrever "24h" num fato de agosto.
      janela: porUrl.janela,
      verificavel: true,
      motivo_nao_verificavel: null,
    };
  }

  const dominioDeclarado = dominioDeUrl(base.fonte_url);
  const porDominio = catalogo.find((f) => f.dominio === dominioDeclarado);
  return {
    texto: base.texto,
    fonte_url: base.fonte_url,
    fonte_titulo: base.fonte_titulo,
    dominio: porDominio?.dominio ?? (dominioDeclarado === "?" ? null : dominioDeclarado),
    janela: base.janela ?? "indeterminado",
    verificavel: false,
    motivo_nao_verificavel: porDominio
      ? "URL não consta da pesquisa (domínio conhecido)"
      : "fonte fora da pesquisa",
  };
}

export function validarBrief(bruto: ResearchBriefBruto, catalogo: FontePesquisada[]): BriefAnalisado {
  const secoes = {} as Record<Secao, FatoAnalisado[]>;
  let total = 0;
  let naoVerificaveis = 0;
  for (const secao of SECOES) {
    const fatos = bruto[secao].map((f) => normalizarFato(f, catalogo));
    secoes[secao] = fatos;
    total += fatos.length;
    naoVerificaveis += fatos.filter((f) => !f.verificavel).length;
  }
  // Só entra em `fontes_utilizadas` a URL que existe de fato na pesquisa: URL inventada pelo
  // modelo não é "fonte usada", é o registro de que ele tentou citar algo que não existe.
  const citadas = SECOES.flatMap((s) => secoes[s])
    .filter((f) => f.verificavel)
    .map((f) => f.fonte_url)
    .filter((u): u is string => Boolean(u));
  return {
    ...secoes,
    fontes_utilizadas: [...new Set(citadas)],
    total_fatos: total,
    nao_verificaveis: naoVerificaveis,
  };
}

export interface AnalystResult {
  ok: boolean;
  motivo?: string;
  brief: BriefAnalisado | null;
  bruto: ResearchBriefBruto | null;
  modelo: string;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number;
}

export interface RunAnalystInput {
  apiKey: string;
  model: string;
  fontes: FontePesquisada[];
  /** Texto devolvido pela pesquisa. É o único material factual que o analyst recebe. */
  pesquisa: string;
  query?: string;
  maxTokens?: number;
  /**
   * Esforço de raciocínio pedido ao provedor. `none` desliga o pensamento pago; se o provedor
   * recusar o valor, cair para `minimal` (medido em 10/09). `null` não manda o campo e reproduz o
   * comportamento anterior — existe só para medir o ganho.
   */
  reasoningEffort?: string | null;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Provedor da chamada. Ausente = OpenRouter. */
  provedor?: Provedor;
  /** @deprecated Apelido de `provedor: "deepseek"`. */
  deepseekApi?: boolean;
}

export function buildAnalystPrompts(input: {
  query: string;
  fontes: FontePesquisada[];
  pesquisa: string;
}): { system: string; user: string } {
  const system = [
    "Você é analista macro objetivo para um Morning Call brasileiro.",
    "Você NÃO pesquisa. Use exclusivamente o material fornecido.",
    "Toda afirmação precisa apontar para uma das fontes listadas, por URL idêntica.",
    "Se não houver fonte para um fato, não invente URL: deixe fonte_url null.",
    "Responda SOMENTE com JSON válido, sem markdown e sem texto fora do JSON.",
  ].join(" ");
  const user = [
    "CONSULTA ORIGINAL:",
    input.query,
    "",
    "FONTES DA PESQUISA (só estas existem; o selo indica a janela):",
    formatarFontes(input.fontes),
    "",
    "MATERIAL PESQUISADO:",
    input.pesquisa.slice(0, 24000),
    "",
    "Responda com este formato exato:",
    '{"drivers":[{"texto":"...","fonte_url":"https://...","fonte_titulo":"...","janela":"24h"}],',
    '"brasil":[],"exterior":[],"geopolitica":[],"impactos_ativos":[],"riscos":[],"fontes":[{"url":"https://...","titulo":"..."}]}',
    "Cada item das listas é um objeto nesse formato. Fatos fora da janela de 24h entram com janela \"contexto\" e são declarados como contexto. Nenhuma URL que não esteja na lista de fontes.",
  ].join("\n");
  return { system, user };
}

export function extrairJson(content: string): unknown {
  const semFence = content
    .replace(/^\s*```(?:json)?\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const inicio = semFence.indexOf("{");
  const fim = semFence.lastIndexOf("}");
  const alvo = inicio >= 0 && fim > inicio ? semFence.slice(inicio, fim + 1) : semFence;
  return JSON.parse(alvo);
}

export async function runAnalyst(input: RunAnalystInput): Promise<AnalystResult> {
  const query = input.query ?? RESEARCH_QUERY;
  const prompts = buildAnalystPrompts({ query, fontes: input.fontes, pesquisa: input.pesquisa });
  const r = await chatCompletion({
    apiKey: input.apiKey,
    model: input.model,
    provedor: resolverProvedor(input),
    messages: [
      { role: "system", content: prompts.system },
      { role: "user", content: prompts.user },
    ],
    responseFormatJson: true,
    // Com `reasoning.effort: none` o pensamento pago sai da conta e o teto passa a cobrir só o
    // JSON. Medido em 10/09/2026 no mesmo input: 3500 estourou e o JSON quebrou no parse (teto
    // atingido, 23 fatos pretendidos), 5000 fechou em 2955 tokens de saída com 15 fatos. O teto
    // fica em 5000 — é o menor valor observado com folga, não o mínimo teórico.
    maxTokens: input.maxTokens ?? 5000,
    // `reasoningEffort: null` reproduz o comportamento anterior (raciocínio livre) e existe só como
    // controle de medição; `undefined` cai no default otimizado.
    ...(input.reasoningEffort === null
      ? {}
      : { reasoning: { effort: input.reasoningEffort ?? "none" } }),
    timeoutMs: input.timeoutMs ?? 240_000,
    fetchFn: input.fetchFn,
  });

  const meta = {
    modelo: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    reasoningTokens: r.reasoningTokens,
  };

  let bruto: ResearchBriefBruto;
  try {
    const parsed = ResearchBriefBruto.safeParse(extrairJson(r.content));
    if (!parsed.success) {
      return {
        ok: false,
        motivo: `JSON fora do contrato: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
          .slice(0, 300)}`,
        brief: null,
        bruto: null,
        ...meta,
      };
    }
    bruto = parsed.data;
  } catch (err) {
    return {
      ok: false,
      motivo: `JSON inválido: ${err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido"}`,
      brief: null,
      bruto: null,
      ...meta,
    };
  }

  return { ok: true, brief: validarBrief(bruto, input.fontes), bruto, ...meta };
}
